'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Image as ImageIcon, Video, Music, FileText, Loader2 } from 'lucide-react';
import { apiService } from '@/services/api.service';
import { useI18n } from '@/hooks/use-i18n';

interface AdminUserMedia {
  id: string;
  originalName: string | null;
  mimeType: string | null;
  fileUrl: string | null;
  thumbnailUrl: string | null;
  fileSize: number | null;
  width: number | null;
  height: number | null;
  duration: number | null;
  createdAt: string;
  source: 'post' | 'message';
  contextId: string | null;
}

interface PaginatedMedia {
  success: boolean;
  data: AdminUserMedia[];
  pagination?: { total: number; offset: number; limit: number; hasMore: boolean };
}

const PAGE_SIZE = 24;

function mediaKind(mime: string | null): 'image' | 'video' | 'audio' | 'file' {
  if (!mime) return 'file';
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return 'file';
}

function formatSize(bytes: number | null): string {
  /* istanbul ignore next -- never called with falsy bytes; JSX guards with {fileSize ? formatSize(item.fileSize) : null} */
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const KIND_ICON = {
  image: ImageIcon,
  video: Video,
  audio: Music,
  file: FileText,
} as const;

export function UserMediaSection({ userId }: { userId: string }) {
  const { t } = useI18n('admin');
  const [media, setMedia] = useState<AdminUserMedia[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async (nextOffset: number, replace: boolean) => {
    if (replace) setLoading(true); else setLoadingMore(true);
    try {
      const resp = await apiService.get<PaginatedMedia>(
        `/admin/users/${userId}/media`,
        { offset: nextOffset, limit: PAGE_SIZE }
      );
      const page = resp.data?.data ?? [];
      const pagination = resp.data?.pagination;
      setMedia(prev => (replace ? page : [...prev, ...page]));
      setTotal(pagination?.total ?? page.length);
      setHasMore(pagination?.hasMore ?? false);
      setOffset(nextOffset + page.length);
      setError(null);
    } catch (err) {
      console.error('Error fetching user media:', err);
      setError(t('usersDetail.loadError'));
    } finally {
      if (replace) setLoading(false); else setLoadingMore(false);
    }
  };

  useEffect(() => {
    setMedia([]);
    setOffset(0);
    setError(null);
    load(0, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  if (loading) {
    return (
      <Card className="dark:bg-gray-900 dark:border-gray-800">
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
          <span className="ml-2 text-sm text-gray-500">{t('usersDetail.loadingMedia')}</span>
        </CardContent>
      </Card>
    );
  }

  if (error) return null;

  return (
    <Card className="dark:bg-gray-900 dark:border-gray-800">
      <CardHeader>
        <CardTitle className="flex items-center space-x-2 dark:text-gray-100">
          <ImageIcon className="h-5 w-5" />
          <span>{t('usersDetail.mediaTitle')}</span>
          <Badge variant="secondary" className="text-xs">{total}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {media.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 py-2">{t('usersDetail.noMedia')}</p>
        ) : (
          <>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {media.map(item => {
                const kind = mediaKind(item.mimeType);
                const Icon = KIND_ICON[kind];
                const preview = kind === 'image' ? (item.thumbnailUrl || item.fileUrl) : item.thumbnailUrl;
                return (
                  <a
                    key={`${item.source}-${item.id}`}
                    href={item.fileUrl || undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group relative aspect-square rounded-md overflow-hidden border dark:border-gray-700 bg-gray-100 dark:bg-gray-800 flex items-center justify-center"
                    title={item.originalName || undefined}
                  >
                    {preview ? (
                      <img src={preview} alt={item.originalName || ''} loading="lazy" decoding="async" className="w-full h-full object-cover" />
                    ) : (
                      <Icon className="h-7 w-7 text-gray-400" />
                    )}
                    {kind !== 'image' && preview && (
                      <Icon className="absolute h-6 w-6 text-white drop-shadow" />
                    )}
                    <span className="absolute top-1 left-1 text-[10px] px-1 py-0.5 rounded bg-black/60 text-white">
                      {item.source === 'post' ? t('usersDetail.postTypePost') : t('usersDetail.mediaSourceMessage')}
                    </span>
                    {item.fileSize ? (
                      <span className="absolute bottom-1 right-1 text-[10px] px-1 py-0.5 rounded bg-black/60 text-white">
                        {formatSize(item.fileSize)}
                      </span>
                    ) : null}
                  </a>
                );
              })}
            </div>
            {hasMore && (
              <button
                onClick={() => load(offset, false)}
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
