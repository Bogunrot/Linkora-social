import { renderHook, waitFor } from '@testing-library/react-hooks';
import { useSearchSuggestions } from './useSearchSuggestions';
import { mockApi } from '../__mocks__/api';

describe('useSearchSuggestions', () => {
  it('should return suggestions when search term exists', async () => {
    mockApi.fetchSuggestions.mockResolvedValue(['suggestion1', 'suggestion2']);

    const { result } = renderHook(() => useSearchSuggestions('test'));
    await waitFor(() => expect(result.current).toEqual(['suggestion1', 'suggestion2']));
  });

  it('should return empty array when no suggestions found', async () => {
    mockApi.fetchSuggestions.mockResolvedValue([]);

    const { result } = renderHook(() => useSearchSuggestions('nonexistent'));
    await waitFor(() => expect(result.current).toEqual([]));
  });

  it('should handle API errors', async () => {
    mockApi.fetchSuggestions.mockRejectedValue(new Error('API failed'));

    const { result } = renderHook(() => useSearchSuggestions('test'));
    await waitFor(() => expect(result.current).toEqual([]));
  });
});