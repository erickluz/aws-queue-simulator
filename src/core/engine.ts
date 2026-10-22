import type { Animation, AwsTopology, Consumer, Producer, LogEvent, SimMessage, SimulationState, SnsTopic, SqsQueue, Subscription } from '../domain/types';
import { compatibleKinds, validateQueue, validateTopic } from '../domain/validation';
import { SEGMENT_DURATION } from './delivery';
import { workerConfig, validateWorker, type WorkerConfig } from '../domain/worker';
import { productionConfig, validateProduction } from '../domain/production';

const now = () => Date.now(); const id = (prefix: string) => `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
const metrics = () => ({ sent: 0, available: 0, delayed: 0, inFlight: 0, received: 0, deleted: 0, redriven: 0, deduplicated: 0, expired: 0 });
export const emptyTopology = (): AwsTopology => ({ format: 'aws-queue-simulator/v1', name: 'Topologia AWS', producers: [], topics: [], queues: [], subscriptions: [], consumers: [], messages: [] });
export class AwsSimulationEngine {
  private waiting = new Map<string,number>();
  private jobs = new Map<string,{receipt:string; config:WorkerConfig}>();
  private lastPollAt = new Map<string,number>();
  private producing=new Map<string,number>();
  private batchDepth=0;
  state: SimulationState = { topology: emptyTopology(), animations: [], logs: [] }; private listeners = new Set<() => void>(); private timer = globalThis.setInterval(() => this.tick(), 100);
  subscribe(listener: () => void) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  destroy() { clearInterval(this.timer);this.producing.clear();for(const p of this.state.topology.producers) p.running=false; }
  private emit() { if(this.batchDepth) return;this.scheduleWorkers(); this.recalculate(); this.listeners.forEach(listener => listener()); }
  private owned(consumerId:string) { return this.state.topology.messages.filter(m=>m.consumerId===consumerId&&m.state==='in-flight'); }
  canPoll(consumerId:string) {
    const consumer=this.state.topology.consumers.find(c=>c.id===consumerId);
    return !!consumer&&this.owned(consumerId).length<workerConfig(consumer.worker).concurrency;
  }
  private scheduleWorkers() {
    for(const consumer of this.state.topology.consumers) {
      const messages=this.owned(consumer.id), config=workerConfig(consumer.worker);
      let active=messages.filter(m=>m.processingStartedAt!==undefined).length;
      for(const message of messages) {
        if(active>=config.concurrency) break;
        if(message.processingStartedAt!==undefined) continue;
        const job=this.jobs.get(message.id);if(!job) continue;
        // A failed earlier FIFO message blocks the remainder of its group, including local buffers.
        if(this.queue(message.queueId)?.queueKind==='fifo'&&message.groupId) {
          const earlier=this.state.topology.messages.slice(0,this.state.topology.messages.indexOf(message));
          if(earlier.some(m=>m.queueId===message.queueId&&m.groupId===message.groupId&&!['deleted','expired','deduplicated'].includes(m.state))) continue;
        }
        if(message.visibilityUntil!==undefined&&message.visibilityUntil<=now()) continue;
        message.processingStartedAt=Math.max(now(),message.consumerArrivesAt??now());
        if(job.config.autoProcess) message.processingEndsAt=message.processingStartedAt+job.config.processingSeconds*1000;
        active++;
      }
      consumer.status=messages.length?'busy':this.waiting.has(consumer.id)?'polling':'idle';
    }
  }
  private log(type: LogEvent['type'], message: string, messageId?: string) { this.state.logs.unshift({ id: id('log'), at: now(), type, message, messageId }); }
  private animate(fromId: string, toId: string, messageId: string, label: string, nodes = [fromId,toId]) {
    const animation: Animation = { id:id('motion'),fromId,toId,messageId,label,nodes,startedAt:now(),duration:(nodes.length-1)*SEGMENT_DURATION };
    this.state.animations.push(animation);
    return animation;
  }
  private recalculate() { for (const queue of this.state.topology.queues) queue.metrics = metrics(); for (const message of this.state.topology.messages) { const queue = this.queue(message.queueId); if (!queue) continue; if (message.state === 'available') queue.metrics.available++; if (message.state === 'delayed') queue.metrics.delayed++; if (message.state === 'in-flight') queue.metrics.inFlight++; if (message.state === 'deleted') queue.metrics.deleted++; if (message.state === 'redriven') queue.metrics.redriven++; if (message.state === 'expired') queue.metrics.expired++; if (message.state === 'deduplicated') queue.metrics.deduplicated++; } }
  load(topology: AwsTopology) { this.waiting.clear(); this.jobs.clear(); this.lastPollAt.clear();this.producing.clear(); this.state = { topology: structuredClone(topology), animations: [], logs: [] };for(const p of this.state.topology.producers) p.running=false; this.emit(); }
  removalIds(resourceId:string) {
    const t=this.state.topology, ids=new Set([resourceId]);
    t.producers.filter(p=>p.targetId===resourceId).forEach(p=>ids.add(p.id));
    t.subscriptions.filter(s=>s.topicId===resourceId||s.queueId===resourceId).forEach(s=>ids.add(s.id));
    t.consumers.filter(c=>c.queueId===resourceId).forEach(c=>ids.add(c.id));
    return ids;
  }
  removeResource(resourceId:string) {
    const t=this.state.topology, ids=this.removalIds(resourceId);
    for(const m of t.messages) {
      if(m.consumerId&&ids.has(m.consumerId)) this.releaseWorker(m);
      if(m.queueId&&ids.has(m.queueId)) this.jobs.delete(m.id);
    }
    t.messages=t.messages.filter(m=>!m.queueId||!ids.has(m.queueId));
    t.producers=t.producers.filter(r=>!ids.has(r.id));
    t.topics=t.topics.filter(r=>!ids.has(r.id));
    t.queues=t.queues.filter(r=>!ids.has(r.id));
    t.subscriptions=t.subscriptions.filter(r=>!ids.has(r.id));
    t.consumers=t.consumers.filter(r=>!ids.has(r.id));
    for(const q of t.queues) if(q.deadLetterQueueId&&ids.has(q.deadLetterQueueId)) {
      q.deadLetterQueueId=undefined;q.maxReceiveCount=undefined;
    }
    for(const resource of ids) {this.waiting.delete(resource);this.lastPollAt.delete(resource);this.producing.delete(resource);}
    this.state.animations=this.state.animations.filter(a=>!a.nodes.some(n=>ids.has(n))&&t.messages.some(m=>m.id===a.messageId));
    this.emit();
  }
  queue(queueId?: string) { return this.state.topology.queues.find(item => item.id === queueId); }
  topic(topicId?: string) { return this.state.topology.topics.find(item => item.id === topicId); }
  addProducer(producer: Producer) {
    const error=validateProduction(producer.production);if(error) return this.invalid(error);
    if (!producer.name.trim()) return this.invalid('Informe o nome do produtor.');
    if (!this.topic(producer.targetId) && !this.queue(producer.targetId)) return this.invalid('Selecione um tópico SNS ou uma fila SQS existente.');
    producer.running=false;this.state.topology.producers.push(producer); this.emit();
  }
  startProducer(producerId:string) {
    const producer=this.state.topology.producers.find(p=>p.id===producerId);
    if(!producer) return this.invalid('Produtor não encontrado.');
    if(this.producing.has(producerId)) return;
    const error=validateProduction(producer.production);if(error) return this.invalid(error);
    if(!this.topic(producer.targetId)&&!this.queue(producer.targetId)) return this.invalid('Destino não encontrado.');
    producer.running=true;this.producing.set(producerId,now());
    this.emitProduction(producer);this.emit();
  }
  pauseProducer(producerId:string) {
    this.producing.delete(producerId);
    const producer=this.state.topology.producers.find(p=>p.id===producerId);if(producer) producer.running=false;
    this.emit();
  }
  produceMessage(producerId:string,automatic=false) {
    const producer=this.state.topology.producers.find(p=>p.id===producerId);
    if(!producer) return this.invalid('Produtor não encontrado.');
    const target=this.topic(producer.targetId)??this.queue(producer.targetId);
    if(!target) return this.invalid('Destino não encontrado.');
    const config=productionConfig(producer.production);
    const template=producer.messageTemplate??{body:'{"orderId":"order-001"}',attributes:{eventType:'order.created'}};
    const invalid=automatic&&Math.random()*100<config.invalidPercent;
    const options=target.queueKind==='fifo'?{groupId:template.groupId||'orders',deduplicationId:automatic&&config.deduplicationMode==='unique'?crypto.randomUUID():template.deduplicationId||crypto.randomUUID()}:{};
    const before=this.state.topology.messages.length;
    this.batchDepth++;
    try {
      const body=invalid?'{invalid-json':template.body;
      const error=target.kind==='queue'?this.sendFromProducer(producerId,body,template.attributes,options):this.publishFromProducer(producerId,body,template.attributes,options);
      if(error) return error;
      producer.sent++;
      if(invalid) {
        producer.invalidProduced=(producer.invalidProduced??0)+1;
        for(const message of this.state.topology.messages.slice(before)) {message.invalid=true;message.history.push('invalid content (simulation)');}
        this.log('validation',`${producer.name}: conteúdo inválido gerado para testar a política do consumidor.`);
      }
    } finally {this.batchDepth--;this.emit();}
  }
  private emitProduction(producer:Producer) {
    this.batchDepth++;
    try {
      for(let i=0;i<productionConfig(producer.production).messagesPerEmission;i++) {
        if(this.produceMessage(producer.id,true)) {this.producing.delete(producer.id);producer.running=false;break;}
      }
    } finally {this.batchDepth--;}
  }
  addConsumer(consumer: Consumer) {
    const error=validateWorker(consumer.worker); if(error) return this.invalid(error);
    if (!consumer.name.trim()) return this.invalid('Informe o nome do consumidor.');
    if (!this.queue(consumer.queueId)) return this.invalid('Selecione uma fila SQS existente.');
    this.state.topology.consumers.push(consumer); this.emit();
  }
  sendFromProducer(producerId: string, body: string, attributes: Record<string,string>, options: Partial<Pick<SimMessage,'groupId'|'deduplicationId'>>) {
    const producer = this.state.topology.producers.find(p=>p.id===producerId);
    const queue = producer && this.queue(producer.targetId);
    if (!producer || !queue) return this.invalid('Produtor ou fila de destino não encontrado.');
    return this.enqueue(queue,body,attributes,producer.id,options);
  }
  publishFromProducer(producerId: string, body: string, attributes: Record<string,string>, options: Partial<Pick<SimMessage,'groupId'|'deduplicationId'>> = {}) {
    const producer = this.state.topology.producers.find(p=>p.id===producerId);
    if(!producer) return this.invalid('Produtor não encontrado.');
    return this.publish(producer.targetId,body,attributes,options,producer.id);
  }
  addQueue(queue: SqsQueue) { const error = validateQueue(queue, [...this.state.topology.queues, queue]); if (error) return this.invalid(error); this.state.topology.queues.push(queue); this.emit(); }
  addTopic(topic: SnsTopic) { const error = validateTopic(topic); if (error) return this.invalid(error); this.state.topology.topics.push(topic); this.emit(); }
  addSubscription(subscription: Subscription) { const topic = this.topic(subscription.topicId); const queue = this.queue(subscription.queueId); if (!topic || !queue) return this.invalid('Tópico ou fila da assinatura não existe.'); if (!compatibleKinds(topic.queueKind, queue.queueKind)) return this.invalid('Um tópico FIFO exige fila SQS FIFO.'); this.state.topology.subscriptions.push(subscription); this.emit(); }
  private invalid(message: string) { this.log('validation', message); this.emit(); return message; }
  send(queueId: string, body: string, attributes: Record<string, string> = {}, options: Partial<Pick<SimMessage, 'groupId' | 'deduplicationId'>> = {}) { const queue = this.queue(queueId); if (!queue) return this.invalid('Fila SQS não encontrada.'); return this.enqueue(queue, body, attributes, 'direct', options); }
  publish(topicId: string, body: string, attributes: Record<string, string> = {}, options: Partial<Pick<SimMessage, 'groupId' | 'deduplicationId'>> = {}, producerId?: string) { const topic = this.topic(topicId); if (!topic) return this.invalid('Tópico SNS não encontrado.'); if (topic.queueKind === 'fifo' && !options.groupId) return this.invalid('Publicações FIFO exigem MessageGroupId.'); const dedup = options.deduplicationId ?? (topic.contentDeduplication ? `${body}:${JSON.stringify(attributes)}` : undefined); if (dedup && this.state.topology.messages.some(message => message.sourceId === topic.id && message.deduplicationId === dedup && now() - message.createdAt < 300000)) { this.state.topology.messages.push(this.message(topic.id, undefined, body, attributes, 'deduplicated', options.groupId, dedup)); this.log('deduplicated', 'Publicação SNS suprimida pela janela FIFO de cinco minutos.'); this.emit(); return; }
    topic.published++; this.log('publish', `Mensagem publicada em ${topic.name}.`); const subscriptions = this.state.topology.subscriptions.filter(item => item.topicId === topicId && Object.entries(item.filter).every(([key, value]) => attributes[key] === value)); for (const subscription of subscriptions) { const queue = this.queue(subscription.queueId)!; this.enqueue(queue, body, subscription.rawDelivery ? attributes : { ...attributes, SNS: topic.name }, topic.id, { groupId: options.groupId, deduplicationId: dedup }, subscription.id, [...(producerId?[producerId]:[]),topic.id,subscription.id,queue.id]); } this.emit(); }
  private message(sourceId: string, queueId: string | undefined, body: string, attributes: Record<string, string>, state: SimMessage['state'], groupId?: string, deduplicationId?: string): SimMessage { const createdAt = now(); return { id: id('msg'), body, attributes, sourceId, queueId, state, createdAt, availableAt: createdAt, receivedCount: 0, groupId, deduplicationId, history: [state] }; }
  private enqueue(queue: SqsQueue, body: string, attributes: Record<string, string>, sourceId: string, options: Partial<Pick<SimMessage, 'groupId' | 'deduplicationId'>>, fromId?: string, nodes?: string[]) {
    if (queue.queueKind === 'fifo' && !options.groupId) return this.invalid('Envios FIFO exigem MessageGroupId.');
    if(queue.queueKind==='fifo'&&options.deduplicationId&&this.state.topology.messages.some(m=>m.queueId===queue.id&&m.deduplicationId===options.deduplicationId&&m.state!=='deduplicated'&&now()-m.createdAt<300000)) {
      this.state.topology.messages.push(this.message(sourceId,queue.id,body,attributes,'deduplicated',options.groupId,options.deduplicationId));
      this.log('deduplicated','Envio SQS FIFO suprimido pela janela de deduplicação.');this.emit();return;
    }
    const route=nodes??(sourceId==='direct'?[queue.id]:[sourceId,queue.id]);
    const message=this.message(sourceId,queue.id,body,attributes,'publishing',options.groupId,options.deduplicationId);
    const animation=this.animate(fromId??sourceId,queue.id,message.id,fromId?'Entrega SNS':'SendMessage',route);
    message.arrivesAt=animation.startedAt+animation.duration;
    message.availableAt=message.arrivesAt+queue.delaySeconds*1000;
    this.state.topology.messages.push(message);
    this.log('send',`Mensagem enviada para ${queue.name}.`,message.id);
    this.emit();
  }
  poll(consumerId: string) {
    const consumer=this.state.topology.consumers.find(c=>c.id===consumerId),queue=consumer&&this.queue(consumer.queueId);
    if(!consumer||!queue) return this.invalid('Consumidor ou fila não encontrado.');
    if(!this.canPoll(consumerId)) return this.invalid('Aguarde uma vaga no consumidor antes de receber outro lote.');
    const config=workerConfig(consumer.worker);
    const capacity=Math.max(config.batchSize,config.concurrency)-this.owned(consumerId).length;
    const candidates=this.state.topology.messages.filter(m=>m.queueId===queue.id&&m.state==='available')
      .filter(m=>queue.queueKind!=='fifo'||!m.groupId||!this.state.topology.messages.some(other=>other.queueId===queue.id&&other.groupId===m.groupId&&other.state==='in-flight'))
      .slice(0,Math.min(config.batchSize,capacity));
    if (!candidates.length) {
      if(this.waiting.has(consumer.id)) return;
      consumer.status=queue.longPollingSeconds?'polling':'idle';
      if(queue.longPollingSeconds) this.waiting.set(consumer.id,now()+queue.longPollingSeconds*1000);
      this.log('poll',queue.longPollingSeconds?`${consumer.name} aguarda long polling (${queue.longPollingSeconds}s).`:`${consumer.name}: nenhuma mensagem disponível.`);
      this.emit(); return;
    }
    this.waiting.delete(consumer.id);
    this.lastPollAt.set(consumer.id,now());
    for(const message of candidates) {
      message.consumerId=consumer.id;message.state='in-flight';message.receivedCount++;
      message.receiptHandle=id('receipt');message.visibilityUntil=now()+queue.visibilityTimeout*1000;
      message.consumerArrivesAt=now()+SEGMENT_DURATION;message.history.push('in-flight');
      this.animate(queue.id,consumer.id,message.id,'ReceiveMessage');
      this.jobs.set(message.id,{receipt:message.receiptHandle,config});
    }
    this.log('poll',`${consumer.name} recebeu ${candidates.length} mensagem(ns); concorrência ${config.concurrency}.`);
    this.emit(); }
  deleteMessage(messageId: string, discard=false) {
    const message=this.state.topology.messages.find(m=>m.id===messageId);
    if(!message||message.state!=='in-flight'||!message.consumerId) return this.invalid('Somente uma mensagem em processamento pode ser excluída.');
    if(!discard&&message.processingStartedAt===undefined) return this.invalid('Aguarde uma vaga de processamento antes de concluir esta mensagem.');
    const consumer=this.state.topology.consumers.find(c=>c.id===message.consumerId);
    message.state='deleted';message.history.push(discard?'discarded (DeleteMessage)':'deleted');
    if(consumer) {
      if(discard) consumer.discarded=(consumer.discarded??0)+1; else consumer.processed++;
    }
    this.releaseWorker(message);
    this.state.animations=this.state.animations.filter(a=>a.messageId!==message.id);
    this.log(discard?'discard':'delete',discard?'Descarte explícito via DeleteMessage (não contabilizado como sucesso).':'DeleteMessage concluiu a mensagem.',message.id);
    this.emit();
  }
  private releaseWorker(message:SimMessage) {
    const consumer=this.state.topology.consumers.find(c=>c.id===message.consumerId);
    this.jobs.delete(message.id);message.consumerArrivesAt=undefined;message.processingStartedAt=undefined;message.processingEndsAt=undefined;message.consumerId=undefined;
    if(consumer) {
      consumer.status=this.owned(consumer.id).length?'busy':'idle';
      if(consumer.status==='idle') this.lastPollAt.set(consumer.id,now());
    }
  }
  retryMessage(messageId:string,seconds?:number) {
    const message=this.state.topology.messages.find(m=>m.id===messageId);
    const consumer=this.state.topology.consumers.find(c=>c.id===message?.consumerId);
    if(!message||message.state!=='in-flight'||!consumer) return this.invalid('Retry exige uma mensagem em processamento.');
    const config=this.jobs.get(message.id)?.config??workerConfig(consumer.worker);
    const delay=seconds??config.retryDelaySeconds;
    if(!Number.isInteger(delay)||delay<0||delay>43200) return this.invalid('Retry deve estar entre 0 e 43200 segundos inteiros.');
    if(config.maxRetries!==undefined&&(message.retryCount??0)>=config.maxRetries) {
      message.history.push(`retry limit reached (${config.maxRetries})`);
      this.log('discard',`Limite de ${config.maxRetries} retries atingido; descarte via DeleteMessage.`,message.id);
      this.deleteMessage(messageId,true);return;
    }
    message.retryCount=(message.retryCount??0)+1;
    message.visibilityUntil=now()+delay*1000;
    message.history.push(`retry: ChangeMessageVisibility(${delay})`);
    consumer.retries=(consumer.retries??0)+1;
    this.releaseWorker(message);
    this.state.animations=this.state.animations.filter(a=>a.messageId!==message.id);
    const returning=this.animate(consumer.id,message.queueId!,message.id,'Retry — ChangeMessageVisibility');
    message.retryArrivesAt=returning.startedAt+returning.duration;
    this.log('retry',`Retry em ${delay}s via ChangeMessageVisibility; a mensagem não foi excluída.`,message.id);
    this.emit();
  }
  abandonMessage(messageId:string) {
    const message=this.state.topology.messages.find(m=>m.id===messageId);
    if(!message||message.state!=='in-flight'||!message.consumerId) return this.invalid('A mensagem precisa estar em processamento.');
    message.history.push('worker stopped; waiting visibility timeout');
    this.releaseWorker(message);
    this.log('worker','Worker parou sem excluir: a mensagem retorna após o visibility timeout.',message.id);this.emit();
  }
  changeVisibility(messageId: string, seconds: number) { const message = this.state.topology.messages.find(item => item.id === messageId); if (!message || message.state !== 'in-flight') return this.invalid('A mensagem precisa estar em voo.'); if (seconds < 0 || seconds > 43200) return this.invalid('Visibility timeout deve estar entre 0 e 43200 segundos.'); message.visibilityUntil = now() + seconds * 1000; this.log('timeout', `Visibility timeout alterado para ${seconds}s.`, message.id); this.emit(); }
  tick() {
    const time=now();
    for(const [producerId,lastEmission] of this.producing) {
      const producer=this.state.topology.producers.find(p=>p.id===producerId);
      if(!producer) {this.producing.delete(producerId);continue;}
      if(time-lastEmission<productionConfig(producer.production).intervalMs) continue;
      // A delayed browser tick emits once, rather than replaying an unbounded backlog.
      this.producing.set(producerId,time);this.emitProduction(producer);
    }
    this.state.animations=this.state.animations.filter(a=>time-a.startedAt<a.duration);
    for(const message of this.state.topology.messages) {
      if(!message.queueId||['deleted','expired','deduplicated'].includes(message.state)) continue;
      const queue=this.queue(message.queueId);
      if(!queue) continue;
      if(message.state==='publishing') {
        if(time<(message.arrivesAt??message.availableAt)) continue;
        message.state=time<message.availableAt?'delayed':'available';
        message.history.push(message.state);
        this.log('deliver',`Mensagem chegou a ${queue.name}.`,message.id);
      }
      if(time-(message.arrivesAt??message.createdAt)>=queue.retentionSeconds*1000) {
        message.state='expired'; message.history.push('expired');
        this.releaseWorker(message);
        this.log('expired',`Mensagem expirou pela retenção em ${queue.name}.`,message.id);
        continue;
      }
      if(['delayed','redriven'].includes(message.state)&&time>=message.availableAt) {
        message.state='available'; message.history.push('available');
        this.log('deliver','Mensagem tornou-se disponível.',message.id);
      }
      if(message.state==='in-flight'&&message.visibilityUntil!==undefined&&time>=Math.max(message.visibilityUntil,message.retryArrivesAt??0)) {
        message.retryArrivesAt=undefined;
        this.releaseWorker(message);
        message.receiptHandle=undefined;
        this.state.animations=this.state.animations.filter(a=>a.messageId!==message.id);
        if(queue.maxReceiveCount&&message.receivedCount>queue.maxReceiveCount&&queue.deadLetterQueueId) {
          const dlq=this.queue(queue.deadLetterQueueId)!;
          message.queueId=dlq.id; message.state='redriven';
          message.availableAt=time+SEGMENT_DURATION; message.history.push('redriven');
          this.animate(queue.id,dlq.id,message.id,'Redrive DLQ');
          this.log('redrive',`Mensagem redirecionada para ${dlq.name}.`,message.id);
        } else {
          message.state='available'; message.history.push('available');
          this.log('timeout','Visibility timeout expirou; mensagem disponível novamente.',message.id);
        }
      }
    }
    this.scheduleWorkers();
    for(const [messageId,job] of this.jobs) {
      const message=this.state.topology.messages.find(m=>m.id===messageId);
      if(!message||message.state!=='in-flight'||message.receiptHandle!==job.receipt) {this.jobs.delete(messageId);continue;}
      if(time<(message.processingEndsAt??Infinity)) continue;
      if(job.config.outcome==='success'&&!message.invalid) this.deleteMessage(messageId);
      else if(job.config.failureAction==='discard') this.deleteMessage(messageId,true);
      else if(job.config.failureAction==='retry') this.retryMessage(messageId,job.config.retryDelaySeconds);
      else this.abandonMessage(messageId);
    }
    for(const [consumerId,deadline] of this.waiting) {
      const consumer=this.state.topology.consumers.find(c=>c.id===consumerId);
      if(!consumer||time>=deadline) {
        this.waiting.delete(consumerId);
        if(consumer) {consumer.status='idle';this.lastPollAt.set(consumer.id,time);this.log('poll',`${consumer.name}: long polling terminou.`);}
      } else this.poll(consumerId);
    }
    for(const consumer of this.state.topology.consumers) {
      const config=workerConfig(consumer.worker);
      if((config.autoProcess||config.autoPoll)&&!this.waiting.has(consumer.id)&&this.canPoll(consumer.id)&&time>=(this.lastPollAt.get(consumer.id)??-Infinity)+config.pollIntervalSeconds*1000) {
        this.lastPollAt.set(consumer.id,time);
        this.poll(consumer.id);
      }
    }
    this.emit();
  }
}
