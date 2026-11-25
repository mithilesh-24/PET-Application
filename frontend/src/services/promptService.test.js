import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GENERATION_PROMPT, copyPromptToClipboard } from './promptService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('M4 promptService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('contains every required section keyword and matches the spec verbatim', () => {
    const requiredKeywords = [
      'Kongu Engineering College',
      'TASK',
      'Part A = Section 1 (40 questions)',
      'Part B = Section 2 (25 questions)',
      'Part C = Section 2a (2 coding problems)',
      'EXAM PATTERN',
      'SECTION 1 - Common to all',
      'SECTION 2 - Software Only',
      'CC01 Data Structures and Algorithms',
      'CC02 Programming and OOPS (Java)',
      'CC03 Database Management Systems',
      'CC04 Operating Systems',
      'CC05 Computer Networks',
      'SECTION 2a - Software Only coding',
      'QUALITY RULES',
      'CODING PROBLEM REQUIREMENTS',
      'inputGenerator',
      'referenceSolution',
      'JSON FORMAT',
      'BEFORE YOU REPLY, SELF-CHECK AND FIX',
      'Now produce Part A.',
    ];

    for (const kw of requiredKeywords) {
      expect(GENERATION_PROMPT).toContain(kw);
    }

    const specPath = path.resolve(
      __dirname,
      '../../../PET Prep - Module-by-Module Build Prompts.md'
    );
    const specText = fs.readFileSync(specPath, 'utf8').replace(/\r\n/g, '\n');
    const marker = '## The in-app AI question-generation prompt';
    const sectionStart = specText.indexOf(marker);
    expect(sectionStart).toBeGreaterThan(-1);
    const blockStart = specText.indexOf('```text\n', sectionStart) + '```text\n'.length;
    const blockEnd = specText.indexOf('\n```', blockStart);
    const verbatimFromSpec = specText.slice(blockStart, blockEnd);

    expect(GENERATION_PROMPT).toBe(verbatimFromSpec);
  });

  it('copies the full prompt using navigator.clipboard.writeText', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    await copyPromptToClipboard();
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith(GENERATION_PROMPT);
  });

  it('falls back to hidden textarea and execCommand when clipboard API is blocked', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error('NotAllowedError')) },
    });
    document.execCommand = vi.fn().mockReturnValue(true);

    await copyPromptToClipboard();
    expect(document.execCommand).toHaveBeenCalledWith('copy');
  });
});
