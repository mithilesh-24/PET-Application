import { expect, test } from '@playwright/test';
import { createValidFullPaper } from '../backend/tests/fixtures/paperFixtures.js';

test('M6 exam UI walkthrough across 3 questions, disabled Previous, display-only numbers, refresh recovery, and viewport screenshots', async ({
  page,
  context,
  request,
}) => {
  const uniqueId = `PET-E2E-${Date.now()}`;
  const paper = createValidFullPaper({
    paperId: uniqueId,
    title: `E2E Mock ${uniqueId}`,
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
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto(`/exam/${attempt.id}`);

    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Enter Fullscreen & Start Section 1' }).click();
    await expect(page.getByText('Question 1 of 40')).toBeVisible();

    const prevBtn = page.getByRole('button', { name: 'Previous' });
    await expect(prevBtn).toBeVisible();
    await expect(prevBtn).toBeDisabled();
    await expect(prevBtn).toHaveAttribute('title', 'Not allowed in this examination');

    // Answer Question 1 -> Save and Next
    await page.getByRole('radio').nth(0).check();
    await expect(page.getByText('Saved')).toBeVisible();
    await page.getByRole('button', { name: 'Save and Next' }).click();
    await expect(page.getByText('Question 2 of 40')).toBeVisible();

    // Forged click on numbered display item "1" must do nothing
    const item1 = page.locator('.display-num-cell', { hasText: /^1$/ });
    await expect(item1).toHaveAttribute('aria-disabled', 'true');
    await item1.click({ force: true });
    await expect(page.getByText('Question 2 of 40')).toBeVisible();

    // Answer Question 2 -> Save and Next -> Question 3
    await page.getByRole('radio').nth(1).check();
    await expect(page.getByText('Saved')).toBeVisible();
    await page.getByRole('button', { name: 'Save and Next' }).click();
    await expect(page.getByText('Question 3 of 40')).toBeVisible();

    // Refresh mid-question -> re-enter fullscreen gate -> returns to Question 3 with server timer intact
    await page.reload();
    await page.getByRole('button', { name: 'Return to Fullscreen' }).click();
    await expect(page.getByText('Question 3 of 40')).toBeVisible();
    await expect(page.getByTestId('exam-timer')).toBeVisible();

    // Check layout at 1366x768 (no horizontal overflow) and capture screenshot
    const overflow1366 = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    );
    expect(overflow1366).toBe(false);
    await page.screenshot({ path: 'test-results/m6-1366x768.png' });

    // Check layout at 1920x1080 on a fresh page (Chromium cannot resize an active fullscreen page)
    const page1920 = await context.newPage();
    await page1920.setViewportSize({ width: 1920, height: 1080 });
    await page1920.goto(`/exam/${attempt.id}`);
    await page1920.getByRole('button', { name: 'Return to Fullscreen' }).click();
    await expect(page1920.getByText('Question 3 of 40')).toBeVisible();
    const overflow1920 = await page1920.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    );
    expect(overflow1920).toBe(false);
    await page1920.screenshot({ path: 'test-results/m6-1920x1080.png' });
    await page1920.close();
  } finally {
    await request.delete(`http://localhost:4000/api/papers/${createdPaper.id}`).catch(() => {});
  }
});
