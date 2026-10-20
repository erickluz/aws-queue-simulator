import type { AwsSimulationEngine } from '../core/engine';
import type { ResourceKind, QueueKind } from '../domain/types';
const escape = (v:string) => v.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function openResourceDialog(engine: AwsSimulationEngine, kind: ResourceKind, done:()=>void) {
  const t=engine.state.topology, dialog=document.querySelector<HTMLDialogElement>('#modal')!;
  const titles={topic:'Novo tópico SNS',queue:'Nova fila SQS',subscription:'Nova assinatura SNS → SQS',producer:'Novo produtor',consumer:'Novo consumidor'};
  const descriptions={topic:'Recebe publicações e distribui cópias por assinaturas.',queue:'Armazena mensagens para recebimento por polling e exclusão por DeleteMessage.',subscription:'Conecta um tópico existente a uma fila existente.',producer:'Publica em SNS ou envia diretamente para SQS.',consumer:'Executa ReceiveMessage em uma fila SQS.'};
  const select=(label:string,name:string,items:{id:string;name:string}[],empty?:string)=>`<label>${label}<select name="${name}" ${empty?'':'required'}>${empty?`<option value="">${empty}</option>`:''}${items.map(i=>`<option value="${escape(i.id)}">${escape(i.name)}</option>`).join('')}</select></label>`;
  const number=(label:string,name:string,value:number,min:number,max:number)=>`<label>${label}<input name="${name}" type="number" value="${value}" min="${min}" max="${max}" step="1" required></label>`;
  const name='<label>Nome<input name="name" required maxlength="80" placeholder="Ex.: pedidos"></label>';
  const type='<label>Tipo<select name="queueKind"><option value="standard">Standard</option><option value="fifo">FIFO</option></select></label><p>FIFO exige nome terminado em .fifo.</p>';
  let fields='';
  if(kind==='topic') fields=name+type+'<label class="check"><input type="checkbox" name="contentDeduplication"> Deduplicação baseada em conteúdo (FIFO)</label>';
  if(kind==='queue') fields=name+type+number('Delay (0–900 segundos)','delay',0,0,900)+number('Visibility timeout (0–43200 segundos)','visibility',30,0,43200)+number('Retenção (60–1209600 segundos)','retention',345600,60,1209600)+number('Long polling (0–20 segundos)','longPolling',0,0,20)+select('DLQ (mesmo tipo)','dlq',t.queues,'Sem DLQ')+number('Máximo de recebimentos para redrive','maxReceiveCount',5,1,1000);
  if(kind==='subscription') fields=select('Tópico SNS','topicId',t.topics)+select('Fila SQS','queueId',t.queues)+'<label>Filtro por atributos (JSON)<textarea name="filter" rows="3">{}</textarea></label><p>Exemplo: {"eventType":"order.created"}. {} aceita todas as mensagens.</p><label class="check"><input name="rawDelivery" type="checkbox"> Entrega bruta (raw delivery)</label>';
  if(kind==='producer') fields=name+select('Destino','targetId',[...t.topics.map(i=>({...i,name:`SNS · ${i.name}`})),...t.queues.map(i=>({...i,name:`SQS · ${i.name}`}))]);
  if(kind==='consumer') fields=name+select('Fila SQS para polling','queueId',t.queues);
  const missing=kind==='subscription'&&(!t.topics.length||!t.queues.length)?'Crie primeiro um tópico SNS e uma fila SQS.':kind==='consumer'&&!t.queues.length?'Crie primeiro uma fila SQS.':kind==='producer'&&!t.topics.length&&!t.queues.length?'Crie primeiro um tópico SNS ou uma fila SQS.':'';
  dialog.innerHTML=`<form><h2>${titles[kind]}</h2><p>${descriptions[kind]}</p>${fields}<p role="alert" class="form-error">${missing}</p><menu><button type="button" data-cancel>Cancelar</button><button type="submit" ${missing?'disabled':''}>Criar</button></menu></form>`;
  const form=dialog.querySelector('form')!;
  dialog.querySelector<HTMLButtonElement>('[data-cancel]')!.onclick=()=>dialog.close();
  form.onsubmit=event=>{
    event.preventDefault();
    if(!form.reportValidity()) return;
    const data=new FormData(form), get=(key:string)=>String(data.get(key)??'').trim(), id=`${kind}-${crypto.randomUUID()}`;
    const all=[...t.producers,...t.topics,...t.queues,...t.subscriptions,...t.consumers];
    const x={producer:70,topic:300,subscription:540,queue:740,consumer:1000}[kind];
    let y=80;
    while(all.some(n=>Math.abs(n.position.x-x)<180&&Math.abs(n.position.y-y)<155)) y+=160;
    const position={x,y};
    try {
      const queueKind=get('queueKind') as QueueKind;
      let error:string|undefined;
      if(kind!=='subscription'&&!get('name')) throw new Error('Informe um nome.');
      if (/[<>&"']/.test(get('name'))) throw new Error('Use letras, números, espaços, pontos, hífens ou sublinhados no nome.');
      if ((kind === 'topic' || kind === 'queue') && all.some(n => n.kind === kind && 'name' in n && n.name === get('name'))) throw new Error('Já existe um recurso desse tipo com esse nome.');
      if(kind==='topic') error=engine.addTopic({id,kind,name:get('name'),queueKind,contentDeduplication:queueKind==='fifo'&&data.has('contentDeduplication'),position,published:0});
      if(kind==='queue') error=engine.addQueue({id,kind,name:get('name'),queueKind,delaySeconds:Number(get('delay')),visibilityTimeout:Number(get('visibility')),retentionSeconds:Number(get('retention')),longPollingSeconds:Number(get('longPolling')),deadLetterQueueId:get('dlq')||undefined,maxReceiveCount:get('dlq')?Number(get('maxReceiveCount')):undefined,position,metrics:{sent:0,available:0,delayed:0,inFlight:0,received:0,deleted:0,redriven:0,deduplicated:0,expired:0}});
      if(kind==='subscription') {
        if(t.subscriptions.some(s=>s.topicId===get('topicId')&&s.queueId===get('queueId'))) throw new Error('Esta fila já possui uma assinatura deste tópico.');
        const filter:unknown=JSON.parse(get('filter'));
        if(!filter||Array.isArray(filter)||typeof filter!=='object'||Object.values(filter).some(v=>typeof v!=='string')) throw new Error('Use um objeto JSON com valores de texto, como {"eventType":"order.created"}.');
        error=engine.addSubscription({id,kind,topicId:get('topicId'),queueId:get('queueId'),filter:filter as Record<string,string>,rawDelivery:data.has('rawDelivery'),position});
      }
      if(kind==='producer') error=engine.addProducer({id,kind,name:get('name'),targetId:get('targetId'),sent:0,position});
      if(kind==='consumer') error=engine.addConsumer({id,kind,name:get('name'),queueId:get('queueId'),status:'idle',processed:0,position});
      if(error) throw new Error(error);
      dialog.close(); done();
    } catch(error) { dialog.querySelector('.form-error')!.textContent=error instanceof SyntaxError?'O filtro precisa ser um JSON válido.':(error as Error).message; }
  };
  dialog.showModal();
}
