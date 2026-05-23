// One-off migration: encrypt any plaintext webhook secrets in place.
// Idempotent: skips rows whose secret is already prefixed with 'enc:'.
// Run with: node --env-file=.env.local scripts/encrypt-webhook-secrets.mjs

import { neon } from '@neondatabase/serverless';
import crypto from 'crypto';

const dbUrl = process.env.DATABASE_URL;
const keyHex = process.env.WEBHOOK_ENCRYPTION_KEY;

if (!dbUrl) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}
if (!keyHex || keyHex.length !== 64) {
  console.error('WEBHOOK_ENCRYPTION_KEY must be a 64-char hex string. Generate with: openssl rand -hex 32');
  process.exit(1);
}

const key = Buffer.from(keyHex, 'hex');
const sql = neon(dbUrl);

function encryptSecret(plaintext) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return 'enc:' + iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted.toString('hex');
}

const rows = await sql.query(`SELECT id, secret FROM webhooks`);
let migrated = 0;
let skipped = 0;

for (const row of rows) {
  if (row.secret.startsWith('enc:')) {
    skipped++;
    continue;
  }
  const encrypted = encryptSecret(row.secret);
  await sql.query(`UPDATE webhooks SET secret = $1 WHERE id = $2`, [encrypted, row.id]);
  migrated++;
}

console.log(`Migrated ${migrated} webhook secrets to encrypted form.`);
console.log(`Skipped ${skipped} already-encrypted rows.`);
