import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import MCQOptions from './MCQOptions.jsx';

describe('M6 MCQOptions component', () => {
  const options = ['Alpha', 'Beta', 'Gamma', 'Delta'];

  it('renders A-D options, supports click and keyboard shortcuts 1-4', () => {
    const onSelect = vi.fn();
    render(
      <MCQOptions options={options} selectedIndex={1} onSelect={onSelect} saveStatus="saved" />
    );

    expect(screen.getByText('A.')).toBeInTheDocument();
    expect(screen.getByText('D.')).toBeInTheDocument();
    expect(screen.getByText('Saved')).toBeInTheDocument();

    const radios = screen.getAllByRole('radio');
    expect(radios[1]).toBeChecked();

    fireEvent.click(radios[2]);
    expect(onSelect).toHaveBeenCalledWith(2);

    fireEvent.keyDown(window, { key: '4' });
    expect(onSelect).toHaveBeenCalledWith(3);
  });

  it('shows Not saved - retry indicator and calls onRetry when clicked', () => {
    const onRetry = vi.fn();
    render(
      <MCQOptions
        options={options}
        selectedIndex={0}
        onSelect={vi.fn()}
        saveStatus="error"
        onRetry={onRetry}
      />
    );

    expect(screen.getByText(/Not saved/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'retry' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
