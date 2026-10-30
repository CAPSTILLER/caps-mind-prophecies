import * as esbuild from 'esbuild';
import path from 'node:path';

const bundles: Array<[entry: string, out: string]> = [
  ['client.ts', 'app.js'],
  ['key-page.ts', 'key-page.js'],
  ['faces-page.ts', 'faces-page.js'],
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
    minify: out === 'faces-page.js',
    logLevel: 'info',
  });
}

console.log('built web/app.js, web/key-page.js and web/faces-page.js');
