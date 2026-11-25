import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Results from './Results.jsx';

describe('M10 Results dashboard and review UI', () => {
  it('renders golden score tables and filters review items', async () => {
    const resultPayload = {
      attemptId: 'att-1',
      paperId: 'PET-1',
      paperTitle: 'Golden Paper',
      status: 'terminated',
      terminated: true,
      terminationReason: 'Exceeded violation limit',
      total: 23.5,
      section1: 10,
      section2: 10,
      section2a: 3.5,
      breakdown: {
        percentage: 23.5,
        counts: { totalQuestions: 67, correct: 16, incorrect: 6, unanswered: 45 },
        sections: {
          S1: { obtained: 10, possible: 40, timeMs: 600000 },
          S2: { obtained: 10, possible: 40, timeMs: 300000 },
          S2A: { obtained: 3.5, possible: 20, timeMs: 120000 },
        },
        categories: {
          aptitude: { obtained: 10, possible: 15 },
          reasoning: { obtained: 0, possible: 15 },
          verbal: { obtained: 0, possible: 10 },
        },
        snippets: { obtained: 4, possible: 10 },
        subjects: {
          CC01: { code: 'CC01', name: 'DSA', obtained: 6, possible: 6 },
        },
        coding: {
          obtained: 3.5,
          possible: 20,
          testsPassed: 4,
          testsTotal: 20,
          problems: [
            {
              id: 'S2A-01',
              title: 'Budget',
              difficulty: 'medium',
              language: 'python',
              testsPassed: 4,
              testsTotal: 10,
              marksObtained: 3.5,
              marksPossible: 10,
            },
          ],
        },
        time: { totalMs: 1020000 },
        violations: [
          {
            id: 'v1',
            type: 'tab_hidden',
            at: 1700000000000,
            section: 'S1',
            questionId: 'S1-APT-01',
          },
        ],
      },
    };

    const reviewPayload = {
      attemptId: 'att-1',
      items: [
        {
          id: 'S1-APT-01',
          section: 'S1',
          type: 'mcq',
          topic: 'Numbers',
          marks: 1,
          marksAwarded: 1,
          isCorrect: true,
          isUnanswered: false,
          text: 'Sample apt question?',
          options: ['A1', 'B1', 'C1', 'D1'],
          selectedIndex: 0,
          answerIndex: 0,
          timeSpentMs: 5000,
          explanation: 'A1 is right.',
        },
        {
          id: 'S2A-01',
          section: 'S2A',
          type: 'coding',
          title: 'Budget',
          difficulty: 'medium',
          topic: 'DP',
          marks: 10,
          marksAwarded: 3.5,
          isCorrect: false,
          isUnanswered: false,
          statement: 'Compute budget',
          submittedLanguage: 'python',
          submittedSource: 'print(0)',
          testResults: [
            { testId: 'T01', passed: true, status: 'pass', runtimeMs: 10, marksAwarded: 3.5 },
          ],
          referenceSolution: { language: 'python', code: 'print(1)' },
          explanation: 'DP solution',
        },
      ],
    };

    globalThis.fetch = vi.fn((url) => {
      const payload = String(url).includes('/review') ? reviewPayload : resultPayload;
      return Promise.resolve({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => payload,
      });
    });

    render(
      <MemoryRouter initialEntries={['/results/att-1']}>
        <Routes>
          <Route path="/results/:attemptId" element={<Results />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByTestId('headline-total')).toHaveTextContent('23.5 / 100');
    expect(screen.getByText('23.5%')).toBeInTheDocument();
    expect(screen.getByText(/Exceeded violation limit/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Review Answers/i }));
    expect(await screen.findByText('Sample apt question?')).toBeInTheDocument();
    expect(screen.getByText('DP solution')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Filter by section'), { target: { value: 'S2A' } });
    expect(screen.queryByText('Sample apt question?')).not.toBeInTheDocument();
    expect(screen.getByText('DP solution')).toBeInTheDocument();
  });
});
