import { AwsSimulationEngine } from './core/engine';
import { createPreset } from './ui/presets';
import { workerConfig } from './domain/worker';
import { details } from './ui/card-details';
import { connectionInfo } from './ui/connections';
const assert=(ok:unknown,message:string)=>{if(!ok) throw new Error(message);};
const originalNow=Date.now;let time=1_000_000;Date.now=()=>time;
const engine=new AwsSimulationEngine();
try {
  const t=createPreset();
  t.consumers[0].worker=workerConfig({autoProcess:true,processingSeconds:5,outcome:'failure',failureAction:'retry',retryDelaySeconds:0});
  engine.load(t);engine.send('queue-orders','test');engine.tick();engine.poll('consumer-worker');
  const c=engine.state.topology.consumers[0],m=engine.state.topology.messages[0];
  time+=850;engine.tick();
  assert(details(c,engine.state.topology).includes('worker-message-dot'),'Bolinha deve permanecer no consumidor após chegada');
  time+=4999;engine.tick();assert(m.consumerId===c.id,'Processamento terminou antes de 5s');
  time++;engine.tick();
  assert(connectionInfo(engine.state.topology).some(e=>e.from===c.id&&e.to==='queue-orders'),'Conexão de retry ausente');
  assert(engine.state.animations.some(a=>a.fromId===c.id&&a.toId==='queue-orders'),'Bolinha de retorno ausente');
  engine.tick();assert(m.state==='in-flight','Fila mostrou mensagem antes da chegada do retry');
  time+=850;engine.tick();assert(m.state==='available','Retry não chegou à fila');
  for(const duration of [0,2,12]) {
    const scenario=createPreset();scenario.consumers[0].worker=workerConfig({autoProcess:true,processingSeconds:duration});
    engine.load(scenario);engine.send('queue-orders','test');engine.tick();engine.poll('consumer-worker');
    const consumer=engine.state.topology.consumers[0], message=engine.state.topology.messages[0];
    assert(!details(consumer,engine.state.topology).includes('worker-message-dot'),'Não deve duplicar bolinha durante recepção');
    assert(!connectionInfo(engine.state.topology).some(e=>e.from===consumer.id),'Sucesso não exibe retry');
    time+=849+duration*1000;engine.tick();
    assert(message.state==='in-flight','Prazo de processamento ignorado');
    time++;engine.tick();assert(message.state==='deleted','Sucesso não concluiu no prazo');
    assert(details(consumer,engine.state.topology).includes('worker-status idle'),'Consumidor não voltou ao estado ocioso');
  }
  t.consumers[0].worker=workerConfig({autoProcess:true,processingSeconds:10});t.queues[0].visibilityTimeout=2;
  engine.load(t);engine.send('queue-orders','test');engine.tick();engine.poll('consumer-worker');
  assert(details(engine.state.topology.consumers[0],engine.state.topology).includes('Visibilidade expira'),'Timeout mais curto sem aviso');
  time+=2000;engine.tick();
  assert(!details(engine.state.topology.consumers[0],engine.state.topology).includes('worker-message-dot'),'Bolinha obsoleta após timeout');
  console.log('PASS permanência de 5s, conexão de retry e retorno visual antes da disponibilidade');
} finally {engine.destroy();Date.now=originalNow;}
