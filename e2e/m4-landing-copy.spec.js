import { expect, test } from '@playwright/test';
import { GENERATION_PROMPT } from '../frontend/src/services/promptService.js';

test('M4 landing page copy button copies verbatim prompt and modal opens', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'PET PREP' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Generate Your PET Mock Test' })).toBeVisible();

  await page.getByRole('button', { name: 'Copy AI Question Generation Prompt' }).click();
  await expect(page.getByText('PET question-generation prompt copied successfully.')).toBeVisible();

  const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboardText.replace(/\r\n/g, '\n')).toBe(GENERATION_PROMPT);

  await page.getByRole('button', { name: 'Show Prompt Preview' }).click();
  await expect(page.getByLabel('AI question generation prompt preview')).toBeVisible();

  await page.getByRole('button', { name: 'Upload Question Paper' }).click();
  await expect(page.getByRole('dialog', { name: 'Upload Question Paper' })).toBeVisible();
});
