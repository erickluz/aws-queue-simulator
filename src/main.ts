import './style.css';
import './interaction.css';
import './glass.css';
import './ui/editor.css';
import './ui/card-details.css';
import { details, mountInspector } from './ui/card-details';
import { openResourceDialog } from './ui/resource-editor';
import { connectionCurve, curvePath, curvePoint } from './ui/flow';
import { AwsSimulationEngine } from './core/engine';
import { exportTopology, importTopology } from './domain/serialization';
import type { Consumer, Producer, SnsTopic, SqsQueue, Subscription } from './domain/types';

const engine = new AwsSimulationEngine(); const app = document.querySelector<HTMLDivElement>('#app')!;
const uid = (p: string) => `${p}-${crypto.randomUUID().slice(0, 5)}`;
const pos = (x: number, y: number) => ({ x, y });
function button(label: string, action: string) { return `<button data-action="${action}">${label}</button>`; }
function seed() { const topic: SnsTopic = { id: 'topic-orders', kind: 'topic', name: 'orders', queueKind: 'standard', contentDeduplication: false, position: pos(360, 220), published: 0 }; const queue: SqsQueue = { id: 'queue-orders', kind: 'queue', name: 'orders-processing', queueKind: 'standard', delaySeconds: 0, visibilityTimeout: 30, retentionSeconds: 345600, longPollingSeconds: 5, position: pos(640, 220), metrics: { sent: 0, available: 0, delayed: 0, inFlight: 0, received: 0, deleted: 0, redriven: 0, deduplicated: 0, expired: 0 } }; const producer: Producer = { id: 'producer-api', kind: 'producer', name: 'Order API', targetId: topic.id, position: pos(70, 220), sent: 0 }; const subscription: Subscription = { id: 'sub-orders', kind: 'subscription', topicId: topic.id, queueId: queue.id, filter: {}, rawDelivery: false, position: pos(510, 220) }; const consumer: Consumer = { id: 'consumer-worker', kind: 'consumer', name: 'Order worker', queueId: queue.id, position: pos(900, 220), status: 'idle', processed: 0 }; engine.load({ format: 'aws-queue-simulator/v1', name: 'Fluxo de pedidos SNS/SQS', producers: [producer], topics: [topic], queues: [queue], subscriptions: [subscription], consumers: [consumer], messages: [] }); }
function render() { const { topology, logs, animations } = engine.state; const node = (kind: string, name: string, id: string, x: number, y: number, content: string) => `<article class="node ${kind}" data-id="${id}" style="left:${x}px;top:${y}px"><small>${kind}</small><strong>${name}</strong>${content}</article>`; app.innerHTML = `<header><div><b>AWS Queue Lab</b><span>SNS + SQS visual simulator</span></div><nav>${button('Novo tópico','topic')} ${button('Nova fila','queue')} ${button('Assinatura','subscription')} ${button('Produtor','producer')} ${button('Consumidor','consumer')} ${button('Exportar','export')} <label class="file">Importar<input id="import" type="file" accept="application/json" /></label></nav></header><main><section class="workspace"><div class="canvas" id="canvas"><svg aria-hidden="true">${topology.producers.map(p=>`<path d="M ${p.position.x+170} ${p.position.y+55} C 270 ${p.position.y+55}, 300 275, 360 275"/>`).join('')}${topology.subscriptions.map(s=>{const t=topology.topics.find(i=>i.id===s.topicId)!;const q=topology.queues.find(i=>i.id===s.queueId)!;return `<path d="M ${t.position.x+170} ${t.position.y+55} C 560 ${t.position.y+55}, 570 ${q.position.y+55}, ${q.position.x} ${q.position.y+55}"/>`}).join('')}${topology.consumers.map(c=>{const q=topology.queues.find(i=>i.id===c.queueId)!;return `<path d="M ${q.position.x+170} ${q.position.y+55} L ${c.position.x} ${c.position.y+55}"/>`}).join('')}</svg>${topology.producers.map(p=>node('PRODUTOR',p.name,p.id,p.position.x,p.position.y,`${button('Publicar','publish:'+p.id)}`)).join('')}${topology.topics.map(t=>node('TÓPICO SNS',t.name,t.id,t.position.x,t.position.y,`<em>${t.queueKind.toUpperCase()}</em>`)).join('')}${topology.subscriptions.map(s=>node('ASSINATURA',Object.keys(s.filter).length?'Filtro ativo':'Todas as mensagens',s.id,s.position.x,s.position.y,`<em>${s.rawDelivery?'Raw':'Envelope'}</em>`)).join('')}${topology.queues.map(q=>node('FILA SQS',q.name,q.id,q.position.x,q.position.y,`<span>${q.metrics.available} disponível · ${q.metrics.inFlight} em voo</span>`)).join('')}${topology.consumers.map(c=>node('CONSUMIDOR',c.name,c.id,c.position.x,c.position.y,`${button(c.status==='busy'?'Em processamento':'Poll','poll:'+c.id)}`)).join('')}${animations.map(a=>`<i class="packet" title="${a.label}">${a.label}</i>`).join('')}</div></section><aside><section><h2>Inspector</h2><p>Selecione um recurso ou use as ações nos cartões. O processamento bem-sucedido é concluído por <code>DeleteMessage</code>.</p><div id="message-actions">${topology.messages.filter(m=>m.state==='in-flight').map(m=>`<div class="message"><b>${m.id}</b><small>Receipt: ${m.receiptHandle}</small>${button('DeleteMessage','delete:'+m.id)} ${button('Visibility +30s','visibility:'+m.id)}</div>`).join('') || '<p>Nenhuma mensagem em voo.</p>'}</div></section><section><h2>Eventos</h2><select id="filter"><option value="all">Todos</option><option value="timeout">Timeout</option><option value="redrive">Redrive</option><option value="deduplicated">Deduplicação</option></select><ol>${logs.filter(l=>{const f=(document.querySelector('#filter') as HTMLSelectElement)?.value??'all';return f==='all'||l.type===f;}).slice(0,12).map(l=>`<li><b>${l.type}</b> ${l.message}</li>`).join('')}</ol></section><section><h2>Presets</h2>${button('SNS fan-out','preset:fanout')} ${button('Filtro de atributo','preset:filter')} ${button('FIFO/deduplicação','preset:fifo')} ${button('Retry e DLQ','preset:retry')}</section></aside></main><dialog id="modal"><form method="dialog"><h2 id="modal-title"></h2><div id="modal-fields"></div><menu><button value="cancel">Cancelar</button><button value="default" id="save">Salvar</button></menu></form></dialog>`; bind(); }
function bind() { app.querySelectorAll<HTMLButtonElement>('[data-action]').forEach(el=>el.onclick=()=>action(el.dataset.action!)); app.querySelector<HTMLInputElement>('#import')!.onchange=async e=>{const file=(e.target as HTMLInputElement).files?.[0];if(!file)return;try{engine.load(importTopology(await file.text()));}catch(error){alert((error as Error).message)}}; app.querySelector<HTMLSelectElement>('#filter')!.onchange=render; document.querySelectorAll<HTMLElement>('.node').forEach(drag); }
function action(value: string) { const [kind, id] = value.split(':'); if (kind==='publish') engine.publish(engine.state.topology.producers.find(p=>p.id===id)!.targetId, JSON.stringify({ orderId: Math.floor(Math.random()*9999) }), { eventType:'order.created' }); if(kind==='poll') engine.poll(id); if(kind==='delete') engine.deleteMessage(id); if(kind==='visibility') engine.changeVisibility(id,30); if(kind==='export'){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([exportTopology(engine.state.topology)],{type:'application/json'}));a.download='aws-topology.json';a.click();} if(['topic','queue','subscription','producer','consumer'].includes(kind)) modal(kind); if(kind==='preset') preset(id); }
function modal(kind:string) { const dialog=app.querySelector<HTMLDialogElement>('#modal')!; app.querySelector('#modal-title')!.textContent=`Criar ${kind}`; const fields=app.querySelector('#modal-fields')!; fields.innerHTML=kind==='queue'?'<label>Nome<input name="name" required value="new-queue" /></label><label>Tipo<select name="queueKind"><option value="standard">Standard</option><option value="fifo">FIFO</option></select></label><label>Delay (0–900s)<input name="delay" type="number" value="0" /></label><label>Visibility (0–43200s)<input name="visibility" type="number" value="30" /></label>':`<label>Nome<input name="name" required value="new-${kind}" /></label>`; app.querySelector<HTMLButtonElement>('#save')!.onclick=e=>{e.preventDefault();const f=new FormData(dialog.querySelector('form')!);const name=String(f.get('name'));if(kind==='queue')engine.addQueue({id:uid('queue'),kind:'queue',name,queueKind:String(f.get('queueKind')) as 'standard'|'fifo',delaySeconds:Number(f.get('delay')),visibilityTimeout:Number(f.get('visibility')),retentionSeconds:345600,longPollingSeconds:0,position:pos(640,80+engine.state.topology.queues.length*135),metrics:{sent:0,available:0,delayed:0,inFlight:0,received:0,deleted:0,redriven:0,deduplicated:0,expired:0}});else if(kind==='topic')engine.addTopic({id:uid('topic'),kind:'topic',name,queueKind:'standard',contentDeduplication:false,position:pos(360,80),published:0}); else alert('Selecione recursos existentes no cenário para criar esta conexão no editor completo.');dialog.close();};dialog.showModal(); }
let dragging = false;
let logFilter = 'all';
let selectedId: string | undefined;
let editorHost: HTMLElement | undefined;
function selectResource(id?: string) {
  selectedId=id;
  editorHost=undefined;
  (document.activeElement as HTMLElement | null)?.blur();
  refresh();
  app.querySelector('aside')?.scrollTo({top:0});
}
function resources() {
  const t = engine.state.topology;
  return [...t.producers, ...t.topics, ...t.subscriptions, ...t.queues, ...t.consumers];
}
function updateConnections() {
  const svg = app.querySelector('svg');
  if (!svg) return;
  const t = engine.state.topology;
  const edges = [
    ...t.producers.map(p => [p.id, p.targetId]),
    ...t.subscriptions.flatMap(s => [[s.topicId, s.id], [s.id, s.queueId]]),
    ...t.consumers.map(c => [c.queueId, c.id]),
  ];
  svg.innerHTML = edges.map(([from, to]) => {
    const curve = edgeCurve(from, to);
    return curve ? `<path d="${curvePath(curve)}"/>` : '';
  }).join('') + '<g class="flow-particles"></g>';
}
function edgeCurve(from: string, to: string) {
  const nodes = resources();
  const a = nodes.find(n => n.id === from), b = nodes.find(n => n.id === to);
  const elements = Array.from(app.querySelectorAll<HTMLElement>('.node'));
  const aElement = elements.find(el => el.dataset.id === from);
  const bElement = elements.find(el => el.dataset.id === to);
  if (!a || !b || !aElement || !bElement) return undefined;
  return connectionCurve(
    { x: a.position.x + aElement.offsetWidth, y: a.position.y + aElement.offsetHeight / 2 },
    { x: b.position.x, y: b.position.y + bElement.offsetHeight / 2 },
  );
}
const routes = new Map<string, { nodes: string[]; start: number; messageId: string }>();
let visualTopology = engine.state.topology;
const segmentDuration = 850;
function captureDeliveries() {
  const t = engine.state.topology;
  if (visualTopology !== t) {
    routes.clear();
    selectedId=undefined;
    editorHost=undefined;
    visualTopology = t;
  }
  for (const animation of engine.state.animations) {
    if (routes.has(animation.id)) continue;
    const subscription = t.subscriptions.find(s => s.id === animation.fromId);
    const producer = subscription && t.producers.find(p => p.targetId === subscription.topicId);
    const nodes = subscription
      ? [...(producer ? [producer.id] : []), subscription.topicId, subscription.id, animation.toId]
      : [animation.fromId, animation.toId];
    const preceding = [...routes.values()].filter(route => route.messageId === animation.messageId);
    const start = Math.max(animation.startedAt, ...preceding.map(route => route.start + (route.nodes.length - 1) * segmentDuration));
    routes.set(animation.id, { nodes, start, messageId: animation.messageId });
  }
}
function animateFlow() {
  const time = Date.now();
  const layer = app.querySelector('.flow-particles');
  const dots: string[] = [];
  for (const [id, route] of routes) {
    const elapsed = time - route.start;
    const duration = (route.nodes.length - 1) * segmentDuration;
    if (elapsed >= duration) {
      // Keep a completed route until the engine has retired its event.
      if (!engine.state.animations.some(a => a.id === id)) routes.delete(id);
      continue;
    }
    if (elapsed < 0) continue;
    const segment = Math.floor(elapsed / segmentDuration);
    const curve = edgeCurve(route.nodes[segment], route.nodes[segment + 1]);
    if (!curve) continue;
    const point = curvePoint(curve, (elapsed % segmentDuration) / segmentDuration);
    dots.push(`<circle class="flow-dot-halo" cx="${point.x}" cy="${point.y}" r="12"/><circle class="flow-dot" cx="${point.x}" cy="${point.y}" r="5"/>`);
  }
  if (layer) layer.innerHTML = dots.join('');
  requestAnimationFrame(animateFlow);
}
function drag(el: HTMLElement) {
  let moved = false;
  let start: { x: number; y: number; left: number; top: number; pointer: number } | undefined;
  el.onpointerdown = event => {
    if (event.button !== 0 || (event.target as HTMLElement).closest('button,input,select,textarea,a')) return;
    const resource = resources().find(item => item.id === el.dataset.id);
    if (!resource) return;
    start = { x: event.clientX, y: event.clientY, left: resource.position.x, top: resource.position.y, pointer: event.pointerId };
    dragging = true;
    moved = false;
    el.classList.add('dragging');
    el.setPointerCapture(event.pointerId);
    event.preventDefault();
  };
  el.onpointermove = event => {
    if (!start || event.pointerId !== start.pointer) return;
    if(Math.hypot(event.clientX-start.x,event.clientY-start.y)>4) moved=true;
    if(!moved) return;
    const resource = resources().find(item => item.id === el.dataset.id);
    if (!resource) return;
    resource.position = {
      x: Math.max(0, start.left + event.clientX - start.x),
      y: Math.max(0, start.top + event.clientY - start.y),
    };
    el.style.left = `${resource.position.x}px`;
    el.style.top = `${resource.position.y}px`;
    updateConnections();
  };
  const finish = () => {
    if (!start) return;
    const pointer = start.pointer;
    start = undefined;
    dragging = false;
    el.classList.remove('dragging');
    if (el.hasPointerCapture(pointer)) el.releasePointerCapture(pointer);
    if(!moved) selectResource(el.dataset.id);
    else refresh();
  };
  el.onpointerup = finish;
  el.onpointercancel = finish;
  el.onlostpointercapture = finish;
  el.tabIndex=0;
  el.onkeydown=event=>{
    if(event.target===el&&(event.key==='Enter'||event.key===' ')) {event.preventDefault();selectResource(el.dataset.id);}
  };
}
function refresh() {
  captureDeliveries();
  // Preserve live controls while the scheduler continues updating simulation state.
  if (dragging || app.querySelector<HTMLDialogElement>('dialog')?.open ||
      app.querySelector('input:focus,select:focus,textarea:focus')) return;
  const sidebarScroll = app.querySelector('aside')?.scrollTop ?? 0;
  editorHost?.remove();
  render();
  for(const element of Array.from(app.querySelectorAll<HTMLElement>('.node'))) {
    const resource=resources().find(r=>r.id===element.dataset.id)!;
    element.classList.toggle('selected',resource.id===selectedId);
    const extra=document.createElement('div');
    extra.innerHTML=details(resource,engine.state.topology);
    element.append(extra);
    const inspect=document.createElement('button');
    inspect.textContent='Inspecionar / editar';
    inspect.onclick=()=>selectResource(resource.id);
    element.append(inspect);
  }
  if(selectedId) {
    const resource=resources().find(r=>r.id===selectedId);
    if(resource) {
      if(!editorHost) {
        editorHost=document.createElement('section');
        mountInspector(editorHost,resource,engine.state.topology,()=>{
          editorHost=undefined;
          (document.activeElement as HTMLElement | null)?.blur();
          refresh();
        },()=>selectResource());
      }
      app.querySelector('aside')!.prepend(editorHost);
    } else {selectedId=undefined;editorHost=undefined;}
  }
  for (const kind of ['topic','queue','subscription','producer','consumer'] as const) {
    app.querySelector<HTMLButtonElement>(`[data-action="${kind}"]`)!.onclick = () => openResourceDialog(engine, kind, refresh);
  }
  app.querySelectorAll<HTMLButtonElement>('[data-action^="publish:"]').forEach(button => {
    const producer = engine.state.topology.producers.find(p=>button.dataset.action === `publish:${p.id}`)!;
    const target = engine.topic(producer.targetId) ?? engine.queue(producer.targetId);
    button.textContent = target?.kind === 'queue' ? 'Enviar SQS' : 'Publicar SNS';
    button.onclick = () => {
      const body = JSON.stringify({orderId:crypto.randomUUID()});
      const options = target?.queueKind === 'fifo' ? {groupId:'pedidos',deduplicationId:crypto.randomUUID()} : {};
      const error = target?.kind === 'queue'
        ? engine.sendFromProducer(producer.id,body,{eventType:'order.created'},options)
        : engine.publish(producer.targetId,body,{eventType:'order.created'},options);
      if(!error) producer.sent++;
      refresh();
    };
  });
  updateConnections();
  const filter = app.querySelector<HTMLSelectElement>('#filter')!;
  filter.value = logFilter;
  filter.onchange = () => {
    logFilter = filter.value;
    filter.blur();
    refresh();
  };
  app.querySelectorAll('aside ol li').forEach(item => {
    if (logFilter !== 'all' && item.querySelector('b')?.textContent !== logFilter) item.remove();
  });
  const sidebar = app.querySelector('aside');
  if (sidebar) sidebar.scrollTop = sidebarScroll;
}
function preset(name:string){seed();const t=engine.state.topology; if(name==='fanout'){const q=structuredClone(t.queues[0]);q.id='queue-audit';q.name='audit';q.position=pos(640,380);t.queues.push(q);t.subscriptions.push({id:'sub-audit',kind:'subscription',topicId:'topic-orders',queueId:q.id,filter:{},rawDelivery:true,position:pos(510,380)});} if(name==='filter')t.subscriptions[0].filter={eventType:'order.created'}; if(name==='fifo'){t.topics[0].name='orders.fifo';t.topics[0].queueKind='fifo';t.topics[0].contentDeduplication=true;t.queues[0].name='orders.fifo';t.queues[0].queueKind='fifo';} if(name==='retry'){const dlq=structuredClone(t.queues[0]);dlq.id='queue-dlq';dlq.name='orders-dlq';dlq.position=pos(640,420);t.queues.push(dlq);t.queues[0].deadLetterQueueId=dlq.id;t.queues[0].maxReceiveCount=1;}engine.load(t);}
seed();
// Leave room for the subscription card between SNS and SQS.
engine.state.topology.topics[0].position.x = 300;
engine.state.topology.subscriptions[0].position.x = 540;
engine.state.topology.queues[0].position.x = 740;
engine.state.topology.consumers[0].position.x = 1000;
engine.subscribe(refresh); refresh();
requestAnimationFrame(animateFlow);
