'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ShieldAlert, Loader2 } from 'lucide-react';
import { apiService } from '@/services/api.service';
import { useI18n } from '@/hooks/use-i18n';
import { useCurrentInterfaceLanguage } from '@/stores/language-store';
import { ReportStatusBadge, ReportTypeBadge, formatReportDate } from './UserReportsSection';

interface ReportedMessage {
  id: string;
  content: string | null;
  conversationId: string;
  messageType: string;
  createdAt: string;
  deletedAt: string | null;
}

interface AdminReportedMessage {
  id: string;
  reportedEntityId: string;
  reportType: string;
  reason: string | null;
  status: string;
  reporterId: string | null;
  reporterName: string | null;
  createdAt: string;
  resolvedAt: string | null;
  message: ReportedMessage | null;
}

interface PaginatedReportedMessages {
  success: boolean;
  data: AdminReportedMessage[];
  pagination?: { total: number; offset: number; limit: number; hasMore: boolean };
}

const PAGE_SIZE = 20;

export function UserReportedMessagesSection({ userId }: { userId: string }) {
  const { t } = useI18n('admin');
  const locale = useCurrentInterfaceLanguage();
  const [items, setItems] = useState<AdminReportedMessage[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async (nextOffset: number, replace: boolean) => {
    if (replace) setLoading(true); else setLoadingMore(true);
    try {
      const resp = await apiService.get<PaginatedReportedMessages>(
        `/admin/users/${userId}/reported-messages`,
        { offset: nextOffset, limit: PAGE_SIZE }
      );
      const page = resp.data?.data ?? [];
      const pagination = resp.data?.pagination;
      setItems(prev => (replace ? page : [...prev, ...page]));
      setTotal(pagination?.total ?? page.length);
      setHasMore(pagination?.hasMore ?? false);
      setOffset(nextOffset + page.length);
      setError(null);
    } catch (err) {
      console.error('Error fetching user reported messages:', err);
      setError(t('usersDetail.loadError'));
    } finally {
      if (replace) setLoading(false); else setLoadingMore(false);
    }
  };

  useEffect(() => {
    setItems([]);
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
          <span className="ml-2 text-sm text-gray-500">{t('usersDetail.loadingReportedMessages')}</span>
        </CardContent>
      </Card>
    );
  }

  if (error) return null;

  return (
    <Card className="dark:bg-gray-900 dark:border-gray-800">
      <CardHeader>
        <CardTitle className="flex items-center space-x-2 dark:text-gray-100">
          <ShieldAlert className="h-5 w-5" />
          <span>{t('usersDetail.reportedMessagesTitle')}</span>
          <Badge variant="secondary" className="text-xs">{total}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 py-2">{t('usersDetail.noReportedMessages')}</p>
        ) : (
          <>
            {items.map(item => {
              const deleted = !!item.message?.deletedAt;
              const reporter = item.reporterName || (item.reporterId ? null : t('usersDetail.anonymousReporter'));
              return (
                <div key={item.id} className="p-3 border dark:border-gray-700 rounded-md bg-white dark:bg-gray-900 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <p className={`text-sm line-clamp-2 break-words ${deleted ? 'text-gray-400 italic line-through' : 'dark:text-gray-100'}`}>
                      {item.message?.content || <span className="text-gray-400 italic">{t('usersDetail.deletedBadge')}</span>}
                    </p>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <ReportStatusBadge status={item.status} />
                      {deleted && (
                        <Badge variant="outline" className="text-xs text-red-600 dark:text-red-400 border-red-300 dark:border-red-800">
                          {t('usersDetail.deletedBadge')}
                        </Badge>
                      )}
                    </div>
                  </div>
                  {item.reason && (
                    <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2 break-words">{item.reason}</p>
                  )}
                  <div className="flex items-center justify-between gap-2">
                    <ReportTypeBadge type={item.reportType} />
                    <div className="text-xs text-gray-400 flex items-center gap-2">
                      {reporter && <span className="truncate max-w-[120px]">{reporter}</span>}
                      <span>{formatReportDate(item.createdAt, locale)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
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
