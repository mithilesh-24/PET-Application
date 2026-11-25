import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import History from './History.jsx';

describe('M11 History dashboard UI', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders empty state cleanly when there are zero attempts', async () => {
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (url.includes('/api/history/analytics')) {
        return Promise.resolve({
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ totalAttempts: 0, topics: [], recommendations: [] }),
        });
      }
      return Promise.resolve({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ attempts: [] }),
      });
    });

    render(
      <MemoryRouter>
        <History />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/No past examination attempts yet/i)).toBeInTheDocument();
      expect(
        screen.getByText(/No completed attempt data available for topic analytics yet/i)
      ).toBeInTheDocument();
    });
  });

  it('renders past tests, weak-topic analytics, and compares 2 selected attempts with SVG chart', async () => {
    const comparePayload = {
      attempts: [
        {
          attemptId: 'att-1',
          paperId: 'PET-1',
          paperTitle: 'Mock Test 1',
          status: 'completed',
          startedAt: 1000,
          endedAt: 61000,
          durationMs: 60000,
          total: 55,
          percentage: 55,
          section1: 20,
          section2: 25,
          section2a: 10,
          categories: {
            aptitude: { obtained: 7, possible: 15 },
            reasoning: { obtained: 8, possible: 15 },
            verbal: { obtained: 5, possible: 10 },
          },
          snippets: { obtained: 4, possible: 10 },
          subjects: {
            CC01: { name: 'DSA', obtained: 5, possible: 6 },
            CC02: { name: 'OOPS', obtained: 4, possible: 6 },
            CC03: { name: 'DBMS', obtained: 4, possible: 6 },
            CC04: { name: 'OS', obtained: 4, possible: 6 },
            CC05: { name: 'CN', obtained: 4, possible: 6 },
          },
          coding: { obtained: 10, possible: 20, testsPassed: 5, testsTotal: 10 },
          counts: { totalQuestions: 67, correct: 35, incorrect: 20, unanswered: 12 },
          violationCount: 0,
        },
        {
          attemptId: 'att-2',
          paperId: 'PET-2',
          paperTitle: 'Mock Test 2',
          status: 'completed',
          startedAt: 2000,
          endedAt: 82000,
          durationMs: 80000,
          total: 72,
          percentage: 72,
          section1: 28,
          section2: 30,
          section2a: 14,
          categories: {
            aptitude: { obtained: 10, possible: 15 },
            reasoning: { obtained: 10, possible: 15 },
            verbal: { obtained: 8, possible: 10 },
          },
          snippets: { obtained: 6, possible: 10 },
          subjects: {
            CC01: { name: 'DSA', obtained: 6, possible: 6 },
            CC02: { name: 'OOPS', obtained: 5, possible: 6 },
            CC03: { name: 'DBMS', obtained: 5, possible: 6 },
            CC04: { name: 'OS', obtained: 4, possible: 6 },
            CC05: { name: 'CN', obtained: 4, possible: 6 },
          },
          coding: { obtained: 14, possible: 20, testsPassed: 7, testsTotal: 10 },
          counts: { totalQuestions: 67, correct: 45, incorrect: 15, unanswered: 7 },
          violationCount: 1,
        },
      ],
    };

    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (url.includes('/api/history/compare')) {
        return Promise.resolve({
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => comparePayload,
        });
      }
      if (url.includes('/api/history/analytics')) {
        return Promise.resolve({
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            totalAttempts: 2,
            topics: [
              {
                topic: 'Graph algorithms',
                attempted: 5,
                correct: 2,
                attemptsCount: 2,
                enoughData: true,
                accuracyPercent: 40,
                statusText: '40% (2 of 5)',
              },
              {
                topic: 'Recursion',
                attempted: 2,
                correct: 1,
                attemptsCount: 1,
                enoughData: false,
                accuracyPercent: null,
                statusText: 'not enough data',
              },
            ],
            recommendations: ['Practise Graph algorithms: 40% across 2 attempts'],
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          attempts: [
            {
              attemptId: 'att-1',
              paperId: 'PET-1',
              paperTitle: 'Mock Test 1',
              status: 'completed',
              date: 61000,
              durationMs: 60000,
              total: 55,
              section1: 20,
              section2: 25,
              section2a: 10,
              hasResult: true,
            },
            {
              attemptId: 'att-2',
              paperId: 'PET-2',
              paperTitle: 'Mock Test 2',
              status: 'completed',
              date: 82000,
              durationMs: 80000,
              total: 72,
              section1: 28,
              section2: 30,
              section2a: 14,
              hasResult: true,
            },
          ],
        }),
      });
    });

    render(
      <MemoryRouter>
        <History />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Mock Test 1')).toBeInTheDocument();
      expect(screen.getByText('Graph algorithms: 40% (2 of 5)')).toBeInTheDocument();
      expect(screen.getByText('Recursion: not enough data')).toBeInTheDocument();
      expect(
        screen.getByText('Practise Graph algorithms: 40% across 2 attempts')
      ).toBeInTheDocument();
    });

    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]);
    fireEvent.click(checkboxes[1]);
    fireEvent.click(screen.getByRole('button', { name: /Compare Attempts \(2\)/i }));

    await waitFor(() => {
      expect(screen.getByText(/Attempt Comparison \(2 Attempts\)/i)).toBeInTheDocument();
      expect(screen.getByRole('img', { name: /Total score trend chart/i })).toBeInTheDocument();
    });
  });
});
