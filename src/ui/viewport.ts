export interface View { x:number; y:number; scale:number }
export const MIN_ZOOM=.25, MAX_ZOOM=2;
export function zoomAt(view:View, scale:number, anchor:{x:number;y:number}):View {
  const next=Math.max(MIN_ZOOM,Math.min(MAX_ZOOM,scale));
  const ratio=next/view.scale;
  return {scale:next,x:anchor.x-(anchor.x-view.x)*ratio,y:anchor.y-(anchor.y-view.y)*ratio};
}
export function worldDelta(delta:number, scale:number) { return delta/scale; }
export function fitView(bounds:{x:number;y:number;width:number;height:number},width:number,height:number):View {
  const scale=Math.max(MIN_ZOOM,Math.min(1,(width-80)/Math.max(1,bounds.width),(height-120)/Math.max(1,bounds.height)));
  return {scale,x:(width-bounds.width*scale)/2-bounds.x*scale,y:60+(height-120-bounds.height*scale)/2-bounds.y*scale};
}
export class CanvasViewport {
  view:View={x:24,y:80,scale:1};
  space=false;
  private viewport?:HTMLElement;
  private canvas?:HTMLElement;
  private controls?:HTMLElement;
  private active=false;
  private keydown=(event:KeyboardEvent)=>{
    if(event.code!=='Space'||!this.active||(event.target as HTMLElement).closest('input,textarea,select,button')) return;
    this.space=true;event.preventDefault();this.viewport?.classList.add('hand-ready');
  };
  private keyup=(event:KeyboardEvent)=>{if(event.code==='Space') this.resetKeys();};
  private resetKeys=()=>{this.space=false;this.viewport?.classList.remove('hand-ready');};
  constructor() {
    window.addEventListener('keydown',this.keydown);window.addEventListener('keyup',this.keyup);window.addEventListener('blur',this.resetKeys);
  }
  dispose() {
    window.removeEventListener('keydown',this.keydown);window.removeEventListener('keyup',this.keyup);window.removeEventListener('blur',this.resetKeys);
  }
  apply() {
    if(this.canvas) this.canvas.style.transform=`translate(${this.view.x}px,${this.view.y}px) scale(${this.view.scale})`;
    const output=this.controls?.querySelector('output');
    if(output) output.textContent=`${Math.round(this.view.scale*100)}%`;
    const minus=this.controls?.querySelector<HTMLButtonElement>('[data-view="out"]');
    const plus=this.controls?.querySelector<HTMLButtonElement>('[data-view="in"]');
    if(minus) minus.disabled=this.view.scale<=MIN_ZOOM;
    if(plus) plus.disabled=this.view.scale>=MAX_ZOOM;
  }
  fit() {
    if(!this.viewport||!this.canvas) return;
    const nodes=Array.from(this.canvas.querySelectorAll<HTMLElement>('.node'));
    if(!nodes.length) {this.view={x:24,y:80,scale:1};this.apply();return;}
    const boxes=nodes.map(n=>({x:n.offsetLeft,y:n.offsetTop,width:n.offsetWidth,height:n.offsetHeight}));
    this.canvas.querySelectorAll<SVGGElement>('.connection-box').forEach(g=>{
      const b=g.getBBox(),matrix=g.transform.baseVal.consolidate()?.matrix;
      boxes.push({x:b.x+(matrix?.e??0),y:b.y+(matrix?.f??0),width:b.width,height:b.height});
    });
    const x=Math.min(...boxes.map(b=>b.x)),y=Math.min(...boxes.map(b=>b.y));
    this.view=fitView({x,y,width:Math.max(...boxes.map(b=>b.x+b.width))-x,height:Math.max(...boxes.map(b=>b.y+b.height))-y},this.viewport.clientWidth,this.viewport.clientHeight);
    this.apply();
  }
  bind(viewport:HTMLElement,canvas:HTMLElement,controls:HTMLElement,gesture:(active:boolean)=>void) {
    this.viewport=viewport;this.canvas=canvas;this.controls=controls;
    viewport.onpointerenter=()=>{this.active=true;};
    viewport.onpointerleave=()=>{this.active=false;};
    const center=()=>({x:viewport.clientWidth/2,y:viewport.clientHeight/2});
    controls.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(b=>b.onclick=()=>{
      if(b.dataset.view==='fit') {this.fit();return;}
      this.view=zoomAt(this.view,b.dataset.view==='reset'?1:this.view.scale*(b.dataset.view==='in'?1.2:1/1.2),center());this.apply();
    });
    viewport.onwheel=event=>{
      event.preventDefault();
      if(event.ctrlKey||event.metaKey) {
        const rect=viewport.getBoundingClientRect();
        this.view=zoomAt(this.view,this.view.scale*Math.exp(-event.deltaY*.002),{x:event.clientX-rect.left,y:event.clientY-rect.top});
      } else {this.view.x-=event.deltaX;this.view.y-=event.deltaY;}
      this.apply();
    };
    let start:{x:number;y:number;view:View;pointer:number}|undefined;
    viewport.addEventListener('pointerdown',event=>{
      const onCard=(event.target as HTMLElement).closest('.node');
      if(event.button!==1&&(event.button!==0||(!this.space&&onCard))) return;
      event.preventDefault();event.stopPropagation();
      start={x:event.clientX,y:event.clientY,view:{...this.view},pointer:event.pointerId};
      viewport.setPointerCapture(event.pointerId);viewport.classList.add('panning');gesture(true);
    },true);
    viewport.onpointermove=event=>{
      if(!start||event.pointerId!==start.pointer) return;
      this.view={...start.view,x:start.view.x+event.clientX-start.x,y:start.view.y+event.clientY-start.y};this.apply();
    };
    const end=()=>{
      if(!start) return;
      const pointer=start.pointer;start=undefined;
      if(viewport.hasPointerCapture(pointer)) viewport.releasePointerCapture(pointer);
      viewport.classList.remove('panning');gesture(false);
    };
    viewport.onpointerup=end;viewport.onpointercancel=end;viewport.onlostpointercapture=end;
    this.apply();
  }
}
