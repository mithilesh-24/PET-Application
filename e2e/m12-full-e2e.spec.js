import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { createValidFullPaper } from '../backend/tests/fixtures/paperFixtures.js';
import { openDatabase } from '../backend/database/database.js';
import { createKeyStore } from '../backend/services/keyStore.js';
import { createApp } from '../backend/server.js';

test.describe('M12 full end-to-end journey and negative security/timer checks', () => {
  test('positive E2E: landing copy -> import -> S1 -> S2 -> S2A (C, C++, Java, Python) -> results -> history -> export', async ({
    page,
    context,
    request,
  }) => {
    test.setTimeout(420000);
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    const uniqueId = `PET-M12-E2E-${Date.now()}`;
    const paper = createValidFullPaper({
      paperId: uniqueId,
      title: `M12 Full E2E ${uniqueId}`,
    });

    let createdPaperId = null;

    try {
      // 1. Landing copy, Syllabus, and Settings inspection
      await page.goto('/');
      await page.getByRole('button', { name: 'Copy AI Question Generation Prompt' }).click();
      await expect(page.getByText(/copied successfully/i)).toBeVisible();

      await page.getByRole('button', { name: 'View Syllabus' }).click();
      await expect(page.getByRole('heading', { name: 'PET Syllabus' })).toBeVisible();
      await expect(page.getByText('Permutations and Combinations')).toBeVisible();

      await page.getByRole('button', { name: 'Back to Home' }).click();
      await page.getByRole('button', { name: 'Settings' }).click();
      await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
      await expect(page.getByText('Local Data Folder:')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Backup Now' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Rebuild Runner Image' })).toBeVisible();

      // 2. Import valid fixture via Upload page UI
      await page.goto('/upload');
      await page.locator('input[type="file"]').setInputFiles({
        name: `${uniqueId}.petdraft`,
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(paper), 'utf8'),
      });
      await page.getByRole('button', { name: 'Upload & Verify Paper' }).click();
      await expect(page.getByText(/Paper verified and encrypted:/i)).toBeVisible({
        timeout: 120000,
      });

      const listRes = await request.get('http://localhost:4000/api/papers');
      const listJson = await listRes.json();
      createdPaperId = listJson.papers.find((p) => p.paperId === uniqueId)?.id || null;
      expect(createdPaperId).not.toBeNull();

      // 3. Instructions -> Start Exam -> Enter Fullscreen & Start Section 1
      await page.getByRole('button', { name: 'Go to Exam Instructions' }).click();
      await expect(page.getByRole('heading', { name: 'Examination Instructions' })).toBeVisible();
      await page.getByRole('checkbox').check();
      await page.getByRole('button', { name: 'Start Exam' }).click();

      await expect(page.getByRole('heading', { name: 'Start-of-Examination Gate' })).toBeVisible({
        timeout: 15000,
      });
      await page.getByRole('checkbox').check();
      await page.getByRole('button', { name: 'Enter Fullscreen & Start Section 1' }).click();
      await expect(page.getByText('Question 1 of 40')).toBeVisible({ timeout: 20000 });

      // 4. Finish Section 1 through UI (40 questions, selecting an option and clicking Save and Next)
      for (let i = 0; i < 39; i += 1) {
        await page.getByRole('radio').first().check();
        await page.getByRole('button', { name: 'Save and Next' }).click();
        await expect(page.getByText(`Question ${i + 2} of 40`)).toBeVisible();
      }
      await page.getByRole('radio').first().check();
      await page.getByRole('button', { name: 'Save and Submit Section' }).click();
      await page.getByRole('button', { name: 'Confirm Submit Section' }).click();

      // Transition screen -> Begin Section 2
      await page.getByRole('button', { name: 'Start Section 2' }).click();
      await expect(page.getByText('Question 1 of 25')).toBeVisible({ timeout: 15000 });

      // 5. Finish Section 2 through UI (25 questions)
      for (let i = 0; i < 24; i += 1) {
        await page.getByRole('radio').first().check();
        await page.getByRole('button', { name: 'Save and Next' }).click();
        await expect(page.getByText(`Question ${i + 2} of 25`)).toBeVisible();
      }
      await page.getByRole('radio').first().check();
      await page.getByRole('button', { name: 'Save and Submit Section' }).click();
      await page.getByRole('button', { name: 'Confirm Submit Section' }).click();

      // Transition screen -> Begin Section 2a
      await page.getByRole('button', { name: 'Start Section 2a' }).click();
      await expect(page.getByText('S2A-01: Minimum Subarray Budget')).toBeVisible({
        timeout: 20000,
      });

      // 6. Test real C and C++ submissions on S2A-01
      const cSource = '#include <stdio.h>\nint main(){int n; if(scanf("%d",&n)==1) printf("%d\\n",n); return 0;}\n';
      await page.locator('#coding-lang-select').selectOption('c');
      await expect(page.locator('.monaco-editor')).toContainText('#include <stdio.h>');
      await page.locator('.monaco-editor .view-lines').click();
      await page.keyboard.press('Control+A');
      await page.keyboard.press('Backspace');
      await page.keyboard.insertText(cSource);
      await page.getByRole('button', { name: 'Submit Code' }).click();
      await expect(page.getByText('Marks Obtained: 10 / 10')).toBeVisible({ timeout: 45000 });

      const cppSource =
        '#include <iostream>\nint main(){int n; if(std::cin>>n) std::cout<<n<<"\\n"; return 0;}\n';
      await page.locator('#coding-lang-select').selectOption('cpp');
      await expect(page.locator('.monaco-editor')).toContainText('#include <bits/stdc++.h>');
      await page.locator('.monaco-editor .view-lines').click();
      await page.keyboard.press('Control+A');
      await page.keyboard.press('Backspace');
      await page.keyboard.insertText(cppSource);
      await page.getByRole('button', { name: 'Submit Code' }).click();
      await expect(page.getByText('Marks Obtained: 10 / 10')).toBeVisible({ timeout: 45000 });

      // Move to S2A-02 and test Java + Python real submissions
      await page.getByRole('button', { name: 'Save and Next' }).click();
      await expect(page.getByText('S2A-02: Weighted Tree Path Queries')).toBeVisible({
        timeout: 15000,
      });

      const javaSource =
        'import java.util.*;\npublic class Main{public static void main(String[] a){Scanner s=new Scanner(System.in);if(s.hasNextInt())System.out.println(s.nextInt());}}\n';
      await page.locator('#coding-lang-select').selectOption('java');
      await expect(page.locator('.monaco-editor')).toContainText('public class Main');
      await page.locator('.monaco-editor .view-lines').click();
      await page.keyboard.press('Control+A');
      await page.keyboard.press('Backspace');
      await page.keyboard.insertText(javaSource);
      await page.getByRole('button', { name: 'Submit Code' }).click();
      await expect(page.getByText('Marks Obtained: 10 / 10')).toBeVisible({ timeout: 45000 });

      const pythonSource = 'import sys\nprint(sys.stdin.read().strip())\n';
      await page.locator('#coding-lang-select').selectOption('python');
      await expect(page.locator('.monaco-editor')).toContainText('def solve');
      await page.locator('.monaco-editor .view-lines').click();
      await page.keyboard.press('Control+A');
      await page.keyboard.press('Backspace');
      await page.keyboard.insertText(pythonSource);
      await page.getByRole('button', { name: 'Submit Code' }).click();
      await expect(page.getByText('Marks Obtained: 10 / 10')).toBeVisible({ timeout: 45000 });

      // Finish Exam -> Completion screen -> View Results & Review -> /results/:attemptId
      await page.getByRole('button', { name: 'Save and Submit Section' }).click();
      await page.getByRole('button', { name: 'Confirm Submit Section' }).click();
      await page.getByRole('button', { name: 'View Results & Review' }).click();
      await expect(page).toHaveURL(/\/results\//, { timeout: 20000 });
      await expect(page.getByRole('heading', { name: 'Examination Results' })).toBeVisible();
      const s2aRow = page.locator('tr', { hasText: 'Section 2a — Coding' });
      await expect(s2aRow).toContainText('20');

      // Navigate to History and verify attempt + real JSON/CSV downloads
      await page.getByRole('button', { name: 'Past Tests' }).click();
      await expect(page.getByRole('heading', { name: 'Past Tests' })).toBeVisible();
      await expect(page.getByText(`M12 Full E2E ${uniqueId}`)).toBeVisible();

      const row = page.locator('tr', { hasText: `M12 Full E2E ${uniqueId}` });
      const jsonDownloadPromise = page.waitForEvent('download');
      await row.getByRole('button', { name: 'Export JSON' }).click();
      const jsonDownload = await jsonDownloadPromise;
      const jsonText = await fs.readFile(await jsonDownload.path(), 'utf8');
      const parsedExport = JSON.parse(jsonText);
      expect(parsedExport.responses).toHaveLength(67);
      expect(parsedExport.result.section2a).toBe(20);

      const csvDownloadPromise = page.waitForEvent('download');
      await row.getByRole('button', { name: 'Export CSV' }).click();
      const csvDownload = await csvDownloadPromise;
      const csvText = await fs.readFile(await csvDownload.path(), 'utf8');
      expect(csvText.trim().split('\n')).toHaveLength(68);
    } finally {
      if (createdPaperId) {
        await request.delete(`http://localhost:4000/api/papers/${createdPaperId}`).catch(() => {});
      }
    }
  });

  test('negative E2E: corrupt upload, forged backward API calls, 4th violation termination, and PET_TEST_SECTION_MINUTES timer expiry', async ({
    page,
    request,
  }) => {
    test.setTimeout(180000);

    // 1. Corrupt file upload rejected in UI
    await page.goto('/upload');
    await page.locator('input[type="file"]').setInputFiles({
      name: 'corrupt.petdraft',
      mimeType: 'application/json',
      buffer: Buffer.from('{bad-json', 'utf8'),
    });
    await page.getByRole('button', { name: 'Upload & Verify Paper' }).click();
    await expect(page.getByRole('alert')).toContainText('PAPER_INVALID');

    // 2. Forged backward API calls & 4th violation termination
    const uniqueId = `PET-M12-NEG-${Date.now()}`;
    const paper = createValidFullPaper({ paperId: uniqueId, title: `M12 Neg ${uniqueId}` });
    const imp = await request.post('http://localhost:4000/api/papers/import', {
      timeout: 120000,
      multipart: {
        files: {
          name: `${uniqueId}.petdraft`,
          mimeType: 'application/json',
          buffer: Buffer.from(JSON.stringify(paper), 'utf8'),
        },
      },
    });
    expect(imp.status()).toBe(201);
    const createdPaperId = (await imp.json()).paper.id;

    try {
      const att = await request.post('http://localhost:4000/api/attempts', {
        data: { paperId: createdPaperId, violationLimit: 3 },
      });
      const attemptId = (await att.json()).attempt.id;

      await request.post(`http://localhost:4000/api/attempts/${attemptId}/start-section`, {
        data: { section: 'S1' },
      });
      await request.post(`http://localhost:4000/api/attempts/${attemptId}/submit-section`, {
        data: {},
      });

      // Forged request trying to reopen S1 must fail with 403 SECTION_LOCKED
      const forgedBack = await request.post(
        `http://localhost:4000/api/attempts/${attemptId}/start-section`,
        { data: { section: 'S1' } }
      );
      expect(forgedBack.status()).toBe(403);

      // Start S2 and trigger 4th violation termination (distinct types avoid 1s per-type dedup)
      await request.post(`http://localhost:4000/api/attempts/${attemptId}/start-section`, {
        data: { section: 'S2' },
      });
      const violationTypes = ['tab_hidden', 'fullscreen_exit', 'window_blur', 'devtools'];
      for (let i = 0; i < 3; i += 1) {
        const v = await request.post(`http://localhost:4000/api/attempts/${attemptId}/violation`, {
          data: { type: violationTypes[i], section: 'S2', questionId: 'S2-CC01-01' },
        });
        expect((await v.json()).terminated).toBe(false);
      }
      const v4 = await request.post(`http://localhost:4000/api/attempts/${attemptId}/violation`, {
        data: { type: violationTypes[3], section: 'S2', questionId: 'S2-CC01-01' },
      });
      expect((await v4.json()).terminated).toBe(true);

      // Terminated attempt has results accessible and marked terminated
      await page.goto(`/results/${attemptId}`);
      await expect(page.getByText(/Attempt Terminated:/i)).toBeVisible({ timeout: 15000 });
    } finally {
      await request.delete(`http://localhost:4000/api/papers/${createdPaperId}`).catch(() => {});
    }

    // 3. Shortened test timer expiry via PET_TEST_SECTION_MINUTES on single-port production server
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pet-prep-m12-timer-'));
    const prevEnv = process.env.PET_TEST_SECTION_MINUTES;
    process.env.PET_TEST_SECTION_MINUTES = '0.05'; // 3 seconds per section

    const db = openDatabase({ dbPath: path.join(tempDir, 'timer.db') });
    const app = createApp({
      db,
      keyStore: createKeyStore({ keyDir: path.join(tempDir, 'keys'), keytar: null }),
      encryptedPapersDir: path.join(tempDir, 'encrypted'),
      codingVerifier: async (p) => ({ ok: true, resolvedPaper: p, failures: [], warnings: [] }),
      serveFrontend: true,
      enableReconcileInterval: true,
    });
    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      const imp2 = await page.request.post(`${baseUrl}/api/papers/import`, {
        multipart: {
          files: {
            name: 'timer-paper.petdraft',
            mimeType: 'application/json',
            buffer: Buffer.from(
              JSON.stringify(createValidFullPaper({ paperId: 'PET-TIMER-01', title: 'Timer Test' })),
              'utf8'
            ),
          },
        },
      });
      expect(imp2.status()).toBe(201);
      const timerPaperId = (await imp2.json()).paper.id;
      const att2 = await page.request.post(`${baseUrl}/api/attempts`, {
        data: { paperId: timerPaperId, violationLimit: 3 },
      });
      const timerAttemptId = (await att2.json()).attempt.id;
      await page.request.post(`${baseUrl}/api/attempts/${timerAttemptId}/start-section`, {
        data: { section: 'S1' },
      });

      await page.goto(`${baseUrl}/exam/${timerAttemptId}`);
      await page.getByRole('button', { name: 'Return to Fullscreen' }).click();
      // Section 1 expires automatically in ~3 seconds -> transition screen appears
      await expect(page.getByRole('heading', { name: /Section 1 expired\./i })).toBeVisible({
        timeout: 15000,
      });
    } finally {
      if (prevEnv === undefined) delete process.env.PET_TEST_SECTION_MINUTES;
      else process.env.PET_TEST_SECTION_MINUTES = prevEnv;
      if (app.locals.reconcileTimer) clearInterval(app.locals.reconcileTimer);
      await new Promise((resolve) => server.close(resolve));
      db.close();
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });
});
