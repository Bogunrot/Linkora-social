import { describe, it, expect, vi, beforeEach } from 'jest';
import { fetchPools, fetchIsPaused } from './api';
import { mockApiResponse } from '../__mocks__/api';

const mockFetch = vi.fn();

beforeEach(() => {
  global.fetch = mockFetch;
  mockFetch.mockReset();
});

describe('fetchPools', () => {
  it('should return empty array when API returns 500', async () => {
    mockFetch.mockRejectedValue({ message: 'Indexer returned 500: Internal Server Error' });
    const result = await fetchPools();
    expect(result).toEqual([]);
  });

  it('should return empty array on network error', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));
    const result = await fetchPools();
    expect(result).toEqual([]);
  });

  it('should return pools data when successful', async () => {
    mockFetch.mockResolvedValue(mockApiResponse.successPools);
    const result = await fetchPools();
    expect(result).toEqual(mockApiResponse.successPools.data);
  });
});

describe('fetchIsPaused', () => {
  it('should return true when paused', async () => {
    mockFetch.mockResolvedValue(mockApiResponse.pausedResponse);
    const result = await fetchIsPaused();
    expect(result).toBe(true);
  });

  it('should return false when not paused', async () => {
    mockFetch.mockResolvedValue(mockApiResponse.notPausedResponse);
    const result = await fetchIsPaused();
    expect(result).toBe(false);
  });
});