import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App.js';

describe('App', () => {
  it('renders the shopping experience heading', () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: 'Find your next favorite' })).toBeInTheDocument();
  });
});
