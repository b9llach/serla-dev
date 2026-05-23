import { defineConfig } from 'tsup';

export default defineConfig([
  // Library builds: ESM + CJS with type declarations.
  // rrweb is optional and dynamic-imported by the recording module - keep it
  // external so users who don't enable recordSessions don't pay the bundle cost.
  {
    entry: ['src/index.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: true,
    clean: true,
    minify: false,
    target: 'es2020',
    external: ['rrweb'],
  },
  // Browser <script> tag build: IIFE, minified.
  // We bind the module to window._SerlaModule first, then a footer flattens
  // it so window.Serla IS the facade (callable as Serla.init(...) etc).
  // Without the footer, the default export ends up nested at
  // window.Serla.default which breaks the natural <script> tag DX.
  // rrweb stays external so the basic IIFE bundle stays lean. Users who want
  // session replay via the <script> tag should include rrweb on their page
  // before serla.min and the dynamic import will pick up window.rrweb.
  {
    entry: { 'serla.min': 'src/browser.ts' },
    format: ['iife'],
    globalName: '_SerlaModule',
    footer: { js: 'window.Serla=_SerlaModule.default;' },
    dts: false,
    sourcemap: true,
    minify: true,
    target: 'es2020',
    external: ['rrweb'],
  },
]);
