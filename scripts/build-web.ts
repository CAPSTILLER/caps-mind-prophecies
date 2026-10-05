import * as esbuild from 'esbuild';
import path from 'node:path';

await esbuild.build({
  entryPoints: [path.join('web', 'client.ts')],
  outfile: path.join('web', 'app.js'),
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: ['es2022'],
  sourcemap: true,
  logLevel: 'info',
});

console.log('built web/app.js');
