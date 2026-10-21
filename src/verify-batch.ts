import { AwsSimulationEngine, emptyTopology } from './core/engine';
import { createPreset } from './ui/presets';
import { workerConfig, validateWorker, type WorkerConfig } from './domain/worker';
import { importTopology, exportTopology } from './domain/serialization';
import { workerStatus } from './ui/worker-status';
const assert=(ok:unknown,message:string)=>{if(!ok) throw new Error(message);};
const originalNow=Date.now;let time=1_000_000;Date.now=()=>time;
const engine=new AwsSimulationEngine();
const advance=(ms:number)=>{time+=ms;engine.tick();};
const owned=()=>engine.state.topology.messages.filter(m=>m.consumerId&&m.state==='in-flight');
const active=()=>owned().filter(m=>m.processingStartedAt!==undefined);
function setup(count:number,config:Partial<WorkerConfig>={},fifo=false,visibility=30) {
  const t=createPreset(fifo?'fifo':'default');t.queues[0].visibilityTimeout=visibility;
  t.consumers[0].worker=workerConfig({autoProcess:true,processingSeconds:2,batchSize:5,concurrency:2,...config});
  engine.load(t);
  for(let i=0;i<count;i++) engine.send('queue-orders',`message ${i}`,{},fifo?{groupId:i<3?'A':'B',deduplicationId:String(i)}:{});
  engine.tick();return engine.state.topology.consumers[0];
}
try {
  let c=setup(5);
  assert(owned().length===5&&active().length===2,'Lote de cinco deve reservar só duas vagas');
  assert(engine.queue('queue-orders')!.metrics.inFlight===5,'Buffer deve contar como in-flight na SQS');
  advance(850);assert(workerStatus(c,engine.state.topology).includes('2/2 processando · 3 aguardando'),'Card não mostra lote e vagas');
  advance(1999);assert(c.processed===0,'Conclusão antecipada');advance(1);
  assert(c.processed===2&&active().length===2&&owned().length===3,'Conclusão deve preencher vagas sem novo poll');
  advance(2000);assert(c.processed===4&&active().length===1,'Segundo par não concluiu');
  advance(2000);assert(c.processed===5&&!owned().length,'Lote não finalizou');
  c=setup(8,{batchSize:2,concurrency:5,processingSeconds:10,pollIntervalSeconds:1});
  assert(owned().length===2,'Limite do lote ignorado');advance(1000);assert(owned().length===4,'Não preenche vagas com novo poll');
  advance(1000);assert(owned().length===5&&active().length===5,'Capacidade excedida');
  c.worker!.concurrency=1;advance(1000);assert(active().length===5&&owned().length===5,'Reduzir limite deve preservar tentativas ativas');
  c=setup(5,{},true);assert(owned().length===5&&active().length===2,'FIFO deve paralelizar grupos diferentes');
  assert(new Set(active().map(m=>m.groupId)).size===2,'FIFO processou mesmo grupo em paralelo');
  advance(2850);assert(c.processed===2&&active().length===2,'FIFO não iniciou próximo de cada grupo');
  c=setup(3,{batchSize:3,concurrency:1,processingSeconds:10},false,2);
  c.worker!.autoProcess=false;advance(2000);
  assert(!owned().length&&engine.queue('queue-orders')!.metrics.available===3,'Timeout deve liberar ativos e buffer');
  advance(20000);assert(c.processed===0,'Job obsoleto concluiu após timeout');
  c=setup(3,{batchSize:3,concurrency:2,processingSeconds:0,outcome:'failure',failureAction:'retry',retryDelaySeconds:3});
  advance(850);assert(c.retries===3&&c.processed===0,'Retries concorrentes não liberaram vagas');
  assert(engine.state.animations.filter(a=>a.label.startsWith('Retry')).length===3,'Retornos do lote ausentes');
  c=setup(3,{batchSize:3,concurrency:1,autoProcess:false});engine.poll(c.id);
  engine.deleteMessage(active()[0].id);assert(owned().length===2&&active().length===1&&c.status==='busy','Ação manual liberou consumidor inteiro');
  engine.removeResource(c.id);advance(1000);assert(!owned().length,'Exclusão deixou posse residual');
  c=setup(3);const copy=importTopology(exportTopology(engine.state.topology));
  assert(copy.consumers[0].worker?.batchSize===5&&copy.consumers[0].worker?.concurrency===2,'Configuração não persistiu');
  const legacy=JSON.parse(exportTopology(copy));delete legacy.consumers[0].worker.batchSize;delete legacy.consumers[0].worker.concurrency;
  assert(workerConfig(importTopology(JSON.stringify(legacy)).consumers[0].worker).batchSize===1,'Cenário antigo sem padrão');
  for(const bad of [{batchSize:11},{batchSize:0},{concurrency:0},{concurrency:101},{batchSize:1.5}]) {
    assert(validateWorker(workerConfig(bad)),'Validação aceitou limites inválidos');
    legacy.consumers[0].worker={...workerConfig(),...bad};let rejected=false;
    try{importTopology(JSON.stringify(legacy));}catch{rejected=true;}assert(rejected,'Importação aceitou limites inválidos');
  }
  engine.load(emptyTopology());advance(60000);assert(!engine.state.topology.messages.length,'Novo deixou jobs do lote');
  console.log('PASS lote, concorrência, preenchimento, FIFO, timeout, retry, modo manual, exclusão, persistência e validação');
} finally {engine.destroy();Date.now=originalNow;}
