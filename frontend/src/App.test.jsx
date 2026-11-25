import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppRoutes } from './App.jsx';

describe('frontend routes', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({
        papers: [],
        paper: { id: 'p1', paperId: 'paper-1', title: 'Mock' },
        attemptId: 'attempt-1',
        paperTitle: 'Mock Paper',
        status: 'not_started',
        phase: 'not_started',
        nextSection: 'S1',
        violationCount: 0,
        violationLimit: 3,
      }),
    });
  });

  const routes = [
    ['/', 'PET PREP'],
    ['/upload', 'Upload Question Paper'],
    ['/instructions/paper-1', 'Examination Instructions'],
    ['/exam/attempt-1', 'Ready to begin Section 1 — Common to All'],
    ['/results/attempt-1', 'Exam Results'],
    ['/history', 'Past Tests'],
    ['/settings', 'Settings'],
    ['/syllabus', 'PET Syllabus'],
  ];

  it.each(routes)('renders heading for %s', async (path, heading) => {
    render(
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    );

    expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument();
  });
});
