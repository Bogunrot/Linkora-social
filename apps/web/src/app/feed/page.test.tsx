import { render, screen, waitFor } from '@testing-library/react';
import FeedPage from './page';
import { useOptimisticLike, useOptimisticTip } from '@/contexts/useOptimisticStore';
import { mockOptimisticStore } from '@/__mocks__/optimisticStore';

jest.mock('@/contexts/useOptimisticStore', () => ({
  useOptimisticLike: mockOptimisticStore.useOptimisticLike,
  useOptimisticTip: mockOptimisticStore.useOptimisticTip,
}));

jest.mock('@/components/Feed', () => ({
  default: () => <div data-testid="feed-component" />,
}));

describe('FeedPage', () => {
  it('renders feed component', () => {
    render(<FeedPage />);
    expect(screen.getByTestId('feed-component')).toBeInTheDocument();
  });

  it('displays loading state initially', () => {
    render(<FeedPage />);
    expect(screen.getByTestId('loading-indicator')).toBeInTheDocument();
  });

  it('updates like count with optimistic updates', async () => {
    render(<FeedPage />);
    const likeButton = screen.getByTestId('like-button');
    likeButton.click();

    await waitFor(() => {
      expect(screen.getByText('Likes: 1')).toBeInTheDocument();
    });
  });
});