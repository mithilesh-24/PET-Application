import { describe, expect, it } from 'vitest';
import request from 'supertest';
import path from 'node:path';
import { createApp } from '../server.js';
import { loadConfig } from '../config.js';
import { AppError } from '../middleware/errorHandler.js';

describe('M0 backend scaffold', () => {
  it('GET /api/health returns { ok: true, version }', async () => {
    const app = createApp();
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body).toEqual({
      ok: true,
      version: expect.any(String),
    });
  });

  it('returns Contract E JSON when a route throws an unexpected error', async () => {
    const app = createApp({
      registerExtraRoutes(instance) {
        instance.get('/api/test-boom', () => {
          throw new Error('Unexpected failure');
        });
      },
    });

    const res = await request(app).get('/api/test-boom');
    expect(res.status).toBe(500);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body).toEqual({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected internal error occurred',
      },
    });
  });

  it('returns Contract E JSON when a route throws AppError', async () => {
    const app = createApp({
      registerExtraRoutes(instance) {
        instance.get('/api/test-app-error', () => {
          throw new AppError(400, 'VALIDATION_FAILED', 'Invalid field', { field: 'paperId' });
        });
      },
    });

    const res = await request(app).get('/api/test-app-error');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Invalid field',
        details: { field: 'paperId' },
      },
    });
  });

  it('returns NOT_FOUND Contract E JSON for unknown /api routes', async () => {
    const app = createApp();
    const res = await request(app).get('/api/does-not-exist');

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(res.body.error.message).toContain('/api/does-not-exist');
  });

  it('allows CORS only for the configured Vite origin', async () => {
    const app = createApp();

    const allowed = await request(app).get('/api/health').set('Origin', 'http://localhost:5173');
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173');

    const disallowed = await request(app)
      .get('/api/health')
      .set('Origin', 'https://evil.example.com');
    expect(disallowed.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('rejects JSON bodies exceeding 2 MB with Contract E JSON', async () => {
    const app = createApp({
      registerExtraRoutes(instance) {
        instance.post('/api/test-echo', (req, res) => res.json({ size: req.body?.data?.length }));
      },
    });

    const largePayload = { data: 'a'.repeat(2 * 1024 * 1024 + 1024) };
    const res = await request(app).post('/api/test-echo').send(largePayload);

    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('loads config defaults properly and keeps data paths outside src folders', () => {
    const cfg = loadConfig({});
    expect(cfg.port).toBe(4000);
    expect(cfg.violationLimit).toBe(3);
    expect(cfg.jsonBodyLimit).toBe('2mb');
    expect(cfg.multipartLimitBytes).toBe(25 * 1024 * 1024);
    expect(cfg.paths.databaseDir).toBe(path.join(cfg.dataDir, 'database'));
    expect(cfg.paths.encryptedPapersDir).toBe(
      path.join(cfg.dataDir, 'question-banks', 'encrypted')
    );
    expect(cfg.paths.resultsDir).toBe(path.join(cfg.dataDir, 'results'));
    expect(cfg.paths.tempExecDir).toBe(path.join(cfg.dataDir, 'execution', 'temporary'));
    expect(cfg.dataDir).not.toMatch(/[/\\]src([/\\]|$)/);
  });
});
