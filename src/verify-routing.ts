import { dragPosition, fitView } from './ui/viewport';
import { retryRoute } from './ui/retry-route';
import { curvePath, curvePoint } from './ui/flow';
import { placeLabel, type Box } from './ui/connection-layout';
import { createPreset } from './ui/presets';
import { exportTopology, importTopology } from './domain/serialization';
const assert=(ok:unknown,message:string)=>{if(!ok) throw new Error(message);};
for(const scale of [.25,.5,1,2]) {
  const p=dragPosition({x:10,y:70},-100,-150,scale);
  assert(p.x===10-100/scale&&p.y===70-150/scale,'Arraste limitado ou sem compensação de zoom');
  const t=createPreset();t.consumers[0].position=p;
  const copy=importTopology(exportTopology(t));assert(copy.consumers[0].position.x===p.x,'Importação perdeu coordenada negativa');
}
const label=placeLabel({x:-500,y:-300},180,60,[]);
assert(label.x===-590&&label.y===-330,'Rótulo ficou preso na origem');
const view=fitView({x:-1000,y:-800,width:1000,height:700},1000,800);
assert(-1000*view.scale+view.x>=0&&-800*view.scale+view.y>=0,'Enquadramento perdeu cards negativos');
const scenes:{from:Box;to:Box;obstacles:Box[]}[]=[
  {from:{x:700,y:0,width:260,height:300},to:{x:0,y:0,width:260,height:400},obstacles:[{x:350,y:-100,width:200,height:650}]},
  {from:{x:0,y:700,width:260,height:300},to:{x:0,y:0,width:260,height:300},obstacles:[{x:-100,y:400,width:600,height:180}]},
  {from:{x:-900,y:-800,width:260,height:300},to:{x:-200,y:-500,width:260,height:400},obstacles:[{x:-500,y:-1000,width:150,height:800}]},
  {from:{x:0,y:0,width:260,height:300},to:{x:700,y:700,width:260,height:300},obstacles:[{x:300,y:150,width:180,height:200},{x:500,y:420,width:180,height:100}]},
];
for(const scene of scenes) {
  const route=retryRoute(scene.from,scene.to,scene.obstacles);assert(route,'Não encontrou desvio');
  if(!route) continue;
  assert(curvePath(route).startsWith('M '),'Trajeto inválido');
  assert(curvePath(route).includes(' C ')&&!/[LQ]/.test(curvePath(route)),'Retry deve usar uma curva cúbica como as conexões convencionais');
  const start=curvePoint(route,0),end=curvePoint(route,1);
  assert(start.x===route.from.x&&start.y===route.from.y&&end.x===route.to.x&&end.y===route.to.y,'Extremos da curva mudaram');
  for(let i=0;i<=1000;i++) {
    const p=curvePoint(route,i/1000);
    for(const box of [scene.from,scene.to,...scene.obstacles]) {
      assert(!(p.x>box.x+.00001&&p.x<box.x+box.width-.00001&&p.y>box.y+.00001&&p.y<box.y+box.height-.00001),'Curva ou bolinha atravessou obstáculo');
    }
  }
}
const rounded={points:[{x:0,y:0},{x:100,y:0},{x:100,y:100}],cornerRadius:32};
assert(curvePath(rounded)==='M 0 0 L 68 0 Q 100 0 100 32 L 100 100','SVG não usa a curva esperada');
const corner=curvePoint(rounded,.5);
assert(Math.abs(corner.x-92)<.000001&&Math.abs(corner.y-8)<.000001,'Bolinha não acompanha a curva quadrática do SVG');
assert(curvePoint(rounded,0).x===0&&curvePoint(rounded,1).y===100,'Extremos do trajeto mudaram');
const from={x:700,y:0,width:260,height:300},to={x:0,y:0,width:260,height:300};
const direct=retryRoute(from,to,[])!;
const mid=curvePoint(direct,.5);
const diverted=retryRoute(from,to,[{x:mid.x-40,y:mid.y-40,width:80,height:80}]);
assert(diverted&&curvePath(diverted)!==curvePath(direct),'Trajeto não reagiu à mudança de obstáculos');
console.log('PASS arraste negativo, zoom, persistência, rótulos negativos, desvios e bolinha sobre o trajeto');
