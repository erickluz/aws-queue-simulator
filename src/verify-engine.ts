import { AwsSimulationEngine, emptyTopology } from './core/engine';
import { importTopology } from './domain/serialization';
import type { SqsQueue } from './domain/types';

const assert = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };
const queue = (id: string, kind: 'standard' | 'fifo' = 'standard'): SqsQueue => ({ id, kind: 'queue', name: kind === 'fifo' ? `${id}.fifo` : id, queueKind: kind, delaySeconds: 0, visibilityTimeout: 0, retentionSeconds: 60, longPollingSeconds: 0, position: { x: 0, y: 0 }, metrics: { sent: 0, available: 0, delayed: 0, inFlight: 0, received: 0, deleted: 0, redriven: 0, deduplicated: 0, expired: 0 } });
const engine = new AwsSimulationEngine();
try {
  const invalid = { ...queue('bad', 'fifo'), delaySeconds: 901 }; assert(Boolean(engine.addQueue(invalid)), 'Fila FIFO inválida deveria ser rejeitada'); assert(engine.state.topology.queues.length === 0, 'Validação não pode alterar topologia'); assert(engine.state.logs[0]?.type === 'validation', 'O motivo da validação deve ir para o log');
  const standard = queue('standard'); const fifoDlq = queue('dead', 'fifo'); engine.load({ ...emptyTopology(), queues: [standard, fifoDlq] }); assert(Boolean(engine.addQueue({ ...queue('source'), deadLetterQueueId: fifoDlq.id, maxReceiveCount: 2 })), 'DLQ incompatível deveria ser rejeitada'); assert(engine.state.topology.queues.length === 2, 'DLQ incompatível não pode alterar a topologia');
  const a = queue('a'), b = queue('b'), c = queue('c'); const topic = { id: 'topic', kind: 'topic' as const, name: 'orders', queueKind: 'standard' as const, contentDeduplication: false, position: { x: 0, y: 0 }, published: 0 };
  engine.load({ ...emptyTopology(), topics: [topic], queues: [a, b, c], subscriptions: [{ id: 'a', kind: 'subscription', topicId: topic.id, queueId: a.id, filter: {}, rawDelivery: false, position: {x:0,y:0} }, { id: 'b', kind: 'subscription', topicId: topic.id, queueId: b.id, filter: {}, rawDelivery: false, position: {x:0,y:0} }, { id: 'c', kind: 'subscription', topicId: topic.id, queueId: c.id, filter: { eventType: 'invoice' }, rawDelivery: true, position: {x:0,y:0} }] });
  engine.publish(topic.id, '{"id":1}', { eventType: 'order.created' }); assert(engine.state.topology.messages.filter(m => m.state === 'available').length === 2, 'Fan-out filtrado deveria entregar a duas filas'); assert(engine.state.animations.length === 2, 'Entregas deveriam gerar animações');
  const fifo = queue('fifo', 'fifo'); const fifoTopic = { ...topic, id: 'fifo-topic', name: 'events.fifo', queueKind: 'fifo' as const }; engine.load({ ...emptyTopology(), topics: [fifoTopic], queues: [fifo], subscriptions: [{ id:'fifo-sub', kind:'subscription', topicId:fifoTopic.id, queueId:fifo.id, filter:{}, rawDelivery:true, position:{x:0,y:0} }], consumers:[{id:'worker',kind:'consumer',name:'worker',queueId:fifo.id,position:{x:0,y:0},status:'idle',processed:0}] }); engine.publish(fifoTopic.id, 'one', {}, { groupId:'g', deduplicationId:'same' }); engine.publish(fifoTopic.id, 'dup', {}, { groupId:'g', deduplicationId:'same' }); engine.publish(fifoTopic.id, 'two', {}, { groupId:'g', deduplicationId:'next' }); engine.poll('worker'); engine.poll('worker'); assert(engine.state.topology.messages.filter(m=>m.state==='deduplicated').length === 1, 'FIFO deve suprimir duplicata'); assert(engine.state.topology.messages.filter(m=>m.state==='in-flight').length === 1, 'Grupo FIFO em voo deve bloquear próxima mensagem'); const inFlight = engine.state.topology.messages.find(m=>m.state==='in-flight')!; engine.changeVisibility(inFlight.id, 0); engine.tick(); assert(inFlight.state === 'available', 'Timeout deve tornar mensagem disponível novamente'); engine.poll('worker'); engine.deleteMessage(inFlight.id); assert(inFlight.state === 'deleted', 'Somente DeleteMessage conclui a mensagem');
  const serialized = JSON.stringify(engine.state.topology); assert(importTopology(serialized).format === 'aws-queue-simulator/v1', 'Serialização AWS inválida'); let rejected = false; try { importTopology('{"format":"amqp"}'); } catch { rejected = true; } assert(rejected, 'Formato de outro domínio deveria ser rejeitado');
  console.log('Engine verification passed');
  engine.load({...emptyTopology(),queues:[queue('destination')]});
  const producer = {id:'p',kind:'producer' as const,name:'API',targetId:'missing',sent:0,position:{x:0,y:0}};
  assert(Boolean(engine.addProducer(producer)), 'Produtor com destino ausente deve ser rejeitado');
  assert(engine.state.topology.producers.length === 0, 'Produtor inválido não deve alterar a topologia');
  assert(!engine.addProducer({...producer,targetId:'destination'}), 'Produtor SQS válido deve ser aceito');
  const consumer = {id:'c',kind:'consumer' as const,name:'Worker',queueId:'missing',processed:0,status:'idle' as const,position:{x:0,y:0}};
  assert(Boolean(engine.addConsumer(consumer)), 'Consumidor deve referenciar fila existente');
  assert(!engine.addConsumer({...consumer,queueId:'destination'}), 'Consumidor válido deve ser aceito');
  engine.send('destination','teste');
  engine.poll('c');
  assert(engine.state.topology.messages[0].state === 'in-flight', 'Recursos criados devem participar do fluxo SQS');
  console.log('Resource creation verification passed');
} finally { engine.destroy(); }
