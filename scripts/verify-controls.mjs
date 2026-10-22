import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// DOM interaction checks, not visual/layout assertions.
const bundle=await build({entryPoints:['src/main.ts'],bundle:true,write:false,format:'iife',loader:{'.css':'empty'},define:{'import.meta.hot':'undefined'},logLevel:'silent'});
const dom=new JSDOM(await readFile('index.html','utf8'),{url:'http://localhost',runScripts:'outside-only',pretendToBeVisual:true});
const w=dom.window,d=w.document;
w.structuredClone=structuredClone;
let tick=()=>{};
let time=Date.now();
w.Date.now=()=>time;
w.setInterval=callback=>{tick=callback;return 0;};
w.requestAnimationFrame=()=>0;
w.HTMLElement.prototype.scrollTo=()=>{};
w.SVGElement.prototype.getBBox=()=>({x:0,y:0,width:120,height:40});
Object.defineProperty(w.SVGElement.prototype,'transform',{get:()=>({baseVal:{consolidate:()=>null}})});
w.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};
w.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
w.confirm=()=>true;
const one=selector=>{const el=d.querySelector(selector);assert.ok(el,selector);return el;};
const click=selector=>one(selector).click();
const select=id=>one(`[data-id="${id}"]`).dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
const submit=selector=>one(selector).dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
try {
  w.eval(bundle.outputFiles[0].text);
  assert.match(d.title,/Trama/);
  assert.equal(one('link[rel="icon"]').getAttribute('href'),'./brand/trama-symbol.svg');
  assert.equal(one('.brand-symbol').getAttribute('src'),'./brand/trama-symbol.svg');
  assert.match(one('.app-footer').textContent,/Sem conexão com a AWS/);
  assert.equal(one('.session-stats b').textContent,String(d.querySelectorAll('.node').length));
  for(const file of ['trama-logo.svg','trama-symbol.svg']) {
    const asset=new w.DOMParser().parseFromString(await readFile(`public/brand/${file}`,'utf8'),'image/svg+xml');
    assert.equal(asset.querySelector('parsererror'),null);
    assert.equal(asset.documentElement.localName,'svg');
  }
  assert.equal(d.querySelectorAll('.resource-menu [data-action]').length,5);
  for(const [id,fields] of [
    ['producer-api',['name','targetId','intervalMs','messagesPerEmission','invalidPercent','deduplicationMode','messageBody','messageAttributes','groupId','deduplicationId']],
    ['consumer-worker',['name','queueId','autoProcess','autoPoll','batchSize','concurrency','processingSeconds','outcome','failureAction','retryDelaySeconds','limitRetries','maxRetries','pollIntervalSeconds']],
    ['queue-orders',['name','queueKind','delaySeconds','visibilityTimeout','retentionSeconds','longPollingSeconds','deadLetterQueueId','maxReceiveCount']],
    ['topic-orders',['name','queueKind','contentDeduplication']],
    ['sub-orders',['topicId','queueId','rawDelivery','filter']]
  ]) {
    select(id);
    for(const field of fields) assert.equal(d.querySelectorAll(`[data-editor-id] fieldset [name="${field}"]`).length,1,field);
    submit('[data-editor-id] form');
    assert.equal(one('.form-error').textContent,'');
  }
  select('producer-api');
  const name=one('[data-editor-id] [name="name"]');name.value='Draft producer';name.dispatchEvent(new w.Event('input',{bubbles:true}));
  assert.equal(one('.save-status').textContent,'Alterações não salvas');
  for(const tab of ['messages','events','presets','config']) {
    click(`[data-panel-tab="${tab}"]`);
    assert.equal(one(`#panel-${tab}`).hidden,false);
    assert.equal(one(`[data-panel-tab="${tab}"]`).getAttribute('aria-pressed'),'true');
  }
  assert.equal(one('[data-editor-id] [name="name"]'),name,'Draft DOM must survive tab changes');
  submit('[data-editor-id] form');
  assert.equal(one('[data-id="producer-api"] strong').textContent,'Draft producer');
  click('[data-action="start-production:producer-api"]');
  one('[data-action="pause-production:producer-api"]');
  one('.resource-menu').open=true;
  one('.resource-menu [data-action="queue"]').focus();
  time+=1000;tick();
  assert.equal(one('.resource-menu').open,true);
  assert.equal(d.activeElement,one('.resource-menu [data-action="queue"]'),'Keyboard focus survives simulation updates');
  click('[data-action="pause-production:producer-api"]');
  click('[data-action="publish:producer-api"]');
  one('[data-action="start-production:producer-api"]');
  select('sub-orders');one('[name="filter"]').value='not json';submit('[data-editor-id] form');
  assert.ok(one('.form-error').textContent);
  one('[name="filter"]').value='{}';submit('[data-editor-id] form');
  for(const kind of ['topic','queue','producer','consumer','subscription']) {
    one('.resource-menu').open=true;click(`.resource-menu [data-action="${kind}"]`);
    assert.ok(one('#modal').open);assert.equal(one('.resource-menu').open,false);
    const name=d.querySelector('#modal [name="name"]');if(name) name.value=`test-${kind}`;
    if(kind==='subscription') one('#modal [name="queueId"]').selectedIndex=1;
    const count=d.querySelectorAll('.node').length;
    submit('#modal form');assert.equal(one('#modal').open,false);
    assert.equal(d.querySelectorAll('.node').length,count+1);
    assert.equal(one('.session-stats b').textContent,String(count+1));
  }
  one('.resource-menu').open=true;
  one('.resource-menu').dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  assert.equal(one('.resource-menu').open,false);
  select('consumer-worker');one('[data-action="poll:consumer-worker"]');
  click('[data-action="new"]');
  assert.equal(one('.session-stats').textContent,'0 recursos0 filas0 mensagens ativas');
  assert.match(one('.brand-name').textContent,/trama/);
  console.log('PASS controls: all resource fields, save/validation, draft preservation, tabs, production actions, five creation dialogs and Escape');
} finally {w.close();}
