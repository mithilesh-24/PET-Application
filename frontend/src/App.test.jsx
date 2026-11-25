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
        attempts: [],
        totalAttempts: 0,
        topics: [],
        recommendations: [],
        paper: { id: 'p1', paperId: 'paper-1', title: 'Mock' },
        attemptId: 'attempt-1',
        paperTitle: 'Mock Paper',
        status: 'not_started',
        phase: 'not_started',
        nextSection: 'S1',
        violationCount: 0,
        violationLimit: 3,
        tools: [],
        dockerReady: false,
        total: 80,
        section1: 30,
        section2: 35,
        section2a: 15,
        breakdown: {
          percentage: 80,
          counts: { totalQuestions: 67, correct: 50, incorrect: 10, unanswered: 7 },
          sections: {
            S1: { obtained: 30, possible: 40, timeMs: 1000 },
            S2: { obtained: 35, possible: 40, timeMs: 1000 },
            S2A: { obtained: 15, possible: 20, timeMs: 1000 },
          },
          categories: {
            aptitude: { obtained: 10, possible: 15 },
            reasoning: { obtained: 10, possible: 15 },
            verbal: { obtained: 10, possible: 10 },
          },
          snippets: { obtained: 8, possible: 10 },
          subjects: {
            CC01: { code: 'CC01', name: 'DSA', obtained: 5, possible: 6 },
          },
          coding: { obtained: 15, possible: 20, testsPassed: 15, testsTotal: 20, problems: [] },
          time: { totalMs: 3000 },
          violations: [],
        },
      }),
    });
  });

  const routes = [
    ['/', 'PET PREP'],
    ['/upload', 'Upload Question Paper'],
    ['/instructions/paper-1', 'Examination Instructions'],
    ['/exam/attempt-1', 'Start-of-Examination Gate'],
    ['/results/attempt-1', 'Examination Results'],
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
