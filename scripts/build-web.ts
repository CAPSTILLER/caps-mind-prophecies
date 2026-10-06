import * as esbuild from 'esbuild';
import path from 'node:path';

const bundles: Array<[entry: string, out: string]> = [
  ['client.ts', 'app.js'],
  ['key-page.ts', 'key-page.js'],
];

for (const [entry, out] of bundles) {
  await esbuild.build({
    entryPoints: [path.join('web', entry)],
    outfile: path.join('web', out),
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: ['es2022'],
    sourcemap: true,
    logLevel: 'info',
  });
}

console.log('built web/app.js and web/key-page.js');
