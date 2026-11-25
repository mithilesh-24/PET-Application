import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppRoutes } from './App.jsx';

describe('M0 frontend routes', () => {
  const routes = [
    ['/', 'PET Prep - Home'],
    ['/upload', 'Upload Question Paper'],
    ['/instructions/paper-1', 'Exam Instructions'],
    ['/exam/attempt-1', 'Examination'],
    ['/results/attempt-1', 'Exam Results'],
    ['/history', 'Past Tests'],
    ['/settings', 'Settings'],
    ['/syllabus', 'PET Syllabus'],
  ];

  it.each(routes)('renders placeholder title for %s', (path, heading) => {
    render(
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument();
  });
});
