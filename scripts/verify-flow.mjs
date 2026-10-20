import { build } from 'esbuild';
import assert from 'node:assert/strict';

const result = await build({
  entryPoints: ['src/ui/flow.ts'], bundle: true, platform: 'node',
  format: 'esm', write: false,
});
const { connectionCurve, curvePoint, curvePath } = await import(
  `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`
);
for (const [from, to] of [
  [{ x: 180, y: 50 }, { x: 300, y: 50 }],
  [{ x: 180, y: 240 }, { x: 740, y: 400 }],
  [{ x: 1000, y: 400 }, { x: 100, y: 80 }],
]) {
  const curve = connectionCurve(from, to);
  assert.deepEqual(curvePoint(curve, 0), from);
  assert.deepEqual(curvePoint(curve, 1), to);
  assert.deepEqual(curvePoint(curve, .5), { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 });
  assert.equal(curvePath(curve), `M ${from.x} ${from.y} C ${(from.x + to.x) / 2} ${from.y}, ${(from.x + to.x) / 2} ${to.y}, ${to.x} ${to.y}`);
  for (let step = 0; step <= 100; step++) {
    const point = curvePoint(curve, step / 100);
    assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y));
    assert.ok(point.x >= Math.min(from.x, to.x) - 1e-9 && point.x <= Math.max(from.x, to.x) + 1e-9);
  }
}
console.log('Flow geometry passed: straight, curved and reversed connections.');
