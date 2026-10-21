import { AwsSimulationEngine, emptyTopology } from './core/engine';
import { details } from './ui/card-details';
import type { SqsQueue } from './domain/types';
import { createPreset } from './ui/presets';
import { connectionInfo } from './ui/connections';
import { exportTopology, importTopology } from './domain/serialization';

const assert = (value: unknown, message: string) => { if (!value) throw new Error(message); };
const originalNow = Date.now;
let time = 1000000;
Date.now = () => time;
const engine = new AwsSimulationEngine();
const failures: string[] = [];
const check = (name: string, test: () => void) => {
  try { test(); console.log(`PASS ${name}`); }
  catch (error) { failures.push(String(error)); console.error(`FAIL ${name}: ${error}`); }
};
const q: SqsQueue = {id:'queue',kind:'queue',name:'orders',queueKind:'standard',position:{x:0,y:0},
  delaySeconds:0,visibilityTimeout:30,retentionSeconds:60,longPollingSeconds:0,
  metrics:{sent:0,received:0,available:0,delayed:0,inFlight:0,deleted:0,redriven:0,deduplicated:0,expired:0}};
function setup(delay = 0) {
  engine.load({...emptyTopology(),queues:[{...q,delaySeconds:delay}],
    producers:[{id:'producer',kind:'producer',name:'API',targetId:q.id,sent:0,position:{x:0,y:0}}],
    consumers:[{id:'consumer',kind:'consumer',name:'Worker',queueId:q.id,status:'idle',processed:0,position:{x:0,y:0}}]});
}
try {
  check('Mensagem só aparece na fila após a chegada visual', () => {
    setup();
    engine.sendFromProducer('producer','order',{eventType:'order.created'},{});
    const m = engine.state.topology.messages[0];
    assert(m.state==='publishing','Não deve estar disponível enquanto percorre a conexão');
    assert(engine.queue(q.id)!.metrics.available===0,'Métrica antecipada');
    engine.poll('consumer');
    assert(m.receivedCount===0,'Polling não pode receber antes da chegada');
    time+=849; engine.tick();
    assert(m.state==='publishing','Chegou antes do fim da animação');
    time++; engine.tick();
    assert(String(m.state)==='available','Deve chegar ao fim da animação');
  });
  check('Polling retira a bolinha da fila; DeleteMessage conclui', () => {
    setup();
    engine.sendFromProducer('producer','order',{},{}); time+=850; engine.tick();
    const m=engine.state.topology.messages[0];
    engine.poll('consumer');
    assert(m.state==='in-flight','Polling deve iniciar visibilidade');
    const html=details(engine.queue(q.id)!,engine.state.topology);
    assert(!html.includes(`<i title="in-flight">`),'Mensagem consumida continua desenhada dentro da fila');
    engine.deleteMessage(m.id);
    assert(String(m.state)==='deleted','Exclusão não concluiu');
    assert(engine.queue(q.id)!.metrics.inFlight===0,'Métrica em voo não foi limpa');
  });
  check('Delay começa após chegada e timeout devolve à fila', () => {
    setup(2);
    engine.sendFromProducer('producer','order',{},{}); time+=850; engine.tick();
    const m=engine.state.topology.messages[0];
    assert(m.state==='delayed','Delay deve permanecer após chegada');
    time+=1999; engine.tick(); assert(m.state==='delayed','Delay terminou cedo');
    time++; engine.tick(); engine.poll('consumer');
    assert(String(m.state)==='in-flight','Não recebeu após delay');
    time+=30000; engine.tick();
    assert(String(m.state)==='available','Timeout não devolveu mensagem');
  });
  check('Fan-out acompanha três trechos, sem aparecer antecipadamente', () => {
    engine.load(createPreset('fanout'));
    const p=engine.state.topology.producers[0], template=p.messageTemplate!;
    engine.publishFromProducer(p.id,template.body,template.attributes);
    assert(engine.state.animations.length===2,'Fan-out precisa de duas entregas');
    assert(engine.state.animations.every(a=>a.nodes.length===4&&a.nodes[0]===p.id&&a.duration===2550),'Trajeto do produtor à fila incorreto');
    time+=2549;engine.tick();
    assert(engine.state.topology.messages.every(m=>m.state==='publishing'),'Fan-out chegou cedo');
    time++;engine.tick();
    assert(engine.state.topology.queues.every(q=>q.metrics.available===1),'Cada fila deve receber uma cópia');
  });
  check('Presets alinhados, atributos nas conexões e round-trip', () => {
    for(const name of ['fanout','filter','fifo','retry']) {
      const t=createPreset(name);
      assert(t.producers[0].position.x<t.topics[0].position.x,'Produtor fora da coluna');
      for(const s of t.subscriptions) {
        const queue=t.queues.find(q=>q.id===s.queueId)!;
        assert(s.position.y===queue.position.y&&s.position.x<queue.position.x,'Assinatura desalinhada da fila');
      }
      for(const c of t.consumers) assert(c.position.y===t.queues.find(q=>q.id===c.queueId)!.position.y,'Consumidor desalinhado');
      assert(new Set(t.queues.map(q=>q.position.y)).size===t.queues.length,'Filas sobrepostas');
      assert(connectionInfo(t).some(e=>e.label.includes('eventType=order.created')),'Atributos de exemplo ausentes');
      assert(JSON.stringify(importTopology(exportTopology(t)))===JSON.stringify(t),'Exportação perdeu atributos ou posições');
    }
  });
  check('Filtro e deduplicação dos exemplos são observáveis', () => {
    engine.load(createPreset('filter'));
    let p=engine.state.topology.producers[0], template=p.messageTemplate!;
    engine.publishFromProducer(p.id,template.body,template.attributes);
    time+=2550;engine.tick();
    assert(engine.queue('queue-orders')!.metrics.available===1&&engine.queue('queue-audit')!.metrics.available===0,'Filtro incorreto');
    engine.load(createPreset('fifo'));
    p=engine.state.topology.producers[0];template=p.messageTemplate!;
    engine.publishFromProducer(p.id,template.body,template.attributes,template);
    engine.publishFromProducer(p.id,template.body,template.attributes,template);
    time+=2550;engine.tick();
    assert(engine.queue('queue-orders')!.metrics.available===1,'Duplicata foi entregue');
    assert(engine.state.topology.messages.some(m=>m.state==='deduplicated'),'Duplicata não observável');
  });
  check('Retry chega à DLQ somente depois do trajeto', () => {
    engine.load(createPreset('retry'));
    const p=engine.state.topology.producers[0], template=p.messageTemplate!;
    engine.publishFromProducer(p.id,template.body,template.attributes);
    time+=2550;engine.tick();
    engine.poll('consumer-worker');time+=5000;engine.tick();
    engine.poll('consumer-worker');time+=5000;engine.tick();
    const m=engine.state.topology.messages[0];
    assert(m.state==='redriven'&&engine.queue('queue-dlq')!.metrics.available===0,'DLQ não pode receber antecipadamente');
    time+=850;engine.tick();
    assert(String(m.state)==='available'&&m.queueId==='queue-dlq','Redrive não chegou');
  });
  check('Long polling termina ou recebe na chegada, sem entrega antecipada', () => {
    setup();engine.queue(q.id)!.longPollingSeconds=5;
    engine.poll('consumer');
    assert(engine.state.topology.consumers[0].status==='polling','Deve aguardar');
    time+=5000;engine.tick();
    assert(String(engine.state.topology.consumers[0].status)==='idle','Deve encerrar a espera');
    engine.poll('consumer');engine.sendFromProducer('producer','order',{},{});
    time+=849;engine.tick();
    assert(engine.state.topology.messages[0].state==='publishing','Polling recebeu cedo');
    time++;engine.tick();
    assert(String(engine.state.topology.messages[0].state)==='in-flight','Long polling não recebeu na chegada');
  });
  check('Dois consumidores mantêm posse independente e exclusão cancela animação', () => {
    setup();
    engine.addConsumer({id:'other',kind:'consumer',name:'Other',queueId:q.id,status:'idle',processed:0,position:{x:0,y:0}});
    engine.sendFromProducer('producer','one',{},{});engine.sendFromProducer('producer','two',{},{});
    time+=850;engine.tick();engine.poll('consumer');engine.poll('other');
    const second=engine.state.topology.messages[1];
    engine.deleteMessage(second.id);
    assert(engine.state.topology.consumers[0].status==='busy','Exclusão liberou consumidor errado');
    assert(engine.state.topology.consumers[1].status==='idle','Dono não foi liberado');
    assert(!engine.state.animations.some(a=>a.messageId===second.id),'Partícula excluída continua visível');
  });
} finally { engine.destroy(); Date.now=originalNow; }
if(failures.length) throw new Error(`${failures.length} regressões: ${failures.join('; ')}`);
