// Quick smoke test: import the built ESM and verify the public API surface.
// Doesn't exercise browser-only paths (sendBeacon, History API, localStorage,
// window.onerror) - those need a real browser. This catches gross packaging
// mistakes plus the basic API contract.

import { Serla } from './dist/index.mjs';

const expected = [
  'init',
  'track',
  'identify',
  'setProperties',
  'unsetProperties',
  'getSuperProperties',
  'reset',
  'setOptOut',
  'isOptedOut',
  'flush',
  'shutdown',
  'getDistinctId',
];
const missing = expected.filter(m => typeof Serla[m] !== 'function');

if (missing.length > 0) {
  console.error('FAIL: missing methods on Serla:', missing);
  process.exit(1);
}

let warned = false;
const origWarn = console.warn;
console.warn = (...args) => { warned = true; origWarn(...args); };
Serla.track('test');
console.warn = origWarn;
if (!warned) {
  console.error('FAIL: track() before init() should warn');
  process.exit(1);
}

try {
  Serla.init({});
  console.error('FAIL: init() with no apiKey should throw');
  process.exit(1);
} catch (err) {
  if (!String(err.message).includes('apiKey')) {
    console.error('FAIL: wrong error from init() without apiKey:', err.message);
    process.exit(1);
  }
}

Serla.shutdown();
Serla.init({ apiKey: 'sk_live_test', optOut: true });
Serla.track('test_event');
Serla.identify('test_user');

// Super properties API works even when opted out (it's just local state).
Serla.setProperties({ plan: 'pro', appVersion: '1.0' });
const sup = Serla.getSuperProperties();
if (sup.plan !== 'pro' || sup.appVersion !== '1.0') {
  console.error('FAIL: setProperties/getSuperProperties round-trip failed', sup);
  process.exit(1);
}
Serla.unsetProperties(['appVersion']);
const sup2 = Serla.getSuperProperties();
if (sup2.plan !== 'pro' || 'appVersion' in sup2) {
  console.error('FAIL: unsetProperties did not remove key', sup2);
  process.exit(1);
}

// Opt-out toggle should be queryable.
if (Serla.isOptedOut() !== true) {
  console.error('FAIL: isOptedOut() should be true when init optOut=true');
  process.exit(1);
}
Serla.setOptOut(false);
if (Serla.isOptedOut() !== false) {
  console.error('FAIL: setOptOut(false) did not flip state');
  process.exit(1);
}

Serla.reset();
Serla.shutdown();

console.log('OK: serla-js smoke test passed');
console.log('   - public API surface:', expected.join(', '));
console.log('   - init() validates apiKey');
console.log('   - track() before init() warns gracefully');
console.log('   - setProperties / unsetProperties / getSuperProperties round-trip');
console.log('   - setOptOut / isOptedOut runtime state');
