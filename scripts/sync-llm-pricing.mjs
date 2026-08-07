// Refresh lib/llm/model-prices.json from public, community-maintained
// price maps.
//
//   npm run pricing:sync
//
// Sources (merged, first listed wins on conflict):
//   1. LiteLLM   - the canonical map, ~2500 priced models under their
//                  provider-native names (gpt-4o, claude-sonnet-4-5, ...).
//   2. OpenRouter - the aggregator catalog, mirrored in the models.dev repo.
//                  Adds hundreds of models LiteLLM doesn't carry, and tends
//                  to list brand-new releases first.
//
// We snapshot rather than fetch at runtime on purpose: cost computation sits
// on the ingest hot path and must not depend on a third-party host being
// reachable. Re-run this script (and commit the diff) to pick up new models.

import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCES = {
  litellm:
    'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json',
  // OpenRouter's /models response, mirrored in a GitHub repo so this script
  // only ever talks to raw.githubusercontent.com.
  openrouter: 'https://raw.githubusercontent.com/anomalyco/models.dev/dev/models.json',
};

const here = dirname(fileURLToPath(import.meta.url));
const outPath = join(here, '..', 'lib', 'llm', 'model-prices.json');

/** USD per 1M tokens, rounded to a sane precision. */
const perMillion = n => Math.round(n * 1e6 * 1e6) / 1e6;

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return res.json();
}

/**
 * Collected as { model: [input, output] }. `add` never overwrites an entry
 * from an earlier (higher-priority) source.
 */
const prices = {};
const stats = {};
/** model -> which source supplied it, so alias conflicts resolve by priority. */
const origin = {};
const SOURCE_PRIORITY = ['litellm', 'openrouter'];

function add(model, input, output, source) {
  if (!model) return false;
  if (prices[model]) return false;
  prices[model] = [perMillion(input), perMillion(output)];
  origin[model] = source;
  stats[source] = (stats[source] ?? 0) + 1;
  return true;
}

// ---------------------------------------------------------------- LiteLLM
console.log(`Fetching LiteLLM...`);
const lite = await getJson(SOURCES.litellm);
let liteSkipped = 0;

for (const [key, entry] of Object.entries(lite)) {
  if (key === 'sample_spec' || !entry || typeof entry !== 'object') continue;
  const input = entry.input_cost_per_token;
  const output = entry.output_cost_per_token;
  // Keep anything with at least one token price. Embeddings and rerankers
  // only have an input cost - treating the missing side as 0 prices them
  // correctly instead of discarding them as "unknown model".
  const hasInput = typeof input === 'number';
  const hasOutput = typeof output === 'number';
  if (!hasInput && !hasOutput) {
    liteSkipped++;
    continue;
  }
  add(key, hasInput ? input : 0, hasOutput ? output : 0, 'litellm');
}

// ------------------------------------------------------------- OpenRouter
console.log(`Fetching OpenRouter catalog...`);
let openrouterSkipped = 0;
try {
  const or = await getJson(SOURCES.openrouter);
  const list = Array.isArray(or?.data) ? or.data : [];
  for (const m of list) {
    const p = m?.pricing;
    if (!p) {
      openrouterSkipped++;
      continue;
    }
    const input = Number.parseFloat(p.prompt);
    const output = Number.parseFloat(p.completion);
    // NaN means "not token priced". Zero is legitimate - OpenRouter carries
    // genuinely free models, and recording $0 for those is correct, whereas
    // dropping them would flag real usage as "unpriced".
    if (!Number.isFinite(input) && !Number.isFinite(output)) {
      openrouterSkipped++;
      continue;
    }
    add(
      m.id,
      Number.isFinite(input) ? input : 0,
      Number.isFinite(output) ? output : 0,
      'openrouter'
    );
  }
} catch (err) {
  // A source being down must not leave the repo without a price table.
  console.warn(`OpenRouter source unavailable (${err.message}) - continuing with LiteLLM only.`);
}

// ------------------------------------------------------------ bare aliases
// Index the bare model name too, so `anthropic/claude-sonnet-4-5` and
// `claude-sonnet-4-5` both resolve. Exact keys always win; skip ambiguous
// names where two providers disagree on price.
// When two prefixed keys collapse to the same bare name with different
// prices, resolve by source priority rather than dropping the alias
// entirely - LiteLLM carries provider-native list prices, so it wins over
// an aggregator's marked-up rate. Only a conflict *within* the same source
// is genuinely ambiguous, and there we take the cheaper side so we never
// overstate a customer's spend.
const candidates = new Map();
for (const [key, value] of Object.entries(prices)) {
  const slash = key.lastIndexOf('/');
  if (slash === -1) continue;
  const bare = key.slice(slash + 1);
  if (!bare || prices[bare]) continue;

  const src = origin[key];
  const existing = candidates.get(bare);
  if (!existing) {
    candidates.set(bare, { value, source: src });
    continue;
  }
  if (existing.value[0] === value[0] && existing.value[1] === value[1]) continue;

  const rankNew = SOURCE_PRIORITY.indexOf(src);
  const rankOld = SOURCE_PRIORITY.indexOf(existing.source);
  if (rankNew < rankOld) {
    candidates.set(bare, { value, source: src });
  } else if (rankNew === rankOld) {
    // Same-source disagreement (e.g. regional SKUs). Prefer the cheaper
    // input rate - understating is the safer error for a spend dashboard.
    if (value[0] < existing.value[0]) candidates.set(bare, { value, source: src });
  }
}
let aliased = 0;
for (const [bare, entry] of candidates) {
  prices[bare] = entry.value;
  aliased++;
}
const ambiguous = 0;

const sorted = Object.fromEntries(
  Object.keys(prices)
    .sort()
    .map(k => [k, prices[k]])
);

writeFileSync(
  outPath,
  JSON.stringify(
    {
      _comment:
        'Generated by scripts/sync-llm-pricing.mjs. Do not edit by hand. Values are USD per 1M tokens: [input, output].',
      _sources: SOURCES,
      _models: Object.keys(sorted).length,
      prices: sorted,
    },
    null,
    0
  ) + '\n'
);

console.log('');
console.log(`  from LiteLLM:     ${stats.litellm ?? 0} (skipped ${liteSkipped} with no token price)`);
console.log(`  from OpenRouter:  ${stats.openrouter ?? 0} new (skipped ${openrouterSkipped})`);
console.log(`  bare-name aliases: ${aliased} (${ambiguous} ambiguous, left out)`);
console.log(`  TOTAL: ${Object.keys(sorted).length} models`);
console.log(`Wrote ${outPath}`);
