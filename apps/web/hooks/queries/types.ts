import type { Post, PostComment } from '@meeshy/shared/types/post';

export interface FeedPage {
  data: Post[];
  meta: {
    pagination: {
      total: number;
      offset: number;
      limit: number;
      hasMore: boolean;
    };
    nextCursor: string | null;
  };
}

export interface InfiniteFeedData {
  pages: FeedPage[];
  pageParams: (string | undefined)[];
}

export interface CommentPage {
  data: PostComment[];
  meta: {
    pagination: {
      total: number;
      offset: number;
      limit: number;
      hasMore: boolean;
    };
    nextCursor: string | null;
  };
}

export interface InfiniteCommentsData {
  pages: CommentPage[];
  pageParams: (string | undefined)[];
}
