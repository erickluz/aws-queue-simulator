import './style.css';
import './interaction.css';
import './glass.css';
import './ui/editor.css';
import './ui/card-details.css';
import './ui/workspace.css';
import { CanvasViewport, worldDelta } from './ui/viewport';
import { allResources, details, escapeHtml as esc, mountInspector } from './ui/card-details';
import { openResourceDialog } from './ui/resource-editor';
import { connectionCurve, curvePath, curvePoint } from './ui/flow';
import { connectionInfo } from './ui/connections';
import { createPreset } from './ui/presets';
import { AwsSimulationEngine } from './core/engine';
import { SEGMENT_DURATION } from './core/delivery';
import { exportTopology, importTopology } from './domain/serialization';
import type { ResourceKind } from './domain/types';

const engine=new AwsSimulationEngine();
const app=document.querySelector<HTMLDivElement>('#app')!;
const viewport=new CanvasViewport();
const labels:Record<ResourceKind,string>={producer:'PRODUTOR',topic:'TÓPICO SNS',queue:'FILA SQS',subscription:'ASSINATURA',consumer:'CONSUMIDOR'};
let selectedId:string|undefined;
let editorHost:HTMLElement|undefined;
let dragging=false;
let logFilter='all';
let renderedKey='';
let animationFrame=0;
let viewportInitialized=false;
const button=(label:string,action:string)=>`<button data-action="${esc(action)}">${esc(label)}</button>`;
const resources=()=>allResources(engine.state.topology);
function selectResource(id?:string) {
  selectedId=id; editorHost=undefined;
  (document.activeElement as HTMLElement|null)?.blur();
  refresh(); app.querySelector('aside')?.scrollTo({top:0});
}
function render() {
  const t=engine.state.topology;
  const width=Math.max(1900,...resources().map(r=>r.position.x+340));
  const height=Math.max(1000,...resources().map(r=>r.position.y+600));
  app.innerHTML=`<header><div><b>AWS Queue Lab</b><span>SNS + SQS visual simulator</span></div><nav>
    ${button('Novo tópico','topic')}${button('Nova fila','queue')}${button('Assinatura','subscription')}${button('Produtor','producer')}${button('Consumidor','consumer')}${button('Exportar','export')}
    <label class="file">Importar<input id="import" type="file" accept="application/json"></label></nav></header>
    <main><section class="workspace"><div class="canvas-controls" role="toolbar" aria-label="Navegação do canvas">
      <button data-view="out" aria-label="Diminuir zoom">−</button><output aria-live="polite">100%</output><button data-view="in" aria-label="Aumentar zoom">+</button>
      <button data-view="reset">100%</button><button data-view="fit">Enquadrar</button><span>Arraste o fundo · Espaço + arraste · Ctrl + roda: zoom</span></div>
    <div class="canvas-viewport" tabindex="0" aria-label="Área da topologia"><div class="canvas" id="canvas" style="width:${width}px;height:${height}px">
    <svg aria-label="Conexões SNS e SQS"></svg>
    ${resources().map(r=>`<article tabindex="0" aria-label="${esc(labels[r.kind])}: ${esc('name' in r?r.name:'Assinatura SNS')}" class="node ${labels[r.kind]} ${r.id===selectedId?'selected':''}" data-id="${esc(r.id)}" style="left:${r.position.x}px;top:${r.position.y}px">
      <small>${labels[r.kind]}</small><strong>${esc('name' in r?r.name:Object.keys(r.filter).length?'Filtro ativo':'Todas as mensagens')}</strong>
      ${'queueKind' in r?`<em>${r.queueKind.toUpperCase()}</em>`:''}${details(r,t)}</article>`).join('')}
    </div></div></section><aside>
    <section id="resource-actions"></section>
    <section><h2>Mensagens em processamento</h2><p>ReceiveMessage retira da área disponível. Somente DeleteMessage conclui o processamento; timeout permite reentrega.</p>
    ${t.messages.filter(m=>m.state==='in-flight').map(m=>`<div class="message"><b>${esc(m.id)}</b><small>Receipt: ${esc(m.receiptHandle)}</small>
      <p>MessageAttributes: ${esc(JSON.stringify(m.attributes))}<br>ApproximateReceiveCount: ${m.receivedCount}</p>
      ${m.consumerId?`${button('Concluir — DeleteMessage',`delete:${m.id}`)} ${button('Retry',`retry:${m.id}`)} ${button('Descartar',`discard:${m.id}`)} ${button('Aguardar timeout',`abandon:${m.id}`)} ${button('Visibility +30s',`visibility:${m.id}`)}`:'<p>Aguardando reentrega após visibilidade.</p>'}</div>`).join('')||'<p>Nenhuma mensagem em voo.</p>'}</section>
    <section><h2>Eventos</h2><select id="filter"><option value="all">Todos</option><option value="timeout">Timeout</option><option value="redrive">Redrive</option><option value="deduplicated">Deduplicação</option><option value="worker">Worker</option><option value="retry">Retry</option><option value="discard">Descarte</option></select><ol>
    ${engine.state.logs.filter(l=>logFilter==='all'||l.type===logFilter).slice(0,12).map(l=>`<li><b>${l.type}</b> ${esc(l.message)}</li>`).join('')}</ol></section>
    <section><h2>Presets</h2>${button('SNS fan-out','preset:fanout')}${button('Filtro de atributo','preset:filter')}${button('FIFO/deduplicação','preset:fifo')}${button('Retry e DLQ','preset:retry')}</section>
    </aside></main><dialog id="modal"></dialog>`;
}
function action(value:string) {
  const split=value.indexOf(':');
  const kind=split<0?value:value.slice(0,split), id=split<0?'':value.slice(split+1);
  if(['topic','queue','subscription','producer','consumer'].includes(kind)) {
    openResourceDialog(engine,kind as ResourceKind,refresh); return;
  }
  if(kind==='preset') {
    selectedId=undefined; editorHost=undefined;
    engine.load(createPreset(id));
    viewport.fit();
    return;
  }
  if(kind==='publish') {
    const producer=engine.state.topology.producers.find(p=>p.id===id)!;
    const target=engine.topic(producer.targetId)??engine.queue(producer.targetId);
    const template=producer.messageTemplate??{body:'{"orderId":"order-001"}',attributes:{eventType:'order.created'}};
    const options=target?.queueKind==='fifo'?{groupId:template.groupId||'orders',deduplicationId:template.deduplicationId||crypto.randomUUID()}:{};
    const error=target?.kind==='queue'?engine.sendFromProducer(id,template.body,template.attributes,options):engine.publishFromProducer(id,template.body,template.attributes,options);
    if(!error) producer.sent++;
  }
  if(kind==='poll') engine.poll(id);
  if(kind==='delete') engine.deleteMessage(id);
  if(kind==='retry') engine.retryMessage(id);
  if(kind==='discard') engine.deleteMessage(id,true);
  if(kind==='abandon') engine.abandonMessage(id);
  if(kind==='visibility') engine.changeVisibility(id,30);
  if(kind==='export') {
    const url=URL.createObjectURL(new Blob([exportTopology(engine.state.topology)],{type:'application/json'}));
    const a=document.createElement('a'); a.href=url; a.download='aws-topology.json'; a.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  refresh();
}
function edgeCurve(from:string,to:string) {
  const a=resources().find(r=>r.id===from),b=resources().find(r=>r.id===to);
  const elements=Array.from(app.querySelectorAll<HTMLElement>('.node'));
  const ae=elements.find(e=>e.dataset.id===from),be=elements.find(e=>e.dataset.id===to);
  if(!a||!b||!ae||!be||from===to) return;
  if(a.position.x===b.position.x) return connectionCurve(
    {x:a.position.x+ae.offsetWidth/2,y:a.position.y+ae.offsetHeight},
    {x:b.position.x+be.offsetWidth/2,y:b.position.y});
  return connectionCurve({x:a.position.x+ae.offsetWidth,y:a.position.y+ae.offsetHeight/2},{x:b.position.x,y:b.position.y+be.offsetHeight/2});
}
function updateConnections() {
  const svg=app.querySelector('svg'); if(!svg) return;
  svg.innerHTML=connectionInfo(engine.state.topology).map(e=>{
    const curve=edgeCurve(e.from,e.to); if(!curve) return '';
    const mid=curvePoint(curve,.5), words=e.label.split(' · ');
    return `<g class="flow-connection"><title>${esc(e.label)}</title><path d="${curvePath(curve)}"/>
      <text class="connection-label" x="${mid.x}" y="${mid.y-30}" text-anchor="middle">
      ${words.map((w,i)=>`<tspan x="${mid.x}" dy="${i?14:0}">${esc(w.length>25?w.slice(0,24)+'…':w)}</tspan>`).join('')}</text></g>`;
  }).join('')+'<g class="flow-particles"></g>';
}
function animateFlow() {
  const layer=app.querySelector('.flow-particles'),time=Date.now();
  const dots=engine.state.animations.flatMap(a=>{
    const elapsed=time-a.startedAt;
    if(elapsed<0||elapsed>=a.duration||a.nodes.length<2) return [];
    const segment=Math.floor(elapsed/SEGMENT_DURATION);
    const curve=edgeCurve(a.nodes[segment],a.nodes[segment+1]); if(!curve) return [];
    const p=curvePoint(curve,(elapsed%SEGMENT_DURATION)/SEGMENT_DURATION);
    return [`<circle class="flow-dot-halo" cx="${p.x}" cy="${p.y}" r="12"/><circle class="flow-dot" cx="${p.x}" cy="${p.y}" r="5"/>`];
  });
  if(layer) layer.innerHTML=dots.join('');
  animationFrame=requestAnimationFrame(animateFlow);
}
function drag(el:HTMLElement) {
  let moved=false;
  let start:{x:number;y:number;left:number;top:number;pointer:number}|undefined;
  el.onpointerdown=e=>{
    if(e.button!==0||viewport.space) return;
    const r=resources().find(r=>r.id===el.dataset.id); if(!r) return;
    start={x:e.clientX,y:e.clientY,left:r.position.x,top:r.position.y,pointer:e.pointerId};
    dragging=true; moved=false; el.classList.add('dragging'); el.setPointerCapture(e.pointerId); e.preventDefault();
  };
  el.onpointermove=e=>{
    if(!start||e.pointerId!==start.pointer) return;
    if(Math.hypot(e.clientX-start.x,e.clientY-start.y)>4) moved=true;
    if(!moved) return;
    const r=resources().find(r=>r.id===el.dataset.id)!;
    r.position={x:Math.max(0,start.left+worldDelta(e.clientX-start.x,viewport.view.scale)),y:Math.max(60,start.top+worldDelta(e.clientY-start.y,viewport.view.scale))};
    el.style.left=`${r.position.x}px`;el.style.top=`${r.position.y}px`; updateConnections();
  };
  const finish=(cancel=false)=>{
    if(!start) return;
    const pointer=start.pointer;start=undefined;dragging=false;el.classList.remove('dragging');
    if(el.hasPointerCapture(pointer)) el.releasePointerCapture(pointer);
    if(!moved&&!cancel) selectResource(el.dataset.id); else refresh();
  };
  el.onpointerup=()=>finish();el.onpointercancel=()=>finish(true);el.onlostpointercapture=()=>finish(true);
  el.onkeydown=e=>{if(e.target===el&&e.key==='Enter'){e.preventDefault();selectResource(el.dataset.id);}};
}
function refresh() {
  if(dragging||app.querySelector('dialog[open]')) return;
  const clock=engine.state.topology.messages.some(m=>m.processingEndsAt)?Math.floor(Date.now()/1000):0;
  const key=JSON.stringify([engine.state.topology,engine.state.logs,selectedId,logFilter,clock]);
  if(key===renderedKey) return;
  const focused=app.querySelector('input:focus,select:focus,textarea:focus');
  // The editor survives renders, including unfinished edits and focus.
  if(focused&&!(editorHost?.contains(focused))) return;
  renderedKey=key;
  const focus=focused as HTMLElement|null;
  const sidebarScroll=app.querySelector('aside')?.scrollTop??0;
  editorHost?.remove(); render();
  if(selectedId) {
    const r=resources().find(r=>r.id===selectedId);
    if(r) {
      if(!editorHost) {
        editorHost=document.createElement('section');
        mountInspector(editorHost,r,engine.state.topology,()=>{
          editorHost=undefined;(document.activeElement as HTMLElement|null)?.blur();refresh();
        },()=>selectResource());
      }
      app.querySelector('aside')!.prepend(editorHost);
    } else {selectedId=undefined;editorHost=undefined;}
  }
  const actions=app.querySelector('#resource-actions')!;
  const selected=resources().find(r=>r.id===selectedId);
  actions.innerHTML=selected?`<h2>Ações do recurso</h2>${
    selected.kind==='producer'?button(engine.queue(selected.targetId)?'Enviar SQS':'Publicar SNS',`publish:${selected.id}`):
    selected.kind==='consumer'?button('Receber mensagem (polling)',`poll:${selected.id}`):
    '<p>Edite as propriedades acima.</p>'}`:'<h2>Inspector</h2><p>Clique em um card para editar e acessar suas ações. Arraste para reposicionar.</p>';
  if(selected?.kind==='consumer'&&selected.status==='busy') actions.querySelector('button')!.disabled=true;
  app.querySelectorAll<HTMLButtonElement>('[data-action]').forEach(b=>b.onclick=()=>action(b.dataset.action!));
  app.querySelector<HTMLInputElement>('#import')!.onchange=async e=>{
    const file=(e.target as HTMLInputElement).files?.[0];if(!file) return;
    try {const t=importTopology(await file.text());selectedId=undefined;editorHost=undefined;engine.load(t);viewport.fit();}
    catch(error){alert((error as Error).message);}
  };
  const filter=app.querySelector<HTMLSelectElement>('#filter')!;filter.value=logFilter;
  filter.onchange=()=>{logFilter=filter.value;filter.blur();refresh();};
  app.querySelectorAll<HTMLElement>('.node').forEach(drag);
  updateConnections();
  viewport.bind(app.querySelector<HTMLElement>('.canvas-viewport')!,app.querySelector<HTMLElement>('.canvas')!,app.querySelector<HTMLElement>('.canvas-controls')!,active=>{dragging=active;if(!active) refresh();});
  if(!viewportInitialized) {viewportInitialized=true;viewport.fit();}
  app.querySelector('aside')?.scrollTo({top:sidebarScroll});
  if(focus&&editorHost?.contains(focus)) focus.focus({preventScroll:true});
}
engine.load(createPreset());
const unsubscribe=engine.subscribe(refresh);
refresh();animationFrame=requestAnimationFrame(animateFlow);
const hot=(import.meta as ImportMeta & {hot?:{dispose(callback:()=>void):void}}).hot;
hot?.dispose(()=>{unsubscribe();engine.destroy();viewport.dispose();cancelAnimationFrame(animationFrame);});
