import type { AwsTopology, Producer, Consumer, SnsTopic, SqsQueue, Subscription } from '../domain/types';
import { validateQueue, validateTopic, compatibleKinds } from '../domain/validation';
import { workerConfig, validateWorker } from '../domain/worker';
import { workerStatus } from './worker-status';
export type Resource = Producer | Consumer | SnsTopic | SqsQueue | Subscription;
export const escapeHtml = (v: unknown) => String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export const allResources = (t: AwsTopology): Resource[] => [...t.producers,...t.topics,...t.queues,...t.subscriptions,...t.consumers];

export function details(r: Resource, t: AwsTopology) {
  const name = (id?: string) => {
    const item = allResources(t).find(n=>n.id===id);
    return item && 'name' in item ? item.name : 'Nenhum';
  };
  const stat = (label: string, value: unknown) => `<div><span>${escapeHtml(label)}</span><b>${escapeHtml(value)}</b></div>`;
  let content = '';
  if(r.kind==='producer') content=stat('Enviadas',r.sent)+stat('Destino',name(r.targetId));
  if(r.kind==='topic') content=stat('Publicadas',r.published)+stat('Assinaturas',t.subscriptions.filter(s=>s.topicId===r.id).length)+stat('Deduplicação por conteúdo',r.contentDeduplication?'Ativa':'Inativa');
  if(r.kind==='queue') {
    const messages=t.messages.filter(m=>m.queueId===r.id&&['available','delayed'].includes(m.state));
    content=stat('Disponíveis',r.metrics.available)+stat('Em voo',r.metrics.inFlight)+stat('Atrasadas',r.metrics.delayed)+
      `<div class="queue-preview">${messages.length?messages.slice(0,4).map(m=>`<i title="${escapeHtml(m.state)}">${escapeHtml(m.id.slice(-4))}</i>`).join(''):'FILA VAZIA'}</div>`+
      stat('Visibilidade',`${r.visibilityTimeout}s`)+stat('Delay',`${r.delaySeconds}s`)+stat('Retenção',`${r.retentionSeconds}s`)+stat('DLQ',name(r.deadLetterQueueId));
    const waiting=t.messages.filter(m=>m.queueId===r.id&&m.state==='in-flight'&&m.retryArrivesAt!==undefined&&Date.now()>=m.retryArrivesAt);
    if(waiting.length) content+=`<div class="retry-waiting"><i class="worker-message-dot"></i><span>${waiting.length} aguardando retry (invisível)</span></div>`;
  }
  if(r.kind==='consumer') {
    const config=workerConfig(r.worker);
    content=stat('Status',({idle:'Ocioso',polling:'Aguardando polling',busy:'Processando'})[r.status])+
      stat('Modo',config.autoProcess?'Automático':'Manual')+stat('Processamento',`${config.processingSeconds}s`)+
      stat('Sucessos',r.processed)+stat('Descartadas',r.discarded??0)+stat('Retries',r.retries??0)+stat('Fila',name(r.queueId));
  }
  if(r.kind==='subscription') content=stat('SNS',name(r.topicId))+stat('SQS',name(r.queueId))+stat('Entrega',r.rawDelivery?'Bruta':'Envelope')+stat('Filtro',Object.keys(r.filter).length?JSON.stringify(r.filter):'Todas as mensagens');
  return `${r.kind==='consumer'?`<div class="worker-visual">${workerStatus(r,t)}</div>`:''}<div class="card-stats">${content}</div>`;
}

