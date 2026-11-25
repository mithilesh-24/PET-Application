import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { AppError } from '../middleware/errorHandler.js';

const KEYCHAIN_SERVICE = 'pet-prep';
const ACTIVE_KEY_ACCOUNT = '__active_key_id__';
const KEY_ID_PATTERN = /^[a-zA-Z0-9_-]{3,80}$/;

let loggedFallbackWarning = false;

export function getDefaultKeyDir() {
  return path.join(os.homedir(), '.pet-prep', 'keys');
}

export async function writeFileAtomic(filePath, data, { mode } = {}) {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try {
    const handle = await fs.open(tempPath, 'w', mode ?? 0o600);
    try {
      await handle.writeFile(data);
      await handle.sync();
    } finally {
      await handle.close();
    }
    if (mode !== undefined) {
      await fs.chmod(tempPath, mode).catch(() => {});
    }
    await fs.rename(tempPath, filePath);
  } catch (err) {
    await fs.unlink(tempPath).catch(() => {});
    throw err;
  }
}

async function tryLoadKeytar(customKeytar) {
  if (customKeytar !== undefined) {
    return customKeytar;
  }
  try {
    const mod = await import('keytar');
    return mod.default || mod;
  } catch {
    return null;
  }
}

function assertValidKeyId(keyId) {
  if (typeof keyId !== 'string' || !KEY_ID_PATTERN.test(keyId)) {
    throw new AppError(400, 'PAPER_CORRUPT', 'Invalid encryption key identifier.');
  }
}

function decodeKeyMaterial(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!/^[0-9a-fA-F]{64}$/.test(trimmed)) return null;
  const buf = Buffer.from(trimmed, 'hex');
  return buf.length === 32 ? buf : null;
}

export function createKeyStore({ keyDir = getDefaultKeyDir(), keytar: customKeytar } = {}) {
  let cachedKeytar;

  async function resolveKeytar() {
    if (cachedKeytar !== undefined) return cachedKeytar;
    cachedKeytar = await tryLoadKeytar(customKeytar);
    return cachedKeytar;
  }

  function warnFallbackOnce() {
    if (!loggedFallbackWarning) {
      loggedFallbackWarning = true;
      console.warn(
        `[keyStore] OS keychain (keytar) unavailable; storing encryption keys in "${keyDir}" with mode 0600.`
      );
    }
  }

  async function readFallbackActiveId() {
    const activePath = path.join(keyDir, 'active.json');
    try {
      const parsed = JSON.parse(await fs.readFile(activePath, 'utf8'));
      return typeof parsed?.activeKeyId === 'string' ? parsed.activeKeyId : null;
    } catch {
      return null;
    }
  }

  async function writeFallbackActiveId(keyId) {
    const activePath = path.join(keyDir, 'active.json');
    await writeFileAtomic(activePath, JSON.stringify({ activeKeyId: keyId }), { mode: 0o600 });
  }

  async function storeKeyMaterial(keyId, keyBuffer) {
    const hex = keyBuffer.toString('hex');
    const kt = await resolveKeytar();
    if (kt) {
      try {
        await kt.setPassword(KEYCHAIN_SERVICE, keyId, hex);
        await kt.setPassword(KEYCHAIN_SERVICE, ACTIVE_KEY_ACCOUNT, keyId);
        return 'keychain';
      } catch {
        // Fall through to 0600 file fallback if OS keychain rejects operation
      }
    }

    warnFallbackOnce();
    const keyPath = path.join(keyDir, `${keyId}.key`);
    await writeFileAtomic(keyPath, hex, { mode: 0o600 });
    await writeFallbackActiveId(keyId);
    return 'file';
  }

  async function getKeyById(keyId) {
    assertValidKeyId(keyId);

    const kt = await resolveKeytar();
    if (kt) {
      try {
        const stored = await kt.getPassword(KEYCHAIN_SERVICE, keyId);
        const decoded = decodeKeyMaterial(stored);
        if (decoded) return decoded;
      } catch {
        // Fallback to file lookup
      }
    }

    const keyPath = path.join(keyDir, `${keyId}.key`);
    try {
      const content = await fs.readFile(keyPath, 'utf8');
      const decoded = decodeKeyMaterial(content);
      if (decoded) return decoded;
    } catch {
      // Handled below
    }

    throw new AppError(500, 'KEY_NOT_FOUND', `Encryption key "${keyId}" could not be loaded.`);
  }

  async function getActiveKeyId() {
    const kt = await resolveKeytar();
    if (kt) {
      try {
        const active = await kt.getPassword(KEYCHAIN_SERVICE, ACTIVE_KEY_ACCOUNT);
        if (active && KEY_ID_PATTERN.test(active)) {
          return active;
        }
      } catch {
        // Fallback to file lookup
      }
    }
    return readFallbackActiveId();
  }

  async function rotateKey() {
    const keyId = `k-${crypto.randomUUID()}`;
    const key = crypto.randomBytes(32);
    const backend = await storeKeyMaterial(keyId, key);
    return { keyId, key, backend };
  }

  async function getOrCreateActiveKey() {
    const existingId = await getActiveKeyId();
    if (existingId) {
      try {
        const key = await getKeyById(existingId);
        return { keyId: existingId, key };
      } catch {
        // If active pointer is stale, create a fresh active key
      }
    }
    const created = await rotateKey();
    return { keyId: created.keyId, key: created.key };
  }

  return {
    keyDir,
    getOrCreateActiveKey,
    getKeyById,
    rotateKey,
  };
}

export const defaultKeyStore = createKeyStore();
