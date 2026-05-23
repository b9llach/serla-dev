import { describe, it, expect, beforeEach } from 'vitest';
import { storageGet, storageSet, storageRemove } from './storage';

describe('storage', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('round-trips a value', () => {
    storageSet('key', 'value');
    expect(storageGet('key')).toBe('value');
  });

  it('returns null for missing keys', () => {
    expect(storageGet('missing')).toBeNull();
  });

  it('removes values', () => {
    storageSet('key', 'value');
    storageRemove('key');
    expect(storageGet('key')).toBeNull();
  });

  it('prefixes storage keys with serla:', () => {
    storageSet('foo', 'bar');
    expect(window.localStorage.getItem('serla:foo')).toBe('bar');
  });

  it('returns null when localStorage throws (e.g. private mode)', () => {
    const orig = window.localStorage.getItem;
    Object.defineProperty(window.Storage.prototype, 'getItem', {
      configurable: true,
      value: () => { throw new Error('private mode'); },
    });
    expect(storageGet('foo')).toBeNull();
    Object.defineProperty(window.Storage.prototype, 'getItem', {
      configurable: true,
      value: orig,
    });
  });
});
