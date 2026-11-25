import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import {
  AUTH_TAG_BYTES,
  HEADER_BYTES,
  NONCE_BYTES,
  PET_MAGIC,
  PET_VERSION,
} from './encryptionService.js';
import { defaultKeyStore } from './keyStore.js';
import { AppError } from '../middleware/errorHandler.js';

export async function decryptPaper(buffer, options = {}) {
  if (!Buffer.isBuffer(buffer)) {
    throw new AppError(400, 'PAPER_CORRUPT', 'Encrypted paper payload must be a Buffer.');
  }

  if (buffer.length < PET_MAGIC.length + 1) {
    throw new AppError(400, 'PAPER_CORRUPT', 'Encrypted paper package is truncated.');
  }

  const magic = buffer.subarray(0, PET_MAGIC.length);
  if (!magic.equals(PET_MAGIC)) {
    throw new AppError(400, 'PAPER_CORRUPT', 'Invalid paper package magic header.');
  }

  const version = buffer.readUInt8(PET_MAGIC.length);
  if (version !== PET_VERSION) {
    throw new AppError(
      400,
      'PAPER_VERSION_UNSUPPORTED',
      `Unsupported encrypted paper version: ${version}.`
    );
  }

  if (buffer.length <= HEADER_BYTES) {
    throw new AppError(400, 'PAPER_CORRUPT', 'Encrypted paper package is truncated.');
  }

  let key = options.key;
  if (!key) {
    const store = options.keyStore || defaultKeyStore;
    if (!options.keyId) {
      throw new AppError(400, 'PAPER_CORRUPT', 'Missing encryption key identifier for paper.');
    }
    key = await store.getKeyById(options.keyId);
  }

  if (!Buffer.isBuffer(key) || key.length !== 32) {
    throw new AppError(500, 'INTERNAL_ERROR', 'Decryption key must be a 32-byte Buffer.');
  }

  const aad = buffer.subarray(0, PET_MAGIC.length + 1);
  const nonceStart = PET_MAGIC.length + 1;
  const tagStart = nonceStart + NONCE_BYTES;
  const ciphertextStart = tagStart + AUTH_TAG_BYTES;

  const nonce = buffer.subarray(nonceStart, tagStart);
  const authTag = buffer.subarray(tagStart, ciphertextStart);
  const ciphertext = buffer.subarray(ciphertextStart);

  let compressed;
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonce);
    decipher.setAAD(aad);
    decipher.setAuthTag(authTag);
    compressed = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    throw new AppError(
      400,
      'PAPER_CORRUPT',
      'Paper package failed authentication or was tampered with.'
    );
  }

  let jsonBytes;
  try {
    jsonBytes = gunzipSync(compressed);
  } catch {
    throw new AppError(400, 'PAPER_CORRUPT', 'Paper package contains corrupt gzip data.');
  }

  try {
    return JSON.parse(jsonBytes.toString('utf8'));
  } catch {
    throw new AppError(400, 'PAPER_CORRUPT', 'Paper package contains invalid JSON.');
  }
}

export async function readAndDecryptPaper(filePath, options = {}) {
  const buffer = await fs.readFile(filePath);
  return decryptPaper(buffer, options);
}
