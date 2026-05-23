/**
 * Deterministic fingerprint for grouping identical errors together.
 *
 * Strategy: hash type + top-of-stack frame's file + function name. Strip line
 * and column so cosmetic refactors don't fragment the group. Strip URL params
 * and minified-chunk suffixes (e.g. /page-abc123.js -> /page.js).
 *
 * If a stack can't be parsed, fall back to type + message.
 */

import { createHash } from 'crypto';

export interface ParsedFrame {
  file: string;
  fn: string | null;
  line: number | null;
  column: number | null;
}

/**
 * Parse the top stack frame. Handles both V8-style ("at Foo (file:1:2)") and
 * Firefox-style ("Foo@file:1:2") formats.
 */
export function parseTopFrame(stack: string | null | undefined): ParsedFrame | null {
  if (!stack) return null;
  const lines = stack.split('\n').map(l => l.trim()).filter(Boolean);

  for (const line of lines) {
    // Skip the "Error: message" header.
    if (!line.startsWith('at ') && !line.includes('@')) continue;

    // V8 / Node / Chrome: "at fnName (file:line:col)" or "at file:line:col"
    const v8 = line.match(/^at\s+(?:(.+?)\s+\()?(.+?):(\d+):(\d+)\)?$/);
    if (v8) {
      const [, fn, file, lineNum, col] = v8;
      return {
        fn: fn ? fn.trim() : null,
        file: normalizeFile(file ?? ''),
        line: lineNum ? Number(lineNum) : null,
        column: col ? Number(col) : null,
      };
    }

    // Firefox / Safari: "fnName@file:line:col"
    const moz = line.match(/^(.+?)@(.+?):(\d+):(\d+)$/);
    if (moz) {
      const [, fn, file, lineNum, col] = moz;
      return {
        fn: fn?.trim() || null,
        file: normalizeFile(file ?? ''),
        line: lineNum ? Number(lineNum) : null,
        column: col ? Number(col) : null,
      };
    }
  }
  return null;
}

function normalizeFile(file: string): string {
  // Strip query strings: foo.js?v=123 -> foo.js
  let f = file.split('?')[0]!;
  // Strip chunk hashes: page-abc123.js -> page.js. Only strip 6+ hex chars
  // so we don't accidentally strip semantic-versioned filenames.
  f = f.replace(/-[a-f0-9]{6,}\.(?:js|mjs|tsx?|jsx?)$/i, '.js');
  return f;
}

/**
 * Compute a fingerprint string for an error. Stable across processes - the
 * same (type, top-frame file, top-frame function) always hashes to the same
 * value so error_groups gets one row per recurring bug.
 */
export function computeFingerprint(input: {
  type?: string | null;
  message?: string | null;
  stack?: string | null;
}): string {
  const top = parseTopFrame(input.stack);
  const parts: string[] = [];
  parts.push((input.type || 'Error').toLowerCase());

  if (top) {
    parts.push(top.file);
    parts.push(top.fn || '<anonymous>');
  } else {
    // No stack - fall back to message so we still group by error text.
    parts.push((input.message || '').slice(0, 200));
  }

  return createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 32);
}
