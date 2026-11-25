import { afterEach, describe, expect, it, vi } from 'vitest';
import { GENERATION_PROMPT, copyPromptToClipboard } from './promptService.js';

describe('M4 promptService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('contains every required section keyword, validator constraint, and no Docker mentions', () => {
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
      'at least 2 tests with kind "boundary" or "corner" and at least 1 with kind "max"',
      'inputGenerator',
      'referenceSolution',
      'JSON FORMAT',
      'BEFORE YOU REPLY, SELF-CHECK AND FIX',
      'Now produce Part A.',
    ];

    for (const kw of requiredKeywords) {
      expect(GENERATION_PROMPT).toContain(kw);
    }

    expect(GENERATION_PROMPT.toLowerCase()).not.toContain('docker');
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
