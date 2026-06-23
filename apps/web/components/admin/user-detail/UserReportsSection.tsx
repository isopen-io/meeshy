'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Flag, Loader2 } from 'lucide-react';
import { apiService } from '@/services/api.service';
import { useI18n } from '@/hooks/use-i18n';
import { useCurrentInterfaceLanguage } from '@/stores/language-store';

interface AdminUserReport {
  id: string;
  reportedType: string;
  reportedEntityId: string;
  reportType: string;
  reason: string | null;
  status: string;
  actionTaken: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

interface PaginatedReports {
  success: boolean;
  data: AdminUserReport[];
  pagination?: { total: number; offset: number; limit: number; hasMore: boolean };
}

const PAGE_SIZE = 20;

const REPORT_STATUS_META: Record<string, { key: string; cls: string }> = {
  pending: { key: 'usersDetail.reportStatusPending', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300' },
  under_review: { key: 'usersDetail.reportStatusUnderReview', cls: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' },
  resolved: { key: 'usersDetail.reportStatusResolved', cls: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' },
  rejected: { key: 'usersDetail.reportStatusRejected', cls: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' },
  dismissed: { key: 'usersDetail.reportStatusDismissed', cls: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300' },
};

const REPORT_TYPE_KEYS: Record<string, string> = {
  spam: 'usersDetail.reportTypeSpam',
  inappropriate: 'usersDetail.reportTypeInappropriate',
  harassment: 'usersDetail.reportTypeHarassment',
  violence: 'usersDetail.reportTypeViolence',
  hate_speech: 'usersDetail.reportTypeHateSpeech',
  fake_profile: 'usersDetail.reportTypeFakeProfile',
  impersonation: 'usersDetail.reportTypeImpersonation',
  other: 'usersDetail.reportTypeOther',
};

const REPORTED_TYPE_KEYS: Record<string, string> = {
  message: 'usersDetail.reportedTypeMessage',
  user: 'usersDetail.reportedTypeUser',
  conversation: 'usersDetail.reportedTypeConversation',
  community: 'usersDetail.reportedTypeCommunity',
};

export function ReportStatusBadge({ status }: { status: string }) {
  const { t } = useI18n('admin');
  const meta = REPORT_STATUS_META[status];
  const cls = meta?.cls ?? 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
  return <span className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${cls}`}>{meta ? t(meta.key) : status}</span>;
}

export function ReportTypeBadge({ type }: { type: string }) {
  const { t } = useI18n('admin');
  const key = REPORT_TYPE_KEYS[type];
  return <Badge variant="outline" className="text-xs">{key ? t(key) : type}</Badge>;
}

export function formatReportDate(date: string | null, locale: string): string {
  if (!date) return '—';
  try {
    return new Date(date).toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' });
  } /* istanbul ignore next -- toLocaleDateString never throws in practice */ catch {
    return '—';
  }
}

export function UserReportsSection({ userId }: { userId: string }) {
  const { t } = useI18n('admin');
  const locale = useCurrentInterfaceLanguage();
  const [reports, setReports] = useState<AdminUserReport[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async (nextOffset: number, replace: boolean) => {
    if (replace) setLoading(true); else setLoadingMore(true);
    try {
      const resp = await apiService.get<PaginatedReports>(
        `/admin/users/${userId}/reports`,
        { offset: nextOffset, limit: PAGE_SIZE }
      );
      const page = resp.data?.data ?? [];
      const pagination = resp.data?.pagination;
      setReports(prev => (replace ? page : [...prev, ...page]));
      setTotal(pagination?.total ?? page.length);
      setHasMore(pagination?.hasMore ?? false);
      setOffset(nextOffset + page.length);
      setError(null);
    } catch (err) {
      console.error('Error fetching user reports:', err);
      setError(t('usersDetail.loadError'));
    } finally {
      if (replace) setLoading(false); else setLoadingMore(false);
    }
  };

  useEffect(() => {
    setReports([]);
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
          <span className="ml-2 text-sm text-gray-500">{t('usersDetail.loadingReports')}</span>
        </CardContent>
      </Card>
    );
  }

  if (error) return null;

  return (
    <Card className="dark:bg-gray-900 dark:border-gray-800">
      <CardHeader>
        <CardTitle className="flex items-center space-x-2 dark:text-gray-100">
          <Flag className="h-5 w-5" />
          <span>{t('usersDetail.reportsTitle')}</span>
          <Badge variant="secondary" className="text-xs">{total}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {reports.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 py-2">{t('usersDetail.noReports')}</p>
        ) : (
          <>
            {reports.map(report => {
              const reportedTypeKey = REPORTED_TYPE_KEYS[report.reportedType];
              return (
                <div key={report.id} className="p-3 border dark:border-gray-700 rounded-md bg-white dark:bg-gray-900 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="secondary" className="text-xs">
                        {reportedTypeKey ? t(reportedTypeKey) : report.reportedType}
                      </Badge>
                      <ReportTypeBadge type={report.reportType} />
                    </div>
                    <ReportStatusBadge status={report.status} />
                  </div>
                  {report.reason && (
                    <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2 break-words">{report.reason}</p>
                  )}
                  <div className="text-xs text-gray-400 text-right">{formatReportDate(report.createdAt, locale)}</div>
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
