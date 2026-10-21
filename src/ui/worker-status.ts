import type { AwsTopology, Consumer } from '../domain/types';
import { workerConfig } from '../domain/worker';
export function workerStatus(c:Consumer,t:AwsTopology,time=Date.now()) {
  const messages=t.messages.filter(m=>m.consumerId===c.id&&m.state==='in-flight');
  const config=workerConfig(c.worker);
  const receiving=messages.filter(m=>time<(m.consumerArrivesAt??m.processingStartedAt??0)).length;
  const active=messages.filter(m=>m.processingStartedAt!==undefined&&time>=m.processingStartedAt).length;
  const buffered=messages.length-active-receiving;
  const mode=active?'processing':receiving?'receiving':messages.length?'buffered':c.status==='polling'?'polling':'idle';
  const label=active?'Processando':receiving?'Recebendo mensagens':messages.length?'Aguardando vaga / grupo FIFO':c.status==='polling'?'Aguardando mensagens':'Ocioso';
  const rows=messages.map((m,index)=>{
    const arriving=time<(m.consumerArrivesAt??m.processingStartedAt??0);
    const started=m.processingStartedAt!==undefined&&time>=m.processingStartedAt;
    const remaining=m.processingEndsAt===undefined?undefined:Math.max(0,Math.ceil((m.processingEndsAt-Math.max(time,m.processingStartedAt??time))/1000));
    const duration=m.processingEndsAt===undefined?0:m.processingEndsAt-(m.processingStartedAt??time);
    const progress=duration>0?Math.min(100,Math.max(0,Math.floor((time-(m.processingStartedAt??time))/duration*100))):0;
    return `<div class="worker-message-row"><div class="worker-message-slot">${arriving?'<i class="worker-empty-slot"></i>':`<i class="worker-message-dot ${started?'':'buffered-dot'}" aria-label="Mensagem no consumidor"></i>`}<span>#${index+1} · ${arriving?'A caminho':!started?'Aguardando vaga / grupo':remaining===undefined?'Conclusão manual':`${remaining}s restantes`}</span></div>
      <progress max="100" value="${progress}" aria-label="Progresso da mensagem ${index+1}"></progress></div>`;
  }).join('');
  const warning=messages.some(m=>m.processingEndsAt!==undefined&&m.visibilityUntil!==undefined&&m.visibilityUntil<m.processingEndsAt);
  return `<div class="worker-status ${mode}"><div class="worker-status-heading"><i class="worker-indicator"></i><b>${label}</b></div>
    <small>${active}/${config.concurrency} processando · ${buffered} aguardando · ${receiving} chegando</small>
    <div class="worker-message-list">${rows||'<div class="worker-message-slot"><i class="worker-empty-slot"></i><span>Pronto para receber</span></div>'}</div>
    ${warning?'<small class="worker-warning">Visibilidade expira antes do processamento.</small>':''}
    ${buffered?'<small>Mensagens aguardando também estão sob visibility timeout.</small>':''}
    ${!config.autoProcess?'<small>Modo manual: o tempo configurado só é aplicado no modo automático.</small>':''}</div>`;
}
