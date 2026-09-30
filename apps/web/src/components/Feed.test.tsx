import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import Feed from './Feed';
import { fetchIsPaused } from '../lib/api';
import { mockFetchIsPaused } from '../__mocks__/api';

jest.mock('../lib/api');

const mockFetchIsPaused = jest.fn();

describe('Feed', () => {
  beforeEach(() => {
    mockFetchIsPaused.mockResolvedValue(false);
  });

  it('renders loading state initially', () => {
    render(<Feed />);
    expect(screen.getByTestId('loading-indicator')).toBeInTheDocument();
  });

  it('displays paused state when API returns true', async () => {
    mockFetchIsPaused.mockResolvedValue(true);
    render(<Feed />);

    await waitFor(() => {
      expect(screen.getByText('Feed is paused')).toBeInTheDocument();
    });
  });

  it('displays error when fetch fails', async () => {
    mockFetchIsPaused.mockRejectedValue(new Error('Network error'));
    render(<Feed />);

    await waitFor(() => {
      expect(screen.getByText('Failed to load feed')).toBeInTheDocument();
    });
  });
});