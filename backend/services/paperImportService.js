import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { AppError } from '../middleware/errorHandler.js';
import { assertPathInsideDir } from '../schemas/routeParams.js';
import { decryptPaper } from './decryptionService.js';
import { encryptAndWritePaper } from './encryptionService.js';
import { defaultKeyStore } from './keyStore.js';
import { mergeParts, validatePaper } from './questionValidator.js';
import { verifyCodingTests as defaultCodingVerifier } from './codingVerifier.js';

const SAFE_PAPER_ID_REGEX = /^[a-zA-Z0-9._-]{3,120}$/;

export function parseDraftText(rawText) {
  if (typeof rawText !== 'string') {
    throw new AppError(400, 'PAPER_INVALID', 'Uploaded file could not be decoded as UTF-8 text.', {
      errors: [{ path: '$', code: 'INVALID_JSON', message: 'File content is not text.' }],
    });
  }

  let cleaned = rawText.replace(/^\uFEFF/, '').trim();

  if (cleaned.startsWith('```')) {
    const fenceMatch = cleaned.match(/^```(?:json|JSON)?\s*\r?\n([\s\S]*?)\r?\n```\s*$/);
    if (!fenceMatch) {
      throw new AppError(
        400,
        'PAPER_INVALID',
        'Invalid markdown code fence around JSON. Remove extra text or extra code blocks.',
        {
          errors: [
            {
              path: '$',
              code: 'INVALID_JSON',
              message: 'Could not extract a single JSON block from markdown fence.',
            },
          ],
        }
      );
    }
    cleaned = fenceMatch[1].trim();
  }

  try {
    return JSON.parse(cleaned);
  } catch (err) {
    throw new AppError(400, 'PAPER_INVALID', `Malformed JSON in uploaded file: ${err.message}`, {
      errors: [{ path: '$', code: 'INVALID_JSON', message: `Invalid JSON: ${err.message}` }],
    });
  }
}

export function sanitizePaperMeta(row) {
  if (!row) return null;
  return {
    id: row.id,
    paperId: row.paper_id,
    title: row.title,
    questionCount: row.question_count,
    totalMarks: row.total_marks,
    createdAt: row.created_at,
    verifiedAt: row.verified_at,
  };
}

function assertSafePaperId(paperId) {
  if (
    typeof paperId !== 'string' ||
    !SAFE_PAPER_ID_REGEX.test(paperId) ||
    paperId.includes('..') ||
    paperId.includes('/') ||
    paperId.includes('\\')
  ) {
    throw new AppError(400, 'PAPER_INVALID', 'Invalid paperId characters.', {
      errors: [
        {
          path: 'paperId',
          code: 'INVALID_PAPER_ID',
          message: 'paperId may contain only letters, numbers, dots, hyphens, and underscores.',
        },
      ],
    });
  }
}

async function tryDecryptPetBuffer(buffer, keyStore) {
  const { keyId, key } = await keyStore.getOrCreateActiveKey();
  try {
    return await decryptPaper(buffer, { key });
  } catch (err) {
    // Also check any .key files in fallback dir if active key didn't match
    try {
      const files = await fs.readdir(keyStore.keyDir);
      for (const file of files) {
        if (!file.endsWith('.key')) continue;
        const candidateId = file.slice(0, -4);
        if (candidateId === keyId) continue;
        try {
          const candidateKey = await keyStore.getKeyById(candidateId);
          return await decryptPaper(buffer, { key: candidateKey });
        } catch {
          // Try next key
        }
      }
    } catch {
      // No fallback key dir
    }
    throw err;
  }
}

