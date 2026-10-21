import type { AwsTopology, Consumer } from '../domain/types';
import { workerConfig } from '../domain/worker';
export function workerStatus(c:Consumer,t:AwsTopology,time=Date.now()) {
  const message=t.messages.find(m=>m.consumerId===c.id&&m.state==='in-flight');
  const receiving=!!message&&time<(message.processingStartedAt??0);
  const processing=!!message&&!receiving;
  const remaining=message?.processingEndsAt===undefined?undefined:Math.max(0,Math.ceil((message.processingEndsAt-Math.max(time,message.processingStartedAt??time))/1000));
  const mode=receiving?'receiving':processing?'processing':c.status==='polling'?'polling':'idle';
  const label=receiving?'Recebendo mensagem':processing?(remaining===undefined?'Aguardando ação manual':'Processando'):c.status==='polling'?'Aguardando mensagens':'Ocioso';
  const duration=message?.processingEndsAt===undefined?0:message.processingEndsAt-(message.processingStartedAt??time);
  const progress=duration>0?Math.min(100,Math.max(0,Math.floor((time-(message!.processingStartedAt??time))/duration*100))):0;
  return `<div class="worker-status ${mode}"><div class="worker-status-heading"><i class="worker-indicator"></i><b>${label}</b></div>
    <div class="worker-message-slot">${processing?'<i class="worker-message-dot" aria-label="Mensagem no consumidor"></i>':'<i class="worker-empty-slot"></i>'}<span>${receiving?'Mensagem a caminho':processing?(remaining===undefined?'Conclusão manual':`${remaining}s restantes`):'Pronto para receber'}</span></div>
    <progress max="100" value="${progress}" aria-label="Progresso do processamento"></progress>
    ${message?.processingEndsAt&&message.visibilityUntil!==undefined&&message.visibilityUntil<message.processingEndsAt?'<small class="worker-warning">Visibilidade expira antes do processamento.</small>':''}
    ${!workerConfig(c.worker).autoProcess?'<small>Modo manual: o tempo configurado só é aplicado no modo automático.</small>':''}</div>`;
}
