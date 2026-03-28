'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/react-query/query-keys';
import { postsService } from '@/services/posts.service';

export function usePostQuery(postId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.posts.detail(postId ?? ''),
    queryFn: () => postsService.getPost(postId!),
    enabled: !!postId,
    select: (response) => response.data,
  });
}
