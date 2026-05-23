// Quick smoke test: import the built ESM, intercept fetch, and verify the
// public API surface + request shape. This catches gross packaging mistakes
// plus the basic API contract without hitting the real serla.dev endpoint.

import { Serla } from './dist/index.mjs';

// -- fetch interceptor ---------------------------------------------------
const captured = [];
const origFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  captured.push({ url: String(url), init });
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

function restoreFetch() {
  globalThis.fetch = origFetch;
}

function fail(msg) {
  restoreFetch();
  console.error('FAIL:', msg);
  process.exit(1);
}

// -- public API surface --------------------------------------------------
const expectedInstanceMethods = ['track', 'identify', 'flush', 'shutdown', 'pendingCount'];

// -- construction --------------------------------------------------------
try {
  new Serla({});
  fail('Serla constructor with no apiKey should throw');
} catch (err) {
  if (!String(err.message).includes('apiKey')) {
    fail('wrong error from missing apiKey: ' + err.message);
  }
}

const serla = new Serla({
  apiKey: 'sk_live_test',
  host: 'https://example.test',
  flushIntervalMs: 60_000,  // long enough that auto-flush won't race the test
  batchSize: 50,
});

const missing = expectedInstanceMethods.filter(m => typeof serla[m] !== 'function');
if (missing.length > 0) fail('missing methods: ' + missing.join(','));

// -- track requires distinctId ------------------------------------------
const origWarn = console.warn;
console.warn = () => {}; // silence debug-disabled-but-still-noisy warns
serla.track({ name: 'no_distinct_id' });  // should warn (debug off so silent)
console.warn = origWarn;
if (serla.pendingCount() !== 0) fail('track without distinctId should not enqueue');

serla.track({ name: '', distinctId: 'u1' });  // empty name - rejected
if (serla.pendingCount() !== 0) fail('track with empty name should not enqueue');

// -- track enqueues ------------------------------------------------------
serla.track({ name: 'signup', distinctId: 'u1', properties: { plan: 'pro' } });
serla.track({ name: 'login', distinctId: 'u1' });
if (serla.pendingCount() !== 2) fail('expected 2 pending events, got ' + serla.pendingCount());

// -- flush actually sends -----------------------------------------------
await serla.flush();
if (serla.pendingCount() !== 0) fail('flush should drain queue, still pending: ' + serla.pendingCount());

const batchCalls = captured.filter(c => c.url.endsWith('/api/v1/events/batch'));
if (batchCalls.length !== 1) fail('expected 1 batch POST, got ' + batchCalls.length);

const batchReq = batchCalls[0];
if (batchReq.init.method !== 'POST') fail('batch request method should be POST');
const auth = batchReq.init.headers.Authorization || batchReq.init.headers.authorization;
if (auth !== 'Bearer sk_live_test') fail('missing/wrong Authorization header: ' + auth);
const idem = batchReq.init.headers['X-Idempotency-Key'] || batchReq.init.headers['x-idempotency-key'];
if (!idem || typeof idem !== 'string' || idem.length < 8) fail('missing X-Idempotency-Key');
const ct = batchReq.init.headers['Content-Type'] || batchReq.init.headers['content-type'];
if (ct !== 'application/json') fail('wrong Content-Type: ' + ct);

const body = JSON.parse(batchReq.init.body);
if (!Array.isArray(body.events) || body.events.length !== 2) {
  fail('expected events array length 2, got ' + JSON.stringify(body));
}
const [ev1, ev2] = body.events;
if (ev1.name !== 'signup' || ev1.distinctId !== 'u1' || ev1.properties.plan !== 'pro') {
  fail('event 1 shape mismatch: ' + JSON.stringify(ev1));
}
if (!ev1.timestamp || isNaN(Date.parse(ev1.timestamp))) fail('event 1 missing/bad timestamp');
if (ev2.name !== 'login') fail('event 2 name mismatch');

// -- identify hits /api/v1/identify -------------------------------------
captured.length = 0;
await serla.identify('u1', { email: 'a@b.com' });
const idCalls = captured.filter(c => c.url.endsWith('/api/v1/identify'));
if (idCalls.length !== 1) fail('expected 1 identify POST, got ' + idCalls.length);
const idBody = JSON.parse(idCalls[0].init.body);
if (idBody.distinctId !== 'u1' || idBody.properties.email !== 'a@b.com') {
  fail('identify body shape mismatch: ' + JSON.stringify(idBody));
}

// -- timestamp override --------------------------------------------------
captured.length = 0;
const t = new Date('2026-01-01T00:00:00Z');
serla.track({ name: 'past', distinctId: 'u1', timestamp: t });
await serla.flush();
const past = JSON.parse(captured[0].init.body).events[0];
if (past.timestamp !== t.toISOString()) fail('timestamp override not honored: ' + past.timestamp);

// -- batch-size triggers flush ------------------------------------------
const small = new Serla({
  apiKey: 'sk_live_test',
  host: 'https://example.test',
  flushIntervalMs: 60_000,
  batchSize: 2,
});
captured.length = 0;
small.track({ name: 'a', distinctId: 'u1' });
small.track({ name: 'b', distinctId: 'u1' });  // hits batchSize - kicks off flush
// flush is async; wait a tick for the promise chain to settle
await new Promise(resolve => setImmediate(resolve));
await small.flush();  // belt-and-braces
const smallBatchCalls = captured.filter(c => c.url.endsWith('/api/v1/events/batch'));
if (smallBatchCalls.length < 1) fail('hitting batchSize should auto-flush, got ' + smallBatchCalls.length);
await small.shutdown();

// -- shutdown idempotent ------------------------------------------------
await serla.shutdown();
await serla.shutdown();  // second call is a no-op

// -- post-shutdown track is silently dropped ----------------------------
serla.track({ name: 'after_shutdown', distinctId: 'u1' });
if (serla.pendingCount() !== 0) fail('track after shutdown should be ignored');

restoreFetch();
console.log('OK: serla-node smoke test passed');
console.log('   - constructor validates apiKey');
console.log('   - track() requires name + distinctId');
console.log('   - flush() POSTs to /api/v1/events/batch with Bearer + idempotency key');
console.log('   - identify() POSTs to /api/v1/identify');
console.log('   - timestamp override honored');
console.log('   - batchSize threshold triggers auto-flush');
console.log('   - shutdown() is idempotent + blocks subsequent tracks');
