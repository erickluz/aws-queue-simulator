import { AwsSimulationEngine } from './core/engine';
import { createPreset } from './ui/presets';
import { workerConfig, validateWorker, type WorkerConfig } from './domain/worker';
import { updateResource } from './ui/card-details';
import { exportTopology, importTopology } from './domain/serialization';
import { zoomAt, fitView, worldDelta } from './ui/viewport';
const assert=(value:unknown,message:string)=>{if(!value) throw new Error(message);};
const originalNow=Date.now;
let time=1000000;
Date.now=()=>time;
const engine=new AwsSimulationEngine();
const test=(name:string,run:()=>void)=>{run();console.log('PASS '+name);};
const advance=(ms:number)=>{time+=ms;engine.tick();};
function setup(config:Partial<WorkerConfig>={}) {
  const t=createPreset();
  t.consumers[0].worker=workerConfig(config);
  engine.load(t);
  // Isolate processing tests from the automatic receive tested in verify-auto-poll.
  if(!config.autoPoll) engine.state.topology.consumers[0].worker!.autoProcess=false;
  engine.send('queue-orders','order');engine.tick();
  engine.state.topology.consumers[0].worker=workerConfig(config);
  return {consumer:engine.state.topology.consumers[0],message:engine.state.topology.messages[0],queue:engine.queue('queue-orders')!};
}
try {
  test('Modo manual preserva a mensagem até ação explícita',()=>{
    const {message}=setup();engine.poll('consumer-worker');advance(5000);
    assert(message.state==='in-flight','Manual não deve concluir sozinho');
  });
  test('Sucesso automático respeita chegada + tempo de processamento',()=>{
    const {message,consumer}=setup({autoProcess:true,processingSeconds:2});
    engine.poll(consumer.id);advance(2849);assert(message.state==='in-flight','Conclusão antecipada');
    advance(1);assert(String(message.state)==='deleted'&&consumer.processed===1,'Sucesso não excluiu');
    assert(!message.processingEndsAt,'Prazo residual');
  });
  test('Falha com retry preserva mensagem e contador de tentativas',()=>{
    const {message,consumer}=setup({autoProcess:true,processingSeconds:1,outcome:'failure',failureAction:'retry',retryDelaySeconds:2});
    engine.poll(consumer.id);advance(1850);
    assert(message.state==='in-flight'&&!message.consumerId,'Retry deve aguardar invisível');
    assert(consumer.status==='idle'&&consumer.processed===0&&consumer.retries===1,'Contadores de retry incorretos');
    advance(1999);assert(message.state==='in-flight','Retry antecipado');
    advance(1);assert(message.state==='in-flight'&&message.consumerId===consumer.id,'Retry não foi recebido automaticamente');
    assert(message.receivedCount===2,'Retry deve preservar ApproximateReceiveCount');
  });
  test('Falha sem retry descarta via DeleteMessage, sem contar sucesso',()=>{
    const {message,consumer}=setup({autoProcess:true,processingSeconds:0,outcome:'failure',failureAction:'discard'});
    engine.poll(consumer.id);advance(850);
    assert(message.state==='deleted'&&consumer.discarded===1&&consumer.processed===0,'Descarte confundido com sucesso');
    assert(engine.state.logs.some(l=>l.type==='discard'),'Descarte sem log');
    advance(30000);assert(message.state==='deleted','Descartada reapareceu');
  });
  test('Parar sem excluir aguarda timeout e não significa descarte',()=>{
    const {message,consumer}=setup({autoProcess:true,processingSeconds:0,outcome:'failure',failureAction:'wait'});
    engine.poll(consumer.id);advance(850);
    assert(message.state==='in-flight'&&consumer.status==='idle','Abandono não liberou worker');
    advance(29150);assert(message.state==='in-flight'&&message.receivedCount===2,'Abandono não reentregou automaticamente');
  });
  test('Timeout vence processamento longo e cancela conclusão obsoleta',()=>{
    const {message,consumer,queue}=setup({autoProcess:true,processingSeconds:10});
    queue.visibilityTimeout=2;engine.poll(consumer.id);advance(2000);
    assert(message.state==='available'&&consumer.status==='idle','Timeout não liberou');
    consumer.worker!.autoProcess=false;
    advance(10000);assert(message.state==='available'&&consumer.processed===0,'Job obsoleto excluiu mensagem');
  });
  test('Polling contínuo é opcional e respeita o intervalo',()=>{
    const {consumer}=setup({autoPoll:true,autoProcess:true,processingSeconds:0,pollIntervalSeconds:2});
    assert(consumer.status==='busy','Polling contínuo não recebeu');
    engine.send('queue-orders','two');advance(850);
    assert(consumer.processed===1&&String(consumer.status)==='idle','Primeira não terminou');
    advance(1999);assert(consumer.status==='idle','Intervalo ignorado');
    advance(1);assert(String(consumer.status)==='busy','Próximo poll não ocorreu');
  });
  test('Ações manuais cancelam a conclusão automática pendente',()=>{
    const {message,consumer}=setup({autoProcess:true,processingSeconds:5,pollIntervalSeconds:10});
    engine.poll(consumer.id);engine.retryMessage(message.id,0);engine.tick();advance(6000);
    assert(message.state==='available'&&consumer.processed===0,'Conclusão obsoleta após retry manual');
  });
  test('Edição é validada, persiste no JSON e vale só na próxima recepção',()=>{
    const {message,consumer}=setup({autoProcess:true,processingSeconds:2});
    engine.poll(consumer.id);
    const before=JSON.stringify(engine.state.topology);
    assert(updateResource(engine.state.topology,consumer.id,{worker:{...consumer.worker,processingSeconds:-1}}),'Aceitou tempo negativo');
    assert(JSON.stringify(engine.state.topology)===before,'Edição inválida alterou estado');
    assert(validateWorker({...workerConfig(),retryDelaySeconds:Infinity}),'Aceitou infinito');
    assert(!updateResource(engine.state.topology,consumer.id,{worker:workerConfig({autoProcess:true,processingSeconds:10,outcome:'failure'})}),'Edição válida falhou');
    advance(2850);assert(message.state==='deleted','Edição alterou tentativa já iniciada');
    const restored=importTopology(exportTopology(engine.state.topology));
    assert(restored.consumers[0].worker?.processingSeconds===10,'Configuração não persistiu');
    const invalid=JSON.parse(exportTopology(engine.state.topology));invalid.consumers[0].worker.autoPoll='yes';
    let rejected=false;try{importTopology(JSON.stringify(invalid));}catch{rejected=true;}assert(rejected,'Importação aceitou configuração inválida');
  });
  test('Carregar preset cancela jobs da topologia anterior',()=>{
    setup({autoProcess:true});engine.poll('consumer-worker');engine.load(createPreset());advance(10000);
    assert(!engine.state.topology.messages.length&&engine.state.topology.consumers[0].processed===0,'Job antigo vazou');
  });
  test('Zoom preserva âncora, limita escala e converte arraste corretamente',()=>{
    const view={x:20,y:-30,scale:1},anchor={x:400,y:250};
    const next=zoomAt(view,1.5,anchor);
    assert((anchor.x-next.x)/next.scale===(anchor.x-view.x)/view.scale,'Âncora X mudou');
    assert((anchor.y-next.y)/next.scale===(anchor.y-view.y)/view.scale,'Âncora Y mudou');
    assert(zoomAt(view,100,anchor).scale===2&&zoomAt(view,.01,anchor).scale===.25,'Limites incorretos');
    assert(worldDelta(60,.5)===120&&worldDelta(60,2)===30,'Arraste não compensou zoom');
    const fit=fitView({x:100,y:200,width:1200,height:600},1000,800);
    assert(fit.x+100*fit.scale>=0&&fit.x+1300*fit.scale<=1000,'Enquadramento horizontal incorreto');
    assert(fit.y+200*fit.scale>=60&&fit.y+800*fit.scale<=800,'Enquadramento vertical incorreto');
  });
} finally {engine.destroy();Date.now=originalNow;}
