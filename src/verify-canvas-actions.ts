import { AwsSimulationEngine, emptyTopology } from './core/engine';
import { createPreset } from './ui/presets';
import { placeLabel, overlaps, type Box } from './ui/connection-layout';
import { connectionInfo } from './ui/connections';

function assert(value:unknown,message:string) {if(!value) throw new Error(message);}
const engine=new AwsSimulationEngine(),originalNow=Date.now;
let time=1_000_000;Date.now=()=>time;
try {
  for(const name of ['default','fanout','filter','fifo','retry']) {
    const preset=createPreset(name);
    for(const resource of [...preset.producers,...preset.topics,...preset.queues,...preset.subscriptions,...preset.consumers]) {
      engine.load(preset);engine.removeResource(resource.id);engine.tick();
      const t=engine.state.topology;
      const ids=new Set([...t.producers,...t.topics,...t.queues,...t.subscriptions,...t.consumers].map(r=>r.id));
      assert(!ids.has(resource.id),'Recurso removido');
      assert(connectionInfo(t).every(e=>ids.has(e.from)&&ids.has(e.to)),'Sem conexões órfãs');
    }
  }
  engine.load(createPreset());engine.send('queue-orders','test');engine.tick();engine.poll('consumer-worker');
  engine.removeResource('consumer-worker');
  const message=engine.state.topology.messages[0];
  assert(message.state==='in-flight'&&!message.consumerId,'Excluir consumidor preserva mensagem até timeout');
  time+=31_000;engine.tick();assert(engine.state.topology.messages[0].state==='available','Timeout após excluir consumidor');
  const preset=createPreset();preset.consumers[0].worker={autoProcess:true,processingSeconds:2,outcome:'success',failureAction:'retry',retryDelaySeconds:0,autoPoll:true,pollIntervalSeconds:1};
  engine.load(preset);engine.send('queue-orders','test');engine.tick();
  engine.removeResource('consumer-worker');time+=4_000;engine.tick();
  assert(engine.state.topology.messages[0].state==='in-flight','Excluir worker cancela conclusão automática');
  engine.load(createPreset());engine.publishFromProducer('producer-api','test',{});time+=4_000;engine.tick();
  engine.removeResource('topic-orders');
  assert(engine.state.topology.messages[0].state==='available'&&engine.state.topology.queues.length===1,'Excluir origem preserva entregas na fila');
  engine.poll('consumer-worker');engine.deleteMessage(engine.state.topology.messages[0].id);
  assert(engine.state.topology.consumers[0].processed===1,'Fila preservada continua consumível');
  engine.load(preset);engine.send('queue-orders','test');engine.tick();
  engine.removeResource('queue-orders');time+=60_000;engine.tick();
  assert(!engine.state.topology.messages.length&&!engine.state.animations.length,'Excluir fila cancela mensagens e jobs');
  engine.load(preset);engine.send('queue-orders','test');engine.tick();
  engine.load(emptyTopology());time+=60_000;engine.tick();
  assert(!engine.state.topology.consumers.length&&!engine.state.topology.messages.length&&!engine.state.animations.length&&!engine.state.logs.length,'Novo limpa recursos e execução pendente');
  for(const anchor of [{x:0,y:0},{x:250,y:250},{x:500,y:200}]) {
    const obstacles:Box[]=[{x:0,y:0,width:400,height:400},{x:300,y:200,width:400,height:400}];
    for(let i=0;i<15;i++) {
      const b=placeLabel(anchor,150+i*7,60+(i%3)*20,obstacles);
      assert(b.x>=0&&b.y>=0&&!obstacles.some(o=>overlaps(b,o)),'Caixas não sobrepõem cards nem outros rótulos');
      obstacles.push(b);
    }
  }
  console.log('PASS: exclusão em todos os presets, timeout, limpeza de jobs, Novo e colisões de rótulos');
} finally {engine.destroy();Date.now=originalNow;}
