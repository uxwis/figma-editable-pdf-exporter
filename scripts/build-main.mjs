import { build } from 'esbuild'

await build({
  entryPoints: ['src/code.ts'],
  outfile: 'dist/code.js',
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2020',
  sourcemap: false,
  logLevel: 'info',
})
