import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getCookie } from 'cookies-next';
import { getCurrentUser } from '@/lib/auth';
import { persistFeed } from '@/lib/persist';
import { PAGE_SIZE } from '@/constants';
import { getPosts } from '@/lib/posts';
import { getFollowing } from '@/lib/following';
import { indexerUrl } from '@/config';

export default async function FollowingFeed({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const cursor = Array.isArray(searchParams.cursor)
    ? searchParams.cursor[0]
    : searchParams.cursor;
  const currentUserAddress = getCurrentUser()?.address;
  const cursorQuery = cursor ? `&cursor=${cursor}` : '';

  if (!currentUserAddress) {
    redirect('/login');
  }

  const fetchFollowingFeed = async () => {
    try {
      const followingRes = await fetch(
        `${indexerUrl}/api/feed/following/${currentUserAddress}?limit=${PAGE_SIZE}${cursorQuery}`
      );
      if (!followingRes.ok) throw new Error('Failed to fetch following graph');
      const followingData = await followingRes.json();
      const followingList: string[] = followingData.following ?? [];

      const postsPromises = followingList.map(async (addr) => {
        const postsRes = await fetch(
          `${indexerUrl}/api/posts?author=${addr}&limit=${PAGE_SIZE}${cursorQuery}`
        );
        if (!postsRes.ok) return [];
        const posts = await postsRes.json();
        return posts.posts ?? [];
      });

      const allFetchedPosts = (await Promise.all(postsPromises)).flat();
      return allFetchedPosts;
    } catch (error) {
      console.error('Error fetching following feed:', error);
      return [];
    }
  };

  const { data: posts, cursor: nextCursor } = await getPosts({
    userAddress: currentUserAddress,
    cursor,
    limit: PAGE_SIZE,
    feedType: 'following',
  });

  const fetchedPosts = await fetchFollowingFeed();
  const mergedPosts = [...posts, ...fetchedPosts];
  const startIdx = 0;
  const paginated = mergedPosts.slice(startIdx, startIdx + PAGE_SIZE);

  persistFeed({
    userAddress: currentUserAddress,
    feedType: 'following',
    posts: paginated,
    cursor: nextCursor,
  });

  return {
    posts: paginated,
    hasMore: paginated.length === PAGE_SIZE,
    nextCursor,
  };
}

export async function generateMetadata() {
  return {
    title: 'Following Feed',
  };
}