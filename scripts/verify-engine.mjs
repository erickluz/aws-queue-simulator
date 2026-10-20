import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
await build({ entryPoints: ['src/verify-engine.ts'], bundle: true, platform: 'node', format: 'esm', outfile: '.verify-engine.mjs' });
const result = spawnSync(process.execPath, ['.verify-engine.mjs'], { stdio: 'inherit' });
process.exitCode = result.status ?? 1;
