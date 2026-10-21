export interface Box { x:number; y:number; width:number; height:number }
export function overlaps(a:Box,b:Box,gap=12) {
  return a.x<b.x+b.width+gap&&a.x+a.width+gap>b.x&&a.y<b.y+b.height+gap&&a.y+a.height+gap>b.y;
}
// Search obstacle boundaries as well as the midpoint, including space outside the cards.
export function placeLabel(anchor:{x:number;y:number},width:number,height:number,obstacles:Box[]):Box {
  const preferred={x:anchor.x-width/2,y:anchor.y-height/2,width,height};
  const xs=[preferred.x,...obstacles.flatMap(b=>[b.x-width-16,b.x+b.width+16])];
  const ys=[preferred.y,...obstacles.flatMap(b=>[b.y-height-16,b.y+b.height+16])];
  let best:Box|undefined, distance=Infinity;
  for(const x of xs) for(const y of ys) {
    const candidate={x,y,width,height};
    const d=(x-preferred.x)**2+(y-preferred.y)**2;
    if(d<distance&&!obstacles.some(b=>overlaps(candidate,b))) {best=candidate;distance=d;}
  }
  return best!;
}
