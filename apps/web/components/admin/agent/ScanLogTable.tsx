'use client';

import React, { memo, useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { List, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { agentAdminService, type ScanLogSummary, type ScanLogsFilters } from '@/services/agent-admin.service';
import { useI18n } from '@/hooks/useI18n';
import dynamic from 'next/dynamic';

const ScanLogDetail = dynamic(() => import('./ScanLogDetail'), {
  loading: () => <div className="h-40 animate-pulse bg-slate-200 dark:bg-slate-700 rounded" />,
});

const OUTCOME_STYLES: Record<string, string> = {
  messages_sent: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800',
  reactions_only: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800',
  skipped: 'bg-slate-50 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
  error: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800',
};

type ScanLogTableProps = {
  conversationId?: string;
};

export default memo(function ScanLogTable({ conversationId }: ScanLogTableProps) {
  const { t } = useI18n('admin');
  const [logs, setLogs] = useState<ScanLogSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);
  const [filters, setFilters] = useState<ScanLogsFilters>({ limit: 15, conversationId });

  const formatTimeAgo = useCallback((dateStr: string): string => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return t('timeAgo.now');
    if (mins < 60) return `${mins}${t('timeAgo.minutes')}`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}${t('timeAgo.hours')}`;
    return `${Math.floor(hours / 24)}${t('timeAgo.days')}`;
  }, [t]);

  const getTriggerLabel = useCallback((trigger: string): string => {
    const labels: Record<string, string> = {
      auto: t('trigger.auto'),
      manual: t('trigger.manual'),
      timeout: t('trigger.timeout'),
      user_message: t('trigger.message'),
      reply_to: t('trigger.reply'),
    };
    return labels[trigger] ?? trigger;
  }, [t]);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await agentAdminService.getScanLogs({ ...filters, page });
      if (res.success && res.data) {
        setLogs(res.data);
        setTotal(res.pagination?.total ?? 0);
      }
    } catch {} finally { setLoading(false); }
  }, [page, filters]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  /* istanbul ignore next -- filters.limit is always initialized to 15; ?? 15 fallback is unreachable */
  const limit = filters.limit ?? 15;
  const hasMore = page * limit < total;

  const filterButtons = [
    { key: 'all', label: t('filter.all'), outcome: undefined },
    { key: 'messages_sent', label: t('filter.sent'), outcome: 'messages_sent' },
    { key: 'skipped', label: t('filter.skip'), outcome: 'skipped' },
    { key: 'error', label: t('filter.error'), outcome: 'error' },
  ];

  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <List className="h-4 w-4 text-indigo-500" />
              {t('scanLog.title')}
              <Badge variant="outline" className="text-[10px] tabular-nums">{total}</Badge>
            </CardTitle>
            <div className="flex items-center gap-2">
              {filterButtons.map(({ key, label, outcome }) => (
                <Button
                  key={key}
                  variant={filters.outcome === outcome && (key !== 'all' || !filters.outcome) ? 'default' : 'outline'}
                  size="sm"
                  className="h-6 text-[10px] px-2"
                  onClick={() => {
                    setFilters(prev => ({ ...prev, outcome }));
                    setPage(1);
                  }}
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
          ) : logs.length === 0 ? (
            <div className="text-sm text-gray-400 text-center py-12">{t('scanLog.empty')}</div>
          ) : (
            <ScrollArea className="max-h-[500px]">
              <div className="space-y-1">
                {logs.map(log => (
                  <button
                    key={log.id}
                    onClick={() => setSelectedLogId(log.id)}
                    className="w-full text-left px-3 py-2 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Badge variant="outline" className={`text-[9px] shrink-0 ${OUTCOME_STYLES[log.outcome] ?? OUTCOME_STYLES.skipped}`}>
                          {log.outcome.replace('_', ' ')}
                        </Badge>
                        <span className="text-xs text-gray-600 dark:text-gray-300 truncate">
                          {log.conversation?.title ?? log.conversationId.slice(0, 12)}
                        </span>
                        <Badge variant="outline" className="text-[8px] shrink-0">{getTriggerLabel(log.trigger)}</Badge>
                      </div>
                      <div className="flex items-center gap-3 shrink-0 text-[10px] tabular-nums text-gray-400">
                        {log.messagesSent > 0 ? (
                          <span className="text-emerald-500">{log.messagesSent}msg</span>
                        ) : null}
                        {log.reactionsSent > 0 ? (
                          <span className="text-amber-500">{log.reactionsSent}rx</span>
                        ) : null}
                        {log.estimatedCostUsd > 0 ? (
                          <span className="text-emerald-600">${log.estimatedCostUsd.toFixed(4)}</span>
                        ) : null}
                        <span>{formatTimeAgo(log.startedAt)}</span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </ScrollArea>
          )}

          {total > limit ? (
            <div className="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-slate-700 mt-2">
              <span className="text-[10px] text-gray-400 tabular-nums">
                {(page - 1) * limit + 1}-{Math.min(page * limit, total)} / {total}
              </span>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" className="h-6 w-6 p-0" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                  <ChevronLeft className="h-3 w-3" />
                </Button>
                <Button variant="outline" size="sm" className="h-6 w-6 p-0" disabled={!hasMore} onClick={() => setPage(p => p + 1)}>
                  <ChevronRight className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {selectedLogId ? (
        <ScanLogDetail logId={selectedLogId} onClose={() => setSelectedLogId(null)} />
      ) : null}
    </>
  );
});
