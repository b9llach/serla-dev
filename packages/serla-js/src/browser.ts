// IIFE entry point. tsup wraps this with `globalName: 'Serla'` so consumers can
// use it as `<script src="serla.min.js"></script>` and then `Serla.init({...})`.
export { Serla as default } from './index';
export * from './index';
