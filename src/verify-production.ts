import { AwsSimulationEngine, emptyTopology } from './core/engine';
import { productionConfig, validateProduction } from './domain/production';
import { workerConfig, validateWorker } from './domain/worker';
import { importTopology, exportTopology } from './domain/serialization';
import { createPreset } from './ui/presets';
import { updateResource, details } from './ui/card-details';
const assert=(ok:unknown,message:string)=>{if(!ok) throw new Error(message);};
const originalNow=Date.now,originalRandom=Math.random;
let time=1_000_000;Date.now=()=>time;Math.random=()=>.25;
const engine=new AwsSimulationEngine();
const advance=(ms:number)=>{time+=ms;engine.tick();};
const test=(name:string,run:()=>void)=>{run();console.log('PASS '+name);};
function setup(direct=true) {
  const t=createPreset();if(direct) t.producers[0].targetId='queue-orders';
  engine.load(t);return {p:engine.state.topology.producers[0],c:engine.state.topology.consumers[0]};
}
try {
  test('Iniciar é idempotente; frequência, lote, pausa e retomada',()=>{
    const {p}=setup();p.production=productionConfig({intervalMs:1000,messagesPerEmission:3});
    engine.startProducer(p.id);engine.startProducer(p.id);assert(p.sent===3&&p.running,'Início duplicado');
    advance(999);assert(p.sent===3,'Produção antes do intervalo');advance(1);assert(p.sent===6,'Emissão ausente');
    engine.pauseProducer(p.id);advance(10000);assert(p.sent===6&&!p.running,'Pausa não cancelou');
    engine.startProducer(p.id);assert(p.sent===9,'Retomada sem emissão');
    p.production.intervalMs=100;advance(100);assert(p.sent===12,'Frequência editada não aplicada');
    advance(100000);assert(p.sent===15,'Tick atrasado reproduziu backlog ilimitado');
    assert(details(p,engine.state.topology).includes('Produzindo automaticamente'),'Card sem estado');
  });
  test('Taxas 0%, 50%, 100%; envio manual e fan-out preservam semântica',()=>{
    let {p}=setup();p.production=productionConfig({invalidPercent:0});engine.startProducer(p.id);
    assert(!engine.state.topology.messages[0].invalid,'Zero por cento gerou inválida');
    ({p}=setup());p.production=productionConfig({invalidPercent:50,messagesPerEmission:4});
    let sample=0;Math.random=()=>sample++%2?.75:.25;engine.startProducer(p.id);
    assert(p.invalidProduced===2&&engine.state.topology.messages.filter(m=>m.invalid).length===2,'Percentual não usado por mensagem');
    Math.random=()=>.25;
    const t=createPreset('fanout');t.producers[0].production=productionConfig({invalidPercent:100});engine.load(t);p=engine.state.topology.producers[0];
    engine.startProducer(p.id);assert(engine.state.topology.messages.length===2&&engine.state.topology.messages.every(m=>m.invalid),'Fan-out perdeu marca de falha');
    assert(p.sent===1&&p.invalidProduced===1,'Fan-out duplicou contador do produtor');
    engine.pauseProducer(p.id);engine.produceMessage(p.id);
    assert(engine.state.topology.messages.slice(2).every(m=>!m.invalid),'Envio manual injetou falha');
  });
  test('Inválida força falha; limite dois descarta após dois retornos',()=>{
    const {p,c}=setup();p.production=productionConfig({invalidPercent:100});
    c.worker=workerConfig({autoProcess:true,processingSeconds:0,outcome:'success',failureAction:'retry',retryDelaySeconds:0,maxRetries:2,pollIntervalSeconds:1});
    engine.startProducer(p.id);engine.pauseProducer(p.id);
    for(let i=0;i<100;i++) advance(100);
    const m=engine.state.topology.messages[0];
    assert(m.state==='deleted'&&m.retryCount===2&&m.receivedCount===3,'Limite por mensagem incorreto');
    assert(c.discarded===1&&c.processed===0&&c.retries===2,'Descarte confundido com sucesso');
    assert(m.history.includes('retry limit reached (2)'),'Motivo do descarte não registrado');
  });
  test('Limite zero e retry manual; mensagens independentes; legado ilimitado',()=>{
    const {c}=setup();c.worker=workerConfig({batchSize:2,concurrency:2,maxRetries:0});
    engine.send(c.queueId,'one');engine.send(c.queueId,'two');engine.tick();engine.poll(c.id);
    for(const m of engine.state.topology.messages) engine.retryMessage(m.id,0);
    assert(c.discarded===2&&!c.retries,'Zero deveria descartar sem retornar');
    setup();const consumer=engine.state.topology.consumers[0];engine.send(consumer.queueId,'legacy');engine.tick();engine.poll(consumer.id);
    engine.retryMessage(engine.state.topology.messages[0].id,0);advance(850);
    assert(engine.state.topology.messages[0].state==='available','Legado deixou de permitir retry');
  });
  test('FIFO automático usa IDs únicos ou reutiliza template em SNS e SQS',()=>{
    for(const direct of [false,true]) for(const mode of ['unique','template'] as const) {
      const t=createPreset('fifo');if(direct)t.producers[0].targetId='queue-orders';
      t.producers[0].production=productionConfig({messagesPerEmission:2,deduplicationMode:mode});engine.load(t);
      engine.startProducer(t.producers[0].id);engine.pauseProducer(t.producers[0].id);advance(3000);
      assert(engine.queue('queue-orders')!.metrics.available===(mode==='unique'?2:1),'IDs FIFO incorretos');
    }
  });
  test('Novo, importação, exclusão de destino e destroy param a produção',()=>{
    let {p}=setup();engine.startProducer(p.id);const restored=importTopology(exportTopology(engine.state.topology));
    assert(restored.producers[0].running===false,'Importar não pausou');engine.load(restored);const count=restored.messages.length;
    advance(10000);assert(engine.state.topology.messages.length===count,'Load retomou produção sozinho');
    engine.startProducer(p.id);engine.removeResource('queue-orders');advance(10000);
    assert(!engine.state.topology.producers.length&&!engine.state.topology.messages.length,'Exclusão deixou produtor ativo');
    ({p}=setup());engine.startProducer(p.id);engine.load(emptyTopology());advance(10000);assert(!engine.state.topology.messages.length,'Novo deixou timer ativo');
    ({p}=setup());engine.startProducer(p.id);engine.destroy();advance(10000);assert(p.sent===1&&!p.running,'Destroy deixou produção ativa');
  });
  test('Configurações persistem e entradas inválidas são rejeitadas sem mutar',()=>{
    const {p,c}=setup();p.production=productionConfig({intervalMs:500,messagesPerEmission:2,invalidPercent:30});c.worker=workerConfig({maxRetries:4});
    const copy=importTopology(exportTopology(engine.state.topology));assert(copy.producers[0].production?.invalidPercent===30&&copy.consumers[0].worker?.maxRetries===4,'Configurações não persistiram');
    const before=JSON.stringify(engine.state.topology);
    assert(updateResource(engine.state.topology,p.id,{production:productionConfig({intervalMs:0})}),'Editor aceitou intervalo inválido');
    assert(updateResource(engine.state.topology,c.id,{worker:workerConfig({maxRetries:-1})}),'Editor aceitou limite inválido');
    assert(before===JSON.stringify(engine.state.topology),'Edição inválida alterou cenário');
    for(const bad of [{intervalMs:99},{messagesPerEmission:11},{invalidPercent:101},{invalidPercent:-1},{intervalMs:Infinity}]) assert(validateProduction(productionConfig(bad)),'Produção inválida aceita');
    for(const maxRetries of [-1,1.5,1001,NaN]) assert(validateWorker(workerConfig({maxRetries})),'Limite inválido aceito');
    const bad=JSON.parse(exportTopology(copy));bad.producers[0].production.invalidPercent=200;
    let rejected=false;try{importTopology(JSON.stringify(bad));}catch{rejected=true;}assert(rejected,'Importação aceitou percentual inválido');
  });
} finally {engine.destroy();Date.now=originalNow;Math.random=originalRandom;}
