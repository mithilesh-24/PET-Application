import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import ProgressIndicator from './ProgressIndicator.jsx';

describe('M6 ProgressIndicator component', () => {
  it('renders counts, progress bar, violations, and display-only aria-disabled cells', () => {
    render(
      <ProgressIndicator
        currentIndex={6}
        totalInSection={40}
        answeredCount={5}
        unansweredCount={35}
        secondsRemaining={2700}
        violationCount={1}
        violationLimit={3}
      />
    );

    expect(screen.getByText('7 of 40 answered/seen')).toBeInTheDocument();
    expect(screen.getByText('7 / 40')).toBeInTheDocument();
    expect(screen.getByText('1 / 3')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '7');

    const cell3 = screen.getByText('3');
    expect(cell3).toHaveAttribute('aria-disabled', 'true');
    expect(cell3.tagName).toBe('SPAN');
    fireEvent.click(cell3);
    expect(screen.getByText('7 / 40')).toBeInTheDocument();
  });
});
