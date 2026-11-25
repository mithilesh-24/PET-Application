import { expect, test } from '@playwright/test';
import { createValidFullPaper } from '../backend/tests/fixtures/paperFixtures.js';

test('M9 coding screen: offline Monaco, Run Code, Submit full/partial marks, and zero hidden test leaks in network log', async ({
  page,
  context,
  request,
}) => {
  test.setTimeout(180000);
  const uniqueId = `PET-M9-${Date.now()}`;
  const paper = createValidFullPaper({
    paperId: uniqueId,
    title: `M9 Coding Test ${uniqueId}`,
  });

  const importRes = await request.post('http://localhost:4000/api/papers/import', {
    timeout: 120000,
    multipart: {
      files: {
        name: `${uniqueId}.petdraft`,
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(paper), 'utf8'),
      },
    },
  });
  expect(importRes.status()).toBe(201);
  const { paper: createdPaper } = await importRes.json();

  const attemptRes = await request.post('http://localhost:4000/api/attempts', {
    data: { paperId: createdPaper.id, violationLimit: 3 },
  });
  const { attempt } = await attemptRes.json();

  // Advance attempt cleanly to S2A via backend API
  await request.post(`http://localhost:4000/api/attempts/${attempt.id}/start-section`, {
    data: { section: 'S1' },
  });
  await request.post(`http://localhost:4000/api/attempts/${attempt.id}/submit-section`, {
    data: {},
  });
  await request.post(`http://localhost:4000/api/attempts/${attempt.id}/start-section`, {
    data: { section: 'S2' },
  });
  await request.post(`http://localhost:4000/api/attempts/${attempt.id}/submit-section`, {
    data: {},
  });
  await request.post(`http://localhost:4000/api/attempts/${attempt.id}/start-section`, {
    data: { section: 'S2A' },
  });

  const externalRequests = [];
  const apiPayloads = [];
  page.on('request', (req) => {
    const url = req.url();
    if (
      !url.startsWith('http://localhost') &&
      !url.startsWith('http://127.0.0.1') &&
      !url.startsWith('blob:') &&
      !url.startsWith('data:')
    ) {
      externalRequests.push(url);
    }
  });
  page.on('response', async (res) => {
    if (res.url().includes('/api/attempts/')) {
      try {
        apiPayloads.push(await res.text());
      } catch {
        // Ignore
      }
    }
  });

  try {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto(`/exam/${attempt.id}`);

    // Re-enter fullscreen gate
    await page.getByRole('button', { name: 'Return to Fullscreen' }).click();

    await expect(page.getByText('S2A-01: Minimum Subarray Budget')).toBeVisible({
      timeout: 20000,
    });
    await expect(page.locator('.monaco-editor')).toBeVisible({ timeout: 20000 });

    // Verify Monaco loaded purely locally with zero external CDN requests
    expect(externalRequests).toEqual([]);

    // Switch to Python and wait for Python starter template to load in Monaco
    await page.locator('#coding-lang-select').selectOption('python');
    await expect(page.locator('.monaco-editor')).toContainText('def solve');

    // Type a partial wrong solution (outputs 0 -> passes 1/10 tests for 1.0 mark)
    await page.locator('.monaco-editor .view-lines').click();
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Backspace');
    await page.keyboard.insertText('print(0)\n');
    await expect(page.locator('.monaco-editor')).toContainText('print(0)');
    await expect(page.locator('.monaco-editor')).not.toContainText('def solve');

    await page.getByRole('button', { name: 'Run Code' }).click();
    await expect(page.getByText('Status: OK')).toBeVisible({ timeout: 20000 });

    await page.getByRole('button', { name: 'Submit Code' }).click();
    await expect(page.getByText('Marks Obtained: 1 / 10')).toBeVisible({ timeout: 45000 });

    // Now write the full-mark solution in Python and Submit Code
    await page.locator('.monaco-editor .view-lines').click();
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Backspace');
    await page.keyboard.insertText('import sys\nprint(sys.stdin.read().strip())\n');
    await expect(page.locator('.monaco-editor')).toContainText('sys.stdin.read');

    await page.getByRole('button', { name: 'Submit Code' }).click();
    await expect(page.getByText('Marks Obtained: 10 / 10')).toBeVisible({ timeout: 45000 });
    await expect(page.getByText('Hidden Tests Passed: 10 / 10')).toBeVisible();

    // Assert hidden test inputs, expectedOutputs, generators, and referenceSolution never appeared in any browser network response
    for (const body of apiPayloads) {
      expect(body).not.toContain('"expectedOutput":"100"');
      expect(body).not.toContain('print(9)');
      expect(body).not.toContain('referenceSolution');
      const parsed = JSON.parse(body);
      if (Array.isArray(parsed?.tests)) {
        for (const t of parsed.tests) {
          expect(t).not.toHaveProperty('input');
          expect(t).not.toHaveProperty('expectedOutput');
          expect(t).not.toHaveProperty('actualOutput');
          expect(t).not.toHaveProperty('inputGenerator');
        }
      }
    }

    // Offline test: disable network and verify Monaco editor interaction still works cleanly
    await context.setOffline(true);
    await page.locator('.monaco-editor').click();
    await page.keyboard.type('\n# offline edit check');
    await expect(page.locator('.monaco-editor')).toContainText('offline edit check');
    await context.setOffline(false);
  } finally {
    await request.delete(`http://localhost:4000/api/papers/${createdPaper.id}`).catch(() => {});
  }
});
