import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import Timer from './Timer.jsx';

describe('M6 Timer component', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('formats HH:MM:SS, applies warning class under 5 minutes, and triggers onExpire at 0', () => {
    const now = 1_700_000_000_000;
    vi.setSystemTime(now);
    const onExpire = vi.fn();
    const onSync = vi.fn();

    render(
      <Timer deadlineAt={now + 245 * 1000} serverNow={now} onSync={onSync} onExpire={onExpire} />
    );

    const timerEl = screen.getByTestId('exam-timer');
    expect(timerEl).toHaveTextContent('00:04:05');
    expect(timerEl.className).toContain('timer-warning');

    fireEvent.focus(window);
    expect(onSync).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(15000);
    });
    expect(onSync).toHaveBeenCalledTimes(2);
    expect(timerEl).toHaveTextContent('00:03:50');

    act(() => {
      vi.advanceTimersByTime(230 * 1000);
    });
    expect(timerEl).toHaveTextContent('00:00:00');
    expect(onExpire).toHaveBeenCalledTimes(1);
  });
});