export async function importPaperFiles({
  files,
  papersRepo,
  keyStore = defaultKeyStore,
  encryptedPapersDir = config.paths.encryptedPapersDir,
  codingVerifier = defaultCodingVerifier,
}) {
  if (!Array.isArray(files) || files.length === 0 || files.length > 3) {
    throw new AppError(400, 'VALIDATION_FAILED', 'Please upload between 1 and 3 files.');
  }

  const parsedObjects = [];

  for (const file of files) {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (ext !== '.petdraft' && ext !== '.pet') {
      throw new AppError(
        400,
        'PAPER_INVALID',
        `Unsupported file extension "${ext || '(none)'}". Upload .petdraft or .pet files.`,
        {
          errors: [
            {
              path: '$',
              code: 'UNSUPPORTED_EXTENSION',
              message: `File "${file.originalname}" must end in .petdraft or .pet.`,
            },
          ],
        }
      );
    }

    if (ext === '.pet') {
      if (files.length !== 1) {
        throw new AppError(400, 'PAPER_INVALID', 'Upload only one .pet package at a time.');
      }
      const decrypted = await tryDecryptPetBuffer(file.buffer, keyStore);
      parsedObjects.push(decrypted);
    } else {
      const parsed = parseDraftText(file.buffer.toString('utf8'));
      parsedObjects.push(parsed);
    }
  }

  let fullPaper;
  if (parsedObjects.length === 1 && parsedObjects[0]?.part === 'full') {
    fullPaper = parsedObjects[0];
  } else {
    const merged = mergeParts(parsedObjects);
    if (!merged.valid) {
      throw new AppError(400, 'PAPER_INVALID', 'Could not merge uploaded paper parts.', {
        errors: merged.errors,
      });
    }
    fullPaper = merged.paper;
  }

  const validation = validatePaper(fullPaper);
  if (!validation.valid) {
    throw new AppError(400, 'PAPER_INVALID', 'Question paper validation failed.', {
      errors: validation.errors,
      warnings: validation.warnings,
    });
  }

  assertSafePaperId(fullPaper.paperId);

  const existing = papersRepo.getByPaperId(fullPaper.paperId);
  if (existing) {
    throw new AppError(
      409,
      'PAPER_INVALID',
      `Paper "${fullPaper.paperId}" has already been imported.`,
      {
        errors: [
          {
            path: 'paperId',
            code: 'DUPLICATE_PAPER_ID',
            message: `Paper "${fullPaper.paperId}" is already stored. Delete the existing copy or use a new paperId.`,
          },
        ],
      }
    );
  }

  const verifyResult = await codingVerifier(fullPaper);
  if (!verifyResult.ok) {
    throw new AppError(400, 'PAPER_INVALID', 'Coding test verification failed.', {
      errors: verifyResult.failures,
      failures: verifyResult.failures,
    });
  }

  const paperToStore = verifyResult.resolvedPaper || fullPaper;
  const targetPath = assertPathInsideDir(
    encryptedPapersDir,
    path.join(encryptedPapersDir, `${paperToStore.paperId}.pet`)
  );
  const { keyId, sha256 } = await encryptAndWritePaper(paperToStore, targetPath, { keyStore });

  const now = Date.now();
  let inserted;
  try {
    inserted = papersRepo.create({
      paper_id: paperToStore.paperId,
      title: paperToStore.title,
      file_path: targetPath,
      key_id: keyId,
      sha256,
      question_count: 67,
      total_marks: 100,
      created_at: now,
      verified_at: now,
    });
  } catch (err) {
    await fs.unlink(targetPath).catch(() => {});
    throw err;
  }

  const section1Count = paperToStore.section1.questions.length;
  const section2Count =
    paperToStore.section2.departmentMcqs.length + paperToStore.section2.snippets.length;
  const section2aCount = paperToStore.section2a.questions.length;

  return {
    paper: sanitizePaperMeta(inserted),
    summary: {
      title: paperToStore.title,
      paperId: paperToStore.paperId,
      counts: {
        section1: section1Count,
        section2: section2Count,
        section2a: section2aCount,
        total: section1Count + section2Count + section2aCount,
      },
      totalMarks: 100,
      treeOrGraphSatisfied: paperToStore.section2a.questions.some((q) => q.isTreeOrGraph === true),
      warnings: [...validation.warnings, ...(verifyResult.warnings || [])],
    },
  };
}
