import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  HEADER_BYTES,
  PET_MAGIC,
  PET_VERSION,
  computeCiphertextSha256,
  encryptAndWritePaper,
  encryptPaper,
} from '../services/encryptionService.js';
import { decryptPaper, readAndDecryptPaper } from '../services/decryptionService.js';
import { createKeyStore } from '../services/keyStore.js';
import { createValidFullPaper } from './fixtures/paperFixtures.js';

const tempDirs = [];

async function makeTempDir() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pet-prep-m2-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    await fs.rm(dir, { recursive: true, force: true });
  }
});

describe('M2 encryption, decryption, and keyStore', () => {
  it('round-trips a full paper through Contract B format', async () => {
    const key = crypto.randomBytes(32);
    const paper = createValidFullPaper();

    const encrypted = await encryptPaper(paper, { key });
    expect(encrypted.subarray(0, 4).equals(PET_MAGIC)).toBe(true);
    expect(encrypted.readUInt8(4)).toBe(PET_VERSION);
    expect(encrypted.length).toBeGreaterThan(HEADER_BYTES);

    const decrypted = await decryptPaper(encrypted, { key });
    expect(decrypted).toEqual(paper);
  });

  it('produces different ciphertext buffers for two encryptions of the same paper', async () => {
    const key = crypto.randomBytes(32);
    const paper = createValidFullPaper();

    const first = await encryptPaper(paper, { key });
    const second = await encryptPaper(paper, { key });

    expect(first.equals(second)).toBe(false);
    expect(first.subarray(5, 17).equals(second.subarray(5, 17))).toBe(false);
  });

  it('rejects a flipped byte in each Contract B region (magic, version, nonce, tag, ciphertext)', async () => {
    const key = crypto.randomBytes(32);
    const paper = createValidFullPaper();
    const original = await encryptPaper(paper, { key });

    const regions = [
      { name: 'magic', offset: 1, expectedCode: 'PAPER_CORRUPT' },
      { name: 'version', offset: 4, expectedCode: 'PAPER_VERSION_UNSUPPORTED' },
      { name: 'nonce', offset: 8, expectedCode: 'PAPER_CORRUPT' },
      { name: 'tag', offset: 20, expectedCode: 'PAPER_CORRUPT' },
      { name: 'ciphertext', offset: HEADER_BYTES + 2, expectedCode: 'PAPER_CORRUPT' },
    ];

    for (const region of regions) {
      const tampered = Buffer.from(original);
      tampered[region.offset] ^= 0xff;
      await expect(decryptPaper(tampered, { key })).rejects.toMatchObject({
        code: region.expectedCode,
      });
    }
  });

  it('rejects truncated buffers at header and payload boundaries', async () => {
    const key = crypto.randomBytes(32);
    const encrypted = await encryptPaper(createValidFullPaper(), { key });

    for (const len of [0, 3, 5, 17, 33, encrypted.length - 1]) {
      const truncated = encrypted.subarray(0, len);
      await expect(decryptPaper(truncated, { key })).rejects.toMatchObject({
        code: 'PAPER_CORRUPT',
      });
    }
  });

  it('rejects decryption with the wrong key', async () => {
    const keyA = crypto.randomBytes(32);
    const keyB = crypto.randomBytes(32);
    const encrypted = await encryptPaper(createValidFullPaper(), { key: keyA });

    await expect(decryptPaper(encrypted, { key: keyB })).rejects.toMatchObject({
      code: 'PAPER_CORRUPT',
    });
  });

  it('rejects valid GCM ciphertext containing corrupt gzip data', async () => {
    const key = crypto.randomBytes(32);
    const nonce = crypto.randomBytes(12);
    const aad = Buffer.concat([PET_MAGIC, Buffer.from([PET_VERSION])]);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce);
    cipher.setAAD(aad);
    const ciphertext = Buffer.concat([
      cipher.update(Buffer.from('not-gzip-bytes')),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    const bogusPkg = Buffer.concat([aad, nonce, tag, ciphertext]);

    await expect(decryptPaper(bogusPkg, { key })).rejects.toMatchObject({
      code: 'PAPER_CORRUPT',
    });
  });

  it('generates 10,000 nonces with zero collisions', async () => {
    const key = crypto.randomBytes(32);
    const minimalPaper = { format: 'PETDRAFT', version: 1, part: 'full', paperId: 'P1' };
    const nonces = new Set();

    for (let i = 0; i < 10000; i += 1) {
      const pkg = await encryptPaper(minimalPaper, { key });
      nonces.add(pkg.subarray(5, 17).toString('hex'));
    }

    expect(nonces.size).toBe(10000);
  });

  it('supports fallback keyStore, atomic writes, sha256, and key rotation without breaking old papers', async () => {
    const dir = await makeTempDir();
    const keyDir = path.join(dir, 'keys');
    const paperPath = path.join(dir, 'paper-1.pet');

    const store = createKeyStore({ keyDir, keytar: null });
    const paper = createValidFullPaper();

    const firstWrite = await encryptAndWritePaper(paper, paperPath, { keyStore: store });
    expect(firstWrite.sha256).toBe(computeCiphertextSha256(firstWrite.buffer));
    expect(firstWrite.sha256).toMatch(/^[0-9a-f]{64}$/);

    const rotated = await store.rotateKey();
    expect(rotated.keyId).not.toBe(firstWrite.keyId);

    const decryptedOld = await readAndDecryptPaper(paperPath, {
      keyStore: store,
      keyId: firstWrite.keyId,
    });
    expect(decryptedOld).toEqual(paper);
  });

  it('uses OS keychain adapter when available without touching fallback files', async () => {
    const dir = await makeTempDir();
    const memoryVault = new Map();
    const mockKeytar = {
      async setPassword(service, account, value) {
        memoryVault.set(`${service}:${account}`, value);
      },
      async getPassword(service, account) {
        return memoryVault.get(`${service}:${account}`) ?? null;
      },
    };

    const store = createKeyStore({ keyDir: path.join(dir, 'unused-keys'), keytar: mockKeytar });
    const { keyId, key } = await store.getOrCreateActiveKey();
    expect(key).toHaveLength(32);
    expect(await store.getKeyById(keyId)).toEqual(key);

    await expect(fs.readdir(path.join(dir, 'unused-keys'))).rejects.toThrow();
  });
});
