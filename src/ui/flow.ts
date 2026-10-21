export interface Point { x: number; y: number }
export interface Polyline { points:Point[]; cornerRadius?:number }
export type FlowRoute = ReturnType<typeof connectionCurve> | Polyline;

interface Segment { from:Point; to:Point; control?:Point; length:number }
const segmentCache=new WeakMap<Polyline,Segment[]>();
function segmentPoint(segment:Segment,t:number):Point {
  const {from:a,to:b,control:c}=segment;
  if(!c) return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};
  const u=1-t;
  return {x:u*u*a.x+2*u*t*c.x+t*t*b.x,y:u*u*a.y+2*u*t*c.y+t*t*b.y};
}
function routeSegments(route:Polyline) {
  const cached=segmentCache.get(route);if(cached) return cached;
  const segments:Segment[]=[],points=route.points;
  let cursor=points[0];
  const add=(to:Point,control?:Point)=>{
    const segment:Segment={from:cursor,to,control,length:0};let previous=cursor;
    const steps=control?20:1;
    for(let i=1;i<=steps;i++) {
      const p=segmentPoint(segment,i/steps);segment.length+=Math.hypot(p.x-previous.x,p.y-previous.y);previous=p;
    }
    if(segment.length>0) segments.push(segment);cursor=to;
  };
  for(let i=1;i<points.length-1;i++) {
    const a=points[i-1],b=points[i],c=points[i+1];
    const incoming=Math.hypot(b.x-a.x,b.y-a.y),outgoing=Math.hypot(c.x-b.x,c.y-b.y);
    const radius=Math.min(route.cornerRadius??0,incoming/2,outgoing/2);
    if(radius<=0) {add(b);continue;}
    add({x:b.x+(a.x-b.x)*radius/incoming,y:b.y+(a.y-b.y)*radius/incoming});
    add({x:b.x+(c.x-b.x)*radius/outgoing,y:b.y+(c.y-b.y)*radius/outgoing},b);
  }
  if(points.length>1) add(points[points.length-1]);
  segmentCache.set(route,segments);return segments;
}

// Both the connection and its travelling dot use this exact cubic curve.
export function connectionCurve(from: Point, to: Point) {
  const middle = (from.x + to.x) / 2;
  return { from, to, c1: { x: middle, y: from.y }, c2: { x: middle, y: to.y } };
}
export function curvePath(curve: FlowRoute) {
  if('points' in curve) return `M ${curve.points[0].x} ${curve.points[0].y} `+routeSegments(curve).map(s=>s.control?`Q ${s.control.x} ${s.control.y} ${s.to.x} ${s.to.y}`:`L ${s.to.x} ${s.to.y}`).join(' ');
  const { from, to, c1, c2 } = curve;
  return `M ${from.x} ${from.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${to.x} ${to.y}`;
}
export function curvePoint(curve: FlowRoute, progress: number): Point {
  if('points' in curve) {
    const segments=routeSegments(curve);
    let remaining=Math.max(0,Math.min(1,progress))*segments.reduce((sum,s)=>sum+s.length,0);
    for(const segment of segments) {
      if(remaining<=segment.length) return segmentPoint(segment,remaining/segment.length);
      remaining-=segment.length;
    }
    return curve.points[curve.points.length-1];
  }
  const t = Math.max(0, Math.min(1, progress)), u = 1 - t;
  const { from, to, c1, c2 } = curve;
  return {
    x: u ** 3 * from.x + 3 * u ** 2 * t * c1.x + 3 * u * t ** 2 * c2.x + t ** 3 * to.x,
    y: u ** 3 * from.y + 3 * u ** 2 * t * c1.y + 3 * u * t ** 2 * c2.y + t ** 3 * to.y,
  };
}
