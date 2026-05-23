import crypto from 'crypto';

/**
 * AES-256-GCM encryption for at-rest secrets like webhook signing keys.
 *
 * Key derivation: WEBHOOK_ENCRYPTION_KEY env var must be a 64-char hex string
 * (32 bytes / 256 bits). Generate with: openssl rand -hex 32
 *
 * Ciphertext format: `${ivHex}:${authTagHex}:${ciphertextHex}` - colon-delimited
 * so we can detect legacy plaintext rows (no colons) and migrate them.
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // GCM standard
const KEY_LENGTH_BYTES = 32;
const CIPHERTEXT_PREFIX = 'enc:'; // marker so we can tell encrypted vs legacy

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;

  const keyHex = process.env.WEBHOOK_ENCRYPTION_KEY;
  if (!keyHex) {
    throw new Error('WEBHOOK_ENCRYPTION_KEY env var is required (64 hex chars). Generate with: openssl rand -hex 32');
  }
  if (keyHex.length !== 64) {
    throw new Error('WEBHOOK_ENCRYPTION_KEY must be exactly 64 hex chars (32 bytes)');
  }
  const buf = Buffer.from(keyHex, 'hex');
  if (buf.length !== KEY_LENGTH_BYTES) {
    throw new Error('WEBHOOK_ENCRYPTION_KEY is not valid hex');
  }
  cachedKey = buf;
  return cachedKey;
}

export function encryptSecret(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return CIPHERTEXT_PREFIX + iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted.toString('hex');
}

export function decryptSecret(value: string): string {
  // Backwards-compat: a row written before encryption was added has no prefix.
  if (!value.startsWith(CIPHERTEXT_PREFIX)) {
    return value;
  }
  const key = getKey();
  const parts = value.slice(CIPHERTEXT_PREFIX.length).split(':');
  if (parts.length !== 3) {
    throw new Error('Malformed encrypted value');
  }
  const [ivHex, authTagHex, ciphertextHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const ciphertext = Buffer.from(ciphertextHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString('utf8');
}

export function isEncrypted(value: string): boolean {
  return value.startsWith(CIPHERTEXT_PREFIX);
}
