import { expect, test } from '@playwright/test';
import { createValidFullPaper } from '../backend/tests/fixtures/paperFixtures.js';

test('M7 fullscreen gate, visibilitychange and fullscreenchange monitoring, warning dialog, and termination', async ({
  page,
  request,
}) => {
  const uniqueId = `PET-M7-${Date.now()}`;
  const paper = createValidFullPaper({
    paperId: uniqueId,
    title: `M7 Violation Test ${uniqueId}`,
  });

  const importRes = await request.post('http://localhost:4000/api/papers/import', {
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
  expect(attemptRes.status()).toBe(201);
  const { attempt } = await attemptRes.json();

  try {
    await page.goto(`/exam/${attempt.id}`);

    // Start-of-exam gate prevents rendering exam questions until checkbox + fullscreen gesture
    const startBtn = page.getByRole('button', { name: 'Enter Fullscreen & Start Section 1' });
    await expect(startBtn).toBeDisabled();
    await page.getByRole('checkbox').check();
    await expect(startBtn).toBeEnabled();
    await startBtn.click();

    await expect(page.getByText('Question 1 of 40')).toBeVisible();

    // 1. Dispatch visibilitychange (hidden) -> Warning 1 of 3
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'hidden',
      });
      document.dispatchEvent(new Event('visibilitychange'));
    });

    await expect(page.getByText(/Warning 1 of 3/i)).toBeVisible();
    await page.getByRole('button', { name: /Acknowledge & Continue/i }).click();

    // Restore visibilityState
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'visible',
      });
    });

    // 2. Exit fullscreen -> Warning 2 of 3 + Return to Fullscreen button
    await page.evaluate(() => document.exitFullscreen());
    await expect(
      page.getByText(/Warning 2 of 3\. Return to fullscreen to continue\./i)
    ).toBeVisible();
    await page.getByRole('button', { name: 'Return to Fullscreen' }).click();
    await expect(page.getByText('Question 1 of 40')).toBeVisible();

    // 3. Wait > 1s and trigger 3rd violation -> Warning 3 of 3
    await page.waitForTimeout(1100);
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'hidden',
      });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect(page.getByText(/Warning 3 of 3/i)).toBeVisible();
    await page.getByRole('button', { name: /Acknowledge & Continue/i }).click();

    // 4. Trigger 4th violation -> Terminates attempt
    await page.waitForTimeout(1100);
    await page.evaluate(() => document.exitFullscreen());
    await expect(page.getByRole('heading', { name: 'Examination Terminated' })).toBeVisible();
    await expect(page.getByRole('button', { name: /View Results & Review/i })).toBeVisible();
  } finally {
    await request.delete(`http://localhost:4000/api/papers/${createdPaper.id}`).catch(() => {});
  }
});
