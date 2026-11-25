import crypto from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { defaultKeyStore, writeFileAtomic } from './keyStore.js';
import { AppError } from '../middleware/errorHandler.js';

export const PET_MAGIC = Buffer.from('PET1', 'ascii');
export const PET_VERSION = 1;
export const NONCE_BYTES = 12;
export const AUTH_TAG_BYTES = 16;
export const HEADER_BYTES = PET_MAGIC.length + 1 + NONCE_BYTES + AUTH_TAG_BYTES; // 33 bytes

function sortValueCanonical(value) {
  if (Array.isArray(value)) {
    return value.map(sortValueCanonical);
  }
  if (value !== null && typeof value === 'object') {
    const sorted = {};
    for (const key of Object.keys(value).sort()) {
      const prop = value[key];
      if (prop !== undefined) {
        sorted[key] = sortValueCanonical(prop);
      }
    }
    return sorted;
  }
  return value;
}

export function canonicalJson(paperObject) {
  return JSON.stringify(sortValueCanonical(paperObject));
}

export function computeCiphertextSha256(packageBuffer) {
  if (!Buffer.isBuffer(packageBuffer) || packageBuffer.length <= HEADER_BYTES) {
    throw new AppError(400, 'PAPER_CORRUPT', 'Invalid encrypted paper buffer.');
  }
  const ciphertext = packageBuffer.subarray(HEADER_BYTES);
  return crypto.createHash('sha256').update(ciphertext).digest('hex');
}

export async function encryptPaper(paperObject, options = {}) {
  if (!paperObject || typeof paperObject !== 'object' || Array.isArray(paperObject)) {
    throw new AppError(400, 'VALIDATION_FAILED', 'Paper object must be a non-null JSON object.');
  }

  let key = options.key;
  if (!key) {
    const store = options.keyStore || defaultKeyStore;
    const active = await store.getOrCreateActiveKey();
    key = active.key;
  }

  if (!Buffer.isBuffer(key) || key.length !== 32) {
    throw new AppError(500, 'INTERNAL_ERROR', 'Encryption key must be a 32-byte Buffer.');
  }

  const normalizedPaper = {
    ...paperObject,
    part: 'full',
  };

  const plaintextJson = canonicalJson(normalizedPaper);
  const compressed = gzipSync(Buffer.from(plaintextJson, 'utf8'));

  const versionBuf = Buffer.from([PET_VERSION]);
  const aad = Buffer.concat([PET_MAGIC, versionBuf]);
  const nonce = crypto.randomBytes(NONCE_BYTES);

  const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce);
  cipher.setAAD(aad);

  const ciphertext = Buffer.concat([cipher.update(compressed), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([PET_MAGIC, versionBuf, nonce, authTag, ciphertext]);
}

export async function encryptAndWritePaper(paperObject, filePath, options = {}) {
  const store = options.keyStore || defaultKeyStore;
  let keyId = options.keyId;
  let key = options.key;

  if (!key) {
    const active = await store.getOrCreateActiveKey();
    keyId = active.keyId;
    key = active.key;
  }

  const buffer = await encryptPaper(paperObject, { key });
  const sha256 = computeCiphertextSha256(buffer);
  await writeFileAtomic(filePath, buffer, { mode: 0o600 });

  return {
    buffer,
    keyId,
    sha256,
    filePath,
  };
}
