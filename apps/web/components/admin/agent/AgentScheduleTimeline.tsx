'use client';

import React, { memo, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Zap,
  Loader2,
  Clock,
  PauseCircle,
  AlertTriangle,
} from 'lucide-react';
import {
  agentAdminService,
  type AgentScheduleData,
} from '@/services/agent-admin.service';
import { toast } from 'sonner';

type AgentScheduleTimelineProps = {
  conversationId: string;
  compact?: boolean;
};

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function formatDuration(ms: number): string {
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return `${mins}min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
}

function budgetColor(ratio: number): string {
  if (ratio > 0.6) return 'bg-emerald-500';
  if (ratio > 0.3) return 'bg-amber-400';
  return 'bg-red-500';
}

function budgetGlow(ratio: number): string {
  if (ratio > 0.6) return 'shadow-emerald-500/30';
  if (ratio > 0.3) return 'shadow-amber-400/30';
  return 'shadow-red-500/30';
}

export default memo(function AgentScheduleTimeline({ conversationId, compact = false }: AgentScheduleTimelineProps) {
  const [schedule, setSchedule] = useState<AgentScheduleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [now, setNow] = useState(Date.now());
  const containerRef = useRef<HTMLDivElement>(null);

  const fetchSchedule = useCallback(async () => {
    try {
      const res = await agentAdminService.getSchedule(conversationId);
      if (res.success && res.data) setSchedule(res.data);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    fetchSchedule();
    const interval = setInterval(fetchSchedule, 30_000);
    return () => clearInterval(interval);
  }, [fetchSchedule]);

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(tick);
  }, []);

  const handleTrigger = useCallback(async () => {
    setTriggering(true);
    try {
      const res = await agentAdminService.triggerScan(conversationId);
      if (res.success) {
        toast.success('Scan déclenché');
        setTimeout(fetchSchedule, 2000);
      } else {
        toast.error('Erreur lors du déclenchement');
      }
    } catch {
      toast.error('Erreur réseau');
    } finally {
      setTriggering(false);
    }
  }, [conversationId, fetchSchedule]);

  const timelineData = useMemo(() => {
    if (!schedule) return null;
    const horizon = now + 24 * 60 * 60 * 1000;
    const totalMs = horizon - now;
    const scans = schedule.upcomingScans.filter(ts => ts >= now && ts <= horizon);
    const nextScanTs = scans[0] ?? null;
    const timeUntilNext = nextScanTs ? nextScanTs - now : null;

    const hourMarkers: number[] = [];
    const startHour = new Date(now);
    startHour.setMinutes(0, 0, 0);
    let marker = startHour.getTime() + 3600_000;
    while (marker <= horizon) {
      if (marker > now) hourMarkers.push(marker);
      marker += 3600_000;
    }

    return { horizon, totalMs, scans, nextScanTs, timeUntilNext, hourMarkers };
  }, [schedule, now]);

  if (loading) {
    return (
      <div className="space-y-3 animate-pulse">
        <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-1/3" />
        <div className="h-12 bg-slate-200 dark:bg-slate-700 rounded" />
        <div className="h-6 bg-slate-200 dark:bg-slate-700 rounded w-2/3" />
      </div>
    );
  }

  if (!schedule || !timelineData) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-400 py-4">
        <AlertTriangle className="h-4 w-4" />
        <span>Schedule non disponible</span>
      </div>
    );
  }

  const { horizon, totalMs, scans, nextScanTs, timeUntilNext, hourMarkers } = timelineData;
  const budgetRatio = schedule.budget.messagesMax > 0
    ? schedule.budget.remaining / schedule.budget.messagesMax
    : 0;

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-indigo-400" />
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Prochain scan
            </span>
          </div>
          {timeUntilNext !== null ? (
            <Badge variant="outline" className="font-mono text-xs tabular-nums border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400 bg-indigo-50/50 dark:bg-indigo-950/30">
              {formatDuration(timeUntilNext)}
            </Badge>
          ) : (
            <Badge variant="outline" className="text-xs text-gray-400">--</Badge>
          )}
          <span className="text-[10px] text-gray-400 tabular-nums">
            toutes les {schedule.scanIntervalMinutes}min
          </span>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={handleTrigger}
          disabled={triggering}
          className="h-7 text-xs gap-1.5 border-indigo-200 dark:border-indigo-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 hover:border-indigo-300 dark:hover:border-indigo-700 transition-all"
        >
          {triggering ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Zap className="h-3 w-3 text-indigo-500" />
          )}
          Trigger
        </Button>
      </div>

      {/* Timeline bar */}
      <div ref={containerRef} className="relative">
        {/* Track background */}
        <div className="relative h-10 rounded-lg bg-slate-100 dark:bg-slate-800/80 overflow-hidden border border-slate-200 dark:border-slate-700/60">
          {/* Burst cooldown zone */}
          {schedule.burst.cooldownActive && schedule.burst.cooldownEndsAt > now ? (
            <div
              className="absolute top-0 bottom-0 bg-red-500/8 dark:bg-red-500/10 border-r border-red-300/30 dark:border-red-500/20"
              style={{
                left: '0%',
                width: `${Math.min(100, ((schedule.burst.cooldownEndsAt - now) / totalMs) * 100)}%`,
              }}
            >
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="flex items-center gap-1 text-[9px] text-red-400/70 font-medium uppercase tracking-wider">
                  <PauseCircle className="h-2.5 w-2.5" />
                  cooldown
                </div>
              </div>
            </div>
          ) : null}

          {/* Hour markers */}
          {hourMarkers.map(ts => {
            const pct = ((ts - now) / totalMs) * 100;
            if (pct < 2 || pct > 98) return null;
            return (
              <div key={ts} className="absolute top-0 bottom-0" style={{ left: `${pct}%` }}>
                <div className="h-full w-px bg-slate-300/40 dark:bg-slate-600/40" />
                <span className="absolute -top-0.5 -translate-x-1/2 text-[8px] text-gray-400/60 tabular-nums font-mono select-none">
                  {new Date(ts).getHours()}h
                </span>
              </div>
            );
          })}

          {/* Scan dots */}
          {scans.map((ts, i) => {
            const pct = ((ts - now) / totalMs) * 100;
            const isNext = i === 0;
            return (
              <div
                key={ts}
                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 group"
                style={{ left: `${pct}%` }}
              >
                {isNext ? (
                  <span className="absolute inset-0 -m-1.5 rounded-full bg-indigo-400/30 animate-ping" />
                ) : null}
                <span
                  className={`relative block rounded-full transition-all ${
                    isNext
                      ? 'h-3 w-3 bg-indigo-500 shadow-lg shadow-indigo-500/40 ring-2 ring-indigo-300/30'
                      : 'h-1.5 w-1.5 bg-indigo-400/50 hover:bg-indigo-400 hover:scale-150'
                  }`}
                />
                {/* Tooltip on hover */}
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                  <div className="bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-[10px] px-2 py-1 rounded shadow-lg whitespace-nowrap font-mono tabular-nums">
                    {formatTime(ts)}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Now indicator */}
          <div className="absolute top-0 bottom-0 left-0 w-px bg-indigo-500/60">
            <div className="absolute -top-1 -left-[3px] w-[7px] h-[7px] bg-indigo-500 rounded-full shadow-sm shadow-indigo-500/50" />
          </div>
        </div>

        {/* Time labels */}
        <div className="flex justify-between mt-1">
          <span className="text-[9px] text-gray-400 font-mono tabular-nums">now</span>
          <span className="text-[9px] text-gray-400 font-mono tabular-nums">+24h</span>
        </div>
      </div>

      {/* Budget + Burst row */}
      <div className={`grid gap-3 ${compact ? 'grid-cols-1' : 'grid-cols-2'}`}>
        {/* Budget meter */}
        <div className="flex items-center gap-3">
          <div className="flex-1 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wider font-medium">
                Budget
              </span>
              <span className="text-xs font-mono tabular-nums text-gray-600 dark:text-gray-300">
                {schedule.budget.messagesUsed}/{schedule.budget.messagesMax}
              </span>
            </div>
            <div className={`h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden shadow-inner`}>
              <div
                className={`h-full rounded-full transition-all duration-500 ${budgetColor(budgetRatio)} shadow-sm ${budgetGlow(budgetRatio)}`}
                style={{ width: `${Math.max(2, (1 - budgetRatio) * 100)}%` }}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[9px] text-gray-400">
                {schedule.budget.remaining} restants
              </span>
              {schedule.budget.isWeekend ? (
                <Badge variant="outline" className="text-[8px] h-3.5 px-1 border-amber-200 text-amber-500">WE</Badge>
              ) : null}
            </div>
          </div>
        </div>

        {/* Burst status */}
        <div className="flex items-center gap-3">
          <div className="flex-1 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wider font-medium">
                Burst
              </span>
              {schedule.burst.enabled ? (
                schedule.burst.cooldownActive ? (
                  <Badge variant="outline" className="text-[9px] h-4 px-1.5 border-red-200 dark:border-red-800 text-red-500">
                    <PauseCircle className="h-2.5 w-2.5 mr-0.5" />
                    {formatDuration(schedule.burst.cooldownEndsAt - now)}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[9px] h-4 px-1.5 border-emerald-200 dark:border-emerald-800 text-emerald-500">
                    Prêt
                  </Badge>
                )
              ) : (
                <Badge variant="outline" className="text-[9px] h-4 px-1.5 text-gray-400">Off</Badge>
              )}
            </div>
            {schedule.burst.enabled ? (
              <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden shadow-inner">
                {schedule.burst.cooldownActive ? (
                  <div
                    className="h-full rounded-full bg-red-400/60 transition-all duration-500"
                    style={{
                      width: `${Math.max(2, ((schedule.burst.cooldownEndsAt - now) / (schedule.burst.quietIntervalMinutes * 60_000)) * 100)}%`,
                    }}
                  />
                ) : (
                  <div className="h-full w-full rounded-full bg-emerald-400/40" />
                )}
              </div>
            ) : null}
            <span className="text-[9px] text-gray-400">
              Quiet : {schedule.burst.quietIntervalMinutes}min
            </span>
          </div>
        </div>
      </div>

      {/* Last scan info */}
      {schedule.lastScan > 0 ? (
        <div className="text-[10px] text-gray-400 flex items-center gap-1.5">
          <span className="inline-block h-1 w-1 rounded-full bg-gray-400/50" />
          Dernier scan : {formatTime(schedule.lastScan)} ({formatDuration(now - schedule.lastScan)} ago)
        </div>
      ) : null}
    </div>
  );
});
