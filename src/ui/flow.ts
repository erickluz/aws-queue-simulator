export interface Point { x: number; y: number }

// Both the connection and its travelling dot use this exact cubic curve.
export function connectionCurve(from: Point, to: Point) {
  const middle = (from.x + to.x) / 2;
  return { from, to, c1: { x: middle, y: from.y }, c2: { x: middle, y: to.y } };
}
export function curvePath(curve: ReturnType<typeof connectionCurve>) {
  const { from, to, c1, c2 } = curve;
  return `M ${from.x} ${from.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${to.x} ${to.y}`;
}
export function curvePoint(curve: ReturnType<typeof connectionCurve>, progress: number): Point {
  const t = Math.max(0, Math.min(1, progress)), u = 1 - t;
  const { from, to, c1, c2 } = curve;
  return {
    x: u ** 3 * from.x + 3 * u ** 2 * t * c1.x + 3 * u * t ** 2 * c2.x + t ** 3 * to.x,
    y: u ** 3 * from.y + 3 * u ** 2 * t * c1.y + 3 * u * t ** 2 * c2.y + t ** 3 * to.y,
  };
}
