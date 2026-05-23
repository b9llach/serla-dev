// Quick smoke test: import the built ESM and verify the public API surface.
// Can't render React here without jsdom, so we just check that the exports
// exist, have the right shape, and that the Serla re-export is the same
// singleton as serla-js.

import * as ReactPkg from './dist/index.mjs';
import { Serla as CoreSerla } from 'serla-js';

const expectedFunctions = [
  'SerlaProvider',
  'useSerla',
  'useTrack',
  'useIdentify',
  'useSuperProperties',
  'Track',
];

const missing = expectedFunctions.filter(m => typeof ReactPkg[m] !== 'function');
if (missing.length > 0) {
  console.error('FAIL: missing exports from serla-js-react:', missing);
  process.exit(1);
}

if (!ReactPkg.Serla || typeof ReactPkg.Serla.init !== 'function') {
  console.error('FAIL: Serla re-export missing or wrong shape');
  process.exit(1);
}

if (ReactPkg.Serla !== CoreSerla) {
  console.error('FAIL: Serla re-export is not the same singleton as serla-js');
  process.exit(1);
}

// Component identity: useTrack returns a function, the others are themselves
// functions (hooks / components). Quick sanity check on Track being a
// React component (function returning null when called outside React is fine
// to NOT test; we just check it's defined).
if (ReactPkg.SerlaProvider.length < 1) {
  console.error('FAIL: SerlaProvider should accept props');
  process.exit(1);
}

if (ReactPkg.useTrack.length !== 1) {
  console.error('FAIL: useTrack should accept a single arg (event name)');
  process.exit(1);
}

// useIdentify accepts (distinctId, properties?) - at least 1 declared param.
if (ReactPkg.useIdentify.length < 1) {
  console.error('FAIL: useIdentify should accept at least one arg');
  process.exit(1);
}

if (ReactPkg.useSuperProperties.length !== 1) {
  console.error('FAIL: useSuperProperties should accept a single arg');
  process.exit(1);
}

console.log('OK: serla-js-react smoke test passed');
console.log('   - exports:', expectedFunctions.join(', '), '+ Serla');
console.log('   - Serla re-export is the same singleton as serla-js');
console.log('   - hook arities look right');