// Validate a detached candidate, including resources that reference it, before committing.
export function updateResource(t: AwsTopology, id: string, values: Record<string, unknown>): string | undefined {
  const current = allResources(t).find(r=>r.id===id);
  if(!current) return 'O recurso não existe mais.';
  const candidate = {...current,...values,id:current.id,kind:current.kind} as Resource;
  if('name' in candidate) {
    if(!candidate.name.trim()) return 'Informe um nome.';
    if(/[<>&"']/.test(candidate.name)) return 'O nome contém caracteres inválidos.';
    if(allResources(t).some(r=>r.id!==id&&r.kind===candidate.kind&&'name' in r&&r.name===candidate.name)) return 'Já existe um recurso com esse nome.';
  }
  const queues=t.queues.map(q=>candidate.kind==='queue'&&q.id===id?candidate:q);
  const topics=t.topics.map(q=>candidate.kind==='topic'&&q.id===id?candidate:q);
  for(const q of queues) {
    const error=validateQueue(q,queues);
    if(error) return error;
    if(q.deadLetterQueueId===q.id) return 'Uma fila não pode ser sua própria DLQ.';
  }
  for(const topic of topics) { const error=validateTopic(topic); if(error) return error; }
  for(const s of t.subscriptions.map(s=>candidate.kind==='subscription'&&s.id===id?candidate:s)) {
    const topic=topics.find(n=>n.id===s.topicId),queue=queues.find(n=>n.id===s.queueId);
    if(!topic||!queue) return 'Selecione um tópico e uma fila existentes.';
    if(!compatibleKinds(topic.queueKind,queue.queueKind)) return 'Os tipos do tópico e da fila devem ser compatíveis.';
    if(t.subscriptions.some(other=>other.id!==s.id&&other.topicId===s.topicId&&other.queueId===s.queueId)) return 'Esta assinatura já existe.';
  }
  if(candidate.kind==='producer'&&!topics.some(n=>n.id===candidate.targetId)&&!queues.some(n=>n.id===candidate.targetId)) return 'Destino não encontrado.';
  if(candidate.kind==='consumer') {
    const error=validateWorker(candidate.worker); if(error) return error;
    if(!queues.some(n=>n.id===candidate.queueId)) return 'Fila não encontrada.';
    if(current.kind==='consumer'&&current.status!=='idle'&&candidate.queueId!==current.queueId) return 'Aguarde o consumidor ficar ocioso antes de trocar a fila.';
  }
  if('queueKind' in candidate && 'queueKind' in current && candidate.queueKind!==current.queueKind &&
    t.messages.some(m=>(m.queueId===id||m.sourceId===id)&&['publishing','available','delayed','in-flight','redriven'].includes(m.state))) return 'Esvazie as mensagens ativas antes de alterar o tipo.';
  Object.assign(current, values);
}

export function mountInspector(host: HTMLElement, r: Resource, t: AwsTopology, saved:()=>void, close:()=>void) {
  const input=(label:string,key:string,value:unknown,type='text',min?:number,max?:number)=>
    `<label>${label}<input name="${key}" type="${type}" value="${escapeHtml(value??'')}" ${type==='number'?`min="${min}" max="${max}" step="1"`:''} required></label>`;
  const select=(label:string,key:string,value:string,items:{id:string;name:string}[])=>`<label>${label}<select name="${key}">${items.map(i=>`<option value="${escapeHtml(i.id)}" ${i.id===value?'selected':''}>${escapeHtml(i.name)}</option>`).join('')}</select></label>`;
  const check=(label:string,key:string,value:boolean)=>`<label class="check"><input type="checkbox" name="${key}" ${value?'checked':''}>${label}</label>`;
  let fields='name' in r?input('Nome','name',r.name):'';
  if('queueKind' in r) fields+=select('Tipo','queueKind',r.queueKind,[{id:'standard',name:'Standard'},{id:'fifo',name:'FIFO'}]);
  if(r.kind==='topic') fields+=check('Deduplicação por conteúdo (FIFO)','contentDeduplication',r.contentDeduplication);
  if(r.kind==='queue') fields+=input('Delay (segundos)','delaySeconds',r.delaySeconds,'number',0,900)+input('Visibilidade (segundos)','visibilityTimeout',r.visibilityTimeout,'number',0,43200)+input('Retenção (segundos)','retentionSeconds',r.retentionSeconds,'number',60,1209600)+input('Long polling (segundos)','longPollingSeconds',r.longPollingSeconds,'number',0,20)+select('DLQ','deadLetterQueueId',r.deadLetterQueueId??'',[{id:'',name:'Sem DLQ'},...t.queues.filter(q=>q.id!==r.id)])+input('Máximo de recebimentos','maxReceiveCount',r.maxReceiveCount??5,'number',1,1000);
  if(r.kind==='producer') {
    fields+=select('Destino','targetId',r.targetId,[...t.topics.map(n=>({...n,name:`SNS · ${n.name}`})),...t.queues.map(n=>({...n,name:`SQS · ${n.name}`}))]);
    const template=r.messageTemplate??{body:'{"orderId":"order-001"}',attributes:{eventType:'order.created'}};
    fields+=`<label>Corpo da mensagem<textarea name="messageBody" rows="3">${escapeHtml(template.body)}</textarea></label><label>MessageAttributes (JSON)<textarea name="messageAttributes" rows="4">${escapeHtml(JSON.stringify(template.attributes,null,2))}</textarea></label><label>MessageGroupId (FIFO)<input name="groupId" value="${escapeHtml(template.groupId??'')}"></label><label>MessageDeduplicationId (FIFO, opcional)<input name="deduplicationId" value="${escapeHtml(template.deduplicationId??'')}"></label><p>Salve antes de publicar. No exemplo FIFO, repetir o ID demonstra a deduplicação.</p>`;
  }
  if(r.kind==='consumer') {
    const config=workerConfig(r.worker);
    fields+=select('Fila SQS','queueId',r.queueId,t.queues)+
      check('Processar automaticamente após receber','autoProcess',config.autoProcess)+
      input('Tempo de processamento automático (segundos)','processingSeconds',config.processingSeconds,'number',0,43200)+
      select('Resultado simulado','outcome',config.outcome,[{id:'success',name:'Sucesso — DeleteMessage'},{id:'failure',name:'Falha — aplicar política abaixo'}])+
      select('Ao falhar','failureAction',config.failureAction,[{id:'retry',name:'Retry — devolver após espera'},{id:'discard',name:'Descartar — DeleteMessage, sem retry'},{id:'wait',name:'Parar — aguardar visibility timeout'}])+
      input('Espera para retry (segundos)','retryDelaySeconds',config.retryDelaySeconds,'number',0,43200)+
      check('Polling contínuo (uma mensagem por vez)','autoPoll',config.autoPoll)+
      input('Intervalo entre polls (segundos)','pollIntervalSeconds',config.pollIntervalSeconds,'number',1,300)+
      '<p>Configurações de processamento valem para a próxima recepção. O tempo começa após a chegada visual. Se a visibilidade expirar antes, a mensagem volta à fila; descarte é irreversível nesta simulação. Retry preserva a política de DLQ da fila.</p>';
  }
  if(r.kind==='subscription') fields+=select('Tópico SNS','topicId',r.topicId,t.topics)+select('Fila SQS','queueId',r.queueId,t.queues)+check('Entrega bruta','rawDelivery',r.rawDelivery)+`<label>Filtro de atributos (JSON)<textarea name="filter" rows="4">${escapeHtml(JSON.stringify(r.filter,null,2))}</textarea></label>`;
  host.dataset.editorId=r.id;
  host.innerHTML=`<h2>Editar ${escapeHtml({producer:'produtor',topic:'tópico SNS',queue:'fila SQS',subscription:'assinatura',consumer:'consumidor'}[r.kind])}</h2><p>As alterações são aplicadas ao salvar.</p><form>${fields}<p class="form-error" role="alert"></p><div class="editor-actions"><button type="submit">Salvar alterações</button><button type="button" data-close>Fechar</button></div></form>`;
  host.querySelector<HTMLButtonElement>('[data-close]')!.onclick=close;
  host.querySelector('form')!.onsubmit=e=>{
    e.preventDefault();
    const form=host.querySelector('form')!;
    if(!form.reportValidity()) return;
    const data=new FormData(form), values:Record<string,unknown>={};
    data.forEach((value,key)=>{ values[key]=String(value).trim(); });
    for(const key of ['delaySeconds','visibilityTimeout','retentionSeconds','longPollingSeconds','maxReceiveCount']) if(key in values) values[key]=Number(values[key]);
    if(r.kind==='topic') values.contentDeduplication=values.queueKind==='fifo'&&data.has('contentDeduplication');
    if(r.kind==='queue'&&!values.deadLetterQueueId) {values.deadLetterQueueId=undefined;values.maxReceiveCount=undefined;}
    try {
      if(r.kind==='consumer') {
        values.worker={autoProcess:data.has('autoProcess'),autoPoll:data.has('autoPoll'),
          processingSeconds:Number(values.processingSeconds),retryDelaySeconds:Number(values.retryDelaySeconds),
          pollIntervalSeconds:Number(values.pollIntervalSeconds),outcome:values.outcome,failureAction:values.failureAction};
        for(const key of ['autoProcess','autoPoll','processingSeconds','retryDelaySeconds','pollIntervalSeconds','outcome','failureAction']) delete values[key];
      }
      if(r.kind==='producer') {
        const attributes:unknown=JSON.parse(String(values.messageAttributes));
        if(!attributes||Array.isArray(attributes)||typeof attributes!=='object'||Object.values(attributes).some(v=>typeof v!=='string')) throw new Error('MessageAttributes deve ser um objeto JSON com valores de texto.');
        values.messageTemplate={body:String(data.get('messageBody')??''),attributes,groupId:values.groupId||undefined,deduplicationId:values.deduplicationId||undefined};
        for(const key of ['messageBody','messageAttributes','groupId','deduplicationId']) delete values[key];
      }
      if(r.kind==='subscription') {
        values.rawDelivery=data.has('rawDelivery');
        const filter:unknown=JSON.parse(String(values.filter));
        if(!filter||Array.isArray(filter)||typeof filter!=='object'||Object.values(filter).some(v=>typeof v!=='string')) throw new Error('Use um objeto JSON com valores de texto.');
        values.filter=filter;
      }
      const error=updateResource(t,r.id,values);
      if(error) throw new Error(error);
      saved();
    } catch(error) {host.querySelector('.form-error')!.textContent=(error as Error).message;}
  };
}
