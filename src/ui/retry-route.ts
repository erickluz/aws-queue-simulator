import type { Box } from './connection-layout';
import { connectionCurve, curvePoint, type Point } from './flow';
type Curve=ReturnType<typeof connectionCurve>;
const middle=(a:Point,b:Point):Point=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2});
function intersects(curve:Curve,box:Box,depth=0):boolean {
  const points=[curve.from,curve.c1,curve.c2,curve.to];
  if(Math.max(...points.map(p=>p.x))<=box.x||Math.min(...points.map(p=>p.x))>=box.x+box.width||
    Math.max(...points.map(p=>p.y))<=box.y||Math.min(...points.map(p=>p.y))>=box.y+box.height) return false;
  if(depth===12) return true;
  const a=middle(curve.from,curve.c1),b=middle(curve.c1,curve.c2),c=middle(curve.c2,curve.to);
  const d=middle(a,b),e=middle(b,c),m=middle(d,e);
  return intersects({from:curve.from,c1:a,c2:d,to:m},box,depth+1)||intersects({from:m,c1:e,c2:c,to:curve.to},box,depth+1);
}
function ports(b:Box) {
  return [
    {point:{x:b.x,y:b.y+b.height*.75},normal:{x:-1,y:0}},
    {point:{x:b.x+b.width,y:b.y+b.height*.75},normal:{x:1,y:0}},
    {point:{x:b.x+b.width/2,y:b.y},normal:{x:0,y:-1}},
    {point:{x:b.x+b.width/2,y:b.y+b.height},normal:{x:0,y:1}},
  ];
}
// Retry uses one cubic Bézier, like ordinary connections. When obstructed,
// try other attachment sides and control-point distances without introducing elbows.
export function retryRoute(from:Box,to:Box,others:Box[]):Curve|undefined {
  const obstacles=[from,to,...others.map(b=>({x:b.x-12,y:b.y-12,width:b.width+24,height:b.height+24}))];
  const sources=ports(from),targets=ports(to);
  const left=from.x>to.x;
  const direct=connectionCurve(sources[left?0:1].point,targets[left?1:0].point);
  const clear=(curve:Curve)=>!obstacles.some(box=>intersects(curve,box));
  if(clear(direct)) return direct;
  const span=Math.max(160,Math.max(...obstacles.map(b=>b.x+b.width))-Math.min(...obstacles.map(b=>b.x)),
    Math.max(...obstacles.map(b=>b.y+b.height))-Math.min(...obstacles.map(b=>b.y)));
  let best:Curve|undefined,bestLength=Infinity;
  for(const factor of [.2,.4,.7,1.2,2,4]) for(const source of sources) for(const target of targets) {
    const distance=span*factor;
    const curve={from:source.point,to:target.point,
      c1:{x:source.point.x+source.normal.x*distance,y:source.point.y+source.normal.y*distance},
      c2:{x:target.point.x+target.normal.x*distance,y:target.point.y+target.normal.y*distance}};
    let length=0,previous=curve.from;
    for(let i=1;i<=24;i++){const p=curvePoint(curve,i/24);length+=Math.hypot(p.x-previous.x,p.y-previous.y);previous=p;}
    if(length<bestLength&&clear(curve)){best=curve;bestLength=length;}
  }
  return best;
}
