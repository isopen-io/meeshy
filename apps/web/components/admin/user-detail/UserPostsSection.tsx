'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FileText, Heart, MessageCircle, Eye, Clock, Loader2, Image as ImageIcon } from 'lucide-react';
import { apiService } from '@/services/api.service';
import { useI18n } from '@/hooks/use-i18n';
import { useCurrentInterfaceLanguage } from '@/stores/language-store';

interface AdminPostMedia {
  id: string;
  mimeType: string | null;
  fileUrl: string | null;
  thumbnailUrl: string | null;
}

interface AdminUserPost {
  id: string;
  type: 'POST' | 'REEL' | 'STORY' | 'STATUS';
  visibility: string;
  content: string | null;
  moodEmoji: string | null;
  deletedAt: string | null;
  likeCount: number;
  commentCount: number;
  viewCount: number;
  createdAt: string;
  media?: AdminPostMedia[];
}

interface PaginatedPosts {
  success: boolean;
  data: AdminUserPost[];
  pagination?: { total: number; offset: number; limit: number; hasMore: boolean };
}

type PostTypeFilter = 'ALL' | 'POST' | 'REEL' | 'STORY' | 'STATUS';

const PAGE_SIZE = 20;

const TYPE_FILTERS: ReadonlyArray<{ value: PostTypeFilter; labelKey: string }> = [
  { value: 'ALL', labelKey: 'usersDetail.filterAll' },
  { value: 'POST', labelKey: 'usersDetail.postTypePost' },
  { value: 'REEL', labelKey: 'usersDetail.postTypeReel' },
  { value: 'STORY', labelKey: 'usersDetail.postTypeStory' },
  { value: 'STATUS', labelKey: 'usersDetail.postTypeStatus' },
];

const POST_TYPE_META: Record<AdminUserPost['type'], { key: string; cls: string }> = {
  POST: { key: 'usersDetail.postTypePost', cls: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' },
  REEL: { key: 'usersDetail.postTypeReel', cls: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300' },
  STORY: { key: 'usersDetail.postTypeStory', cls: 'bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300' },
  STATUS: { key: 'usersDetail.postTypeStatus', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300' },
};

function formatDate(date: string | null, locale: string) {
  if (!date) return '—';
  try {
    return new Date(date).toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' });
  } /* istanbul ignore next -- toLocaleDateString never throws in practice */ catch {
    return '—';
  }
}

export function UserPostsSection({ userId }: { userId: string }) {
  const { t } = useI18n('admin');
  const locale = useCurrentInterfaceLanguage();
  const [posts, setPosts] = useState<AdminUserPost[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [typeFilter, setTypeFilter] = useState<PostTypeFilter>('ALL');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async (nextOffset: number, replace: boolean, filter: PostTypeFilter) => {
    if (replace) setLoading(true); else setLoadingMore(true);
    try {
      const params: Record<string, unknown> = { authorId: userId, offset: nextOffset, limit: PAGE_SIZE };
      if (filter !== 'ALL') params.type = filter;
      const resp = await apiService.get<PaginatedPosts>('/admin/posts', params);
      const page = resp.data?.data ?? [];
      const pagination = resp.data?.pagination;
      setPosts(prev => (replace ? page : [...prev, ...page]));
      setTotal(pagination?.total ?? page.length);
      setHasMore(pagination?.hasMore ?? false);
      setOffset(nextOffset + page.length);
      setError(null);
    } catch (err) {
      console.error('Error fetching user posts:', err);
      setError(t('usersDetail.loadError'));
    } finally {
      if (replace) setLoading(false); else setLoadingMore(false);
    }
  };

  useEffect(() => {
    setPosts([]);
    setOffset(0);
    setError(null);
    load(0, true, typeFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, typeFilter]);

  // Hide the whole section on error (e.g. 403 when the admin lacks moderation rights).
  if (error) return null;

  return (
    <Card className="dark:bg-gray-900 dark:border-gray-800">
      <CardHeader>
        <CardTitle className="flex items-center space-x-2 dark:text-gray-100">
          <FileText className="h-5 w-5" />
          <span>{t('usersDetail.postsTitle')}</span>
          {!loading && <Badge variant="secondary" className="text-xs">{total}</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {TYPE_FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => setTypeFilter(f.value)}
              className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                typeFilter === f.value
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-750'
              }`}
            >
              {t(f.labelKey)}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
            <span className="ml-2 text-sm text-gray-500">{t('usersDetail.loadingPosts')}</span>
          </div>
        ) : posts.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 py-2">{t('usersDetail.noPosts')}</p>
        ) : (
          <>
            {posts.map(post => {
              const typeMeta = POST_TYPE_META[post.type];
              const thumb = post.media?.find(m => m.thumbnailUrl || m.fileUrl);
              const thumbUrl = thumb?.thumbnailUrl || thumb?.fileUrl || null;
              return (
                <div key={post.id} className="p-3 border dark:border-gray-700 rounded-md bg-white dark:bg-gray-900 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2 min-w-0">
                      {thumbUrl ? (
                        <img src={thumbUrl} alt="" loading="lazy" decoding="async" className="w-12 h-12 rounded-md object-cover flex-shrink-0" />
                      ) : (post.media && post.media.length > 0) ? (
                        <div className="w-12 h-12 rounded-md bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0">
                          <ImageIcon className="h-5 w-5 text-gray-400" />
                        </div>
                      ) : null}
                      <p className="text-sm dark:text-gray-100 line-clamp-2 break-words">
                        {post.moodEmoji ? <span className="mr-1">{post.moodEmoji}</span> : null}
                        {post.content || <span className="text-gray-400 italic">{t('usersDetail.noPosts')}</span>}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${typeMeta.cls}`}>{t(typeMeta.key)}</span>
                      {post.deletedAt && (
                        <Badge variant="outline" className="text-xs text-red-600 dark:text-red-400 border-red-300 dark:border-red-800">
                          {t('usersDetail.deletedBadge')}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                    <span className="flex items-center gap-1"><Heart className="h-3 w-3" />{post.likeCount}</span>
                    <span className="flex items-center gap-1"><MessageCircle className="h-3 w-3" />{post.commentCount}</span>
                    <span className="flex items-center gap-1"><Eye className="h-3 w-3" />{post.viewCount}</span>
                    <span className="flex items-center gap-1 ml-auto"><Clock className="h-3 w-3" />{formatDate(post.createdAt, locale)}</span>
                  </div>
                </div>
              );
            })}
            {hasMore && (
              <button
                onClick={() => load(offset, false, typeFilter)}
                disabled={loadingMore}
                className="w-full text-sm text-indigo-600 dark:text-indigo-400 hover:underline py-2 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loadingMore && <Loader2 className="h-4 w-4 animate-spin" />}
                {t('usersDetail.loadMore')}
              </button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
