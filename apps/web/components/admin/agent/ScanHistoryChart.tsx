'use client';

import React, { memo, useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, TrendingUp, DollarSign, Zap } from 'lucide-react';
import {
  ComposedChart, Area, Line, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { agentAdminService, type ScanStatsBucket } from '@/services/agent-admin.service';

type Props = {
  conversationId?: string;
};

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: ScanStatsBucket }>; label?: string }) {
  if (!active || !payload?.length) return null;
  const data = payload[0]?.payload as ScanStatsBucket | undefined;
  if (!data) return null;

  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg p-3 text-xs space-y-1">
      <p className="font-semibold text-gray-900 dark:text-gray-100">{data.date}</p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
        <span className="text-gray-500">Scans</span>
        <span className="font-mono tabular-nums text-right">{data.scans}</span>
        <span className="text-gray-500">Conversations</span>
        <span className="font-mono tabular-nums text-right">{data.conversations}</span>
        <span className="text-gray-500">Users</span>
        <span className="font-mono tabular-nums text-right">{data.users}</span>
        <span className="text-gray-500">Messages</span>
        <span className="font-mono tabular-nums text-right">{data.messagesSent}</span>
        <span className="text-gray-500">Reactions</span>
        <span className="font-mono tabular-nums text-right">{data.reactionsSent}</span>
        <span className="text-gray-500">Cost</span>
        <span className="font-mono tabular-nums text-right text-emerald-600">${data.costUsd.toFixed(4)}</span>
      </div>
      {data.configChanges > 0 ? (
        <p className="text-amber-500 text-[10px] mt-1">Config changed</p>
      ) : null}
    </div>
  );
}

export default memo(function ScanHistoryChart({ conversationId }: Props) {
  const [data, setData] = useState<ScanStatsBucket[]>([]);
  const [loading, setLoading] = useState(true);
  const [months, setMonths] = useState(6);
  const [bucket, setBucket] = useState<'day' | 'week'>('day');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await agentAdminService.getScanStats({ conversationId, months, bucket });
      if (res.success && res.data) setData(res.data.buckets);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [conversationId, months, bucket]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const totals = useMemo(() => {
    let scans = 0, msgs = 0, cost = 0;
    for (const b of data) {
      scans += b.scans;
      msgs += b.messagesSent;
      cost += b.costUsd;
    }
    return { scans, msgs, cost };
  }, [data]);

  const configChangeDates = useMemo(
    () => data.filter(b => b.configChanges > 0).map(b => b.date),
    [data],
  );

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-80">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-indigo-500" />
            Historique des scans
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px] tabular-nums">
              <Zap className="h-3 w-3 mr-1 text-indigo-500" />
              {totals.scans} scans
            </Badge>
            <Badge variant="outline" className="text-[10px] tabular-nums">
              <DollarSign className="h-3 w-3 mr-1 text-emerald-500" />
              ${totals.cost.toFixed(2)}
            </Badge>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-2">
          {([1, 3, 6] as const).map(m => (
            <Button
              key={m}
              variant={months === m ? 'default' : 'outline'}
              size="sm"
              className="h-6 text-[10px] px-2"
              onClick={() => setMonths(m)}
            >
              {m}m
            </Button>
          ))}
          <div className="w-px h-4 bg-slate-200 dark:bg-slate-700 mx-1" />
          {(['day', 'week'] as const).map(b => (
            <Button
              key={b}
              variant={bucket === b ? 'default' : 'outline'}
              size="sm"
              className="h-6 text-[10px] px-2"
              onClick={() => setBucket(b)}
            >
              {b === 'day' ? 'Jour' : 'Semaine'}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {data.length === 0 ? (
          <div className="flex items-center justify-center h-60 text-sm text-gray-400">
            Aucune donnee sur cette periode
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <ComposedChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-slate-200, #e2e8f0)" opacity={0.5} />
              <XAxis
                dataKey="date"
                tickFormatter={formatDate}
                tick={{ fontSize: 10 }}
                interval="preserveStartEnd"
              />
              <YAxis yAxisId="left" tick={{ fontSize: 10 }} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} tickFormatter={(v: number) => `$${v}`} />
              <Tooltip content={<CustomTooltip />} />

              {configChangeDates.map(date => (
                <ReferenceLine
                  key={date}
                  x={date}
                  yAxisId="left"
                  stroke="#f59e0b"
                  strokeDasharray="4 4"
                  strokeWidth={1}
                  opacity={0.6}
                />
              ))}

              <Area yAxisId="left" type="monotone" dataKey="conversations" name="Conversations" fill="#e0e7ff" stroke="#6366f1" strokeWidth={1.5} fillOpacity={0.4} />
              <Area yAxisId="left" type="monotone" dataKey="users" name="Users" fill="#fef3c7" stroke="#f59e0b" strokeWidth={1.5} fillOpacity={0.3} />

              <Line yAxisId="left" type="monotone" dataKey="scans" name="Scans" stroke="#4338ca" strokeWidth={2} dot={false} />

              <Bar yAxisId="right" dataKey="costUsd" name="Cost (USD)" fill="#34d399" opacity={0.5} radius={[2, 2, 0, 0]} />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
});
