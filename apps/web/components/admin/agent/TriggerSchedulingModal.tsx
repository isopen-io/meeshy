'use client';

import React, { memo, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Zap, Loader2, Clock, PauseCircle, AlertTriangle, Timer, CalendarClock, RotateCcw, X, History, BarChart3,
} from 'lucide-react';
import {
  agentAdminService,
  type AgentScheduleData,
} from '@/services/agent-admin.service';
import { toast } from 'sonner';
import dynamic from 'next/dynamic';

const ScanHistoryChart = dynamic(() => import('./ScanHistoryChart'), {
  loading: () => <div className="h-80 animate-pulse bg-slate-200 dark:bg-slate-700 rounded" />,
});
const ScanLogTable = dynamic(() => import('./ScanLogTable'), {
  loading: () => <div className="h-64 animate-pulse bg-slate-200 dark:bg-slate-700 rounded" />,
});

type TriggerSchedulingModalProps = {
  conversationId: string;
  conversationTitle: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function formatDuration(ms: number): string {
  if (ms <= 0) return '0min';
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

export default memo(function TriggerSchedulingModal({
  conversationId, conversationTitle, open, onOpenChange,
}: TriggerSchedulingModalProps) {
  const [schedule, setSchedule] = useState<AgentScheduleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [horizon, setHorizon] = useState<6 | 12 | 24>(24);

  // Schedule at fixed time
  const [scheduleTime, setScheduleTime] = useState('');
  const [scheduledTimer, setScheduledTimer] = useState<{ target: number; label: string } | null>(null);
  const scheduledTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Schedule in X time
  const [delayValue, setDelayValue] = useState(5);
  const [delayUnit, setDelayUnit] = useState<'min' | 'h'>('min');

  // Change frequency
  const [freqHours, setFreqHours] = useState(0);
  const [freqMinutes, setFreqMinutes] = useState(3);
  const [savingFreq, setSavingFreq] = useState(false);

  // Drag state
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [dragPct, setDragPct] = useState<number | null>(null);

  const fetchSchedule = useCallback(async () => {
    try {
      const res = await agentAdminService.getSchedule(conversationId);
      if (res.success && res.data) {
        setSchedule(res.data);
        setFreqHours(Math.floor(res.data.scanIntervalMinutes / 60));
        setFreqMinutes(res.data.scanIntervalMinutes % 60);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    if (open) {
      fetchSchedule();
      const interval = setInterval(fetchSchedule, 30_000);
      return () => clearInterval(interval);
    }
  }, [open, fetchSchedule]);

  useEffect(() => {
    if (!open) return;
    const tick = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(tick);
  }, [open]);

  // Cleanup scheduled timer on unmount
  useEffect(() => {
    return () => {
      if (scheduledTimerRef.current) clearTimeout(scheduledTimerRef.current);
    };
  }, []);

  const handleTriggerNow = useCallback(async () => {
    setTriggering(true);
    try {
      const res = await agentAdminService.triggerScan(conversationId);
      if (res.success) {
        toast.success('Scan declenche');
        setTimeout(fetchSchedule, 2000);
      } else {
        toast.error('Erreur lors du declenchement');
      }
    } catch {
      toast.error('Erreur reseau');
    } finally {
      setTriggering(false);
    }
  }, [conversationId, fetchSchedule]);

  const handleScheduleAtTime = useCallback(() => {
    if (!scheduleTime) return;
    const [hours, minutes] = scheduleTime.split(':').map(Number);
    const target = new Date();
    target.setHours(hours, minutes, 0, 0);
    if (target.getTime() <= Date.now()) target.setDate(target.getDate() + 1);

    const delayMs = target.getTime() - Date.now();
    if (scheduledTimerRef.current) clearTimeout(scheduledTimerRef.current);

    scheduledTimerRef.current = setTimeout(async () => {
      setScheduledTimer(null);
      await handleTriggerNow();
    }, delayMs);

    setScheduledTimer({ target: target.getTime(), label: formatTime(target.getTime()) });
    toast.success(`Trigger programme a ${formatTime(target.getTime())}`);
  }, [scheduleTime, handleTriggerNow]);

  const handleScheduleDelay = useCallback(() => {
    const ms = delayUnit === 'h' ? delayValue * 3600_000 : delayValue * 60_000;
    const target = Date.now() + ms;

    if (scheduledTimerRef.current) clearTimeout(scheduledTimerRef.current);
    scheduledTimerRef.current = setTimeout(async () => {
      setScheduledTimer(null);
      await handleTriggerNow();
    }, ms);

    setScheduledTimer({ target, label: formatTime(target) });
    toast.success(`Trigger programme dans ${delayValue}${delayUnit}`);
  }, [delayValue, delayUnit, handleTriggerNow]);

  const handleCancelSchedule = useCallback(() => {
    if (scheduledTimerRef.current) {
      clearTimeout(scheduledTimerRef.current);
      scheduledTimerRef.current = null;
    }
    setScheduledTimer(null);
    toast.info('Trigger programme annule');
  }, []);

  const handleSaveFrequency = useCallback(async () => {
    const totalMinutes = Math.max(1, freqHours * 60 + freqMinutes);
    setSavingFreq(true);
    try {
      const res = await agentAdminService.upsertConfig(conversationId, { scanIntervalMinutes: totalMinutes });
      if (res.success) {
        toast.success(`Frequence mise a jour : ${totalMinutes}min`);
        fetchSchedule();
      } else {
        toast.error('Erreur');
      }
    } catch {
      toast.error('Erreur reseau');
    } finally {
      setSavingFreq(false);
    }
  }, [conversationId, freqHours, freqMinutes, fetchSchedule]);

  // Timeline data
  const timelineData = useMemo(() => {
    if (!schedule) return null;
    const horizonMs = horizon * 60 * 60 * 1000;
    const end = now + horizonMs;
    const scans = schedule.upcomingScans.filter(ts => ts >= now && ts <= end);
    const nextScanTs = scans[0] ?? null;
    const timeUntilNext = nextScanTs ? nextScanTs - now : null;

    const hourMarkers: number[] = [];
    const startHour = new Date(now);
    startHour.setMinutes(0, 0, 0);
    let marker = startHour.getTime() + 3600_000;
    while (marker <= end) {
      if (marker > now) hourMarkers.push(marker);
      marker += 3600_000;
    }

    return { horizonMs, end, scans, nextScanTs, timeUntilNext, hourMarkers };
  }, [schedule, now, horizon]);

  // Drag handlers for next scan dot
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(true);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const pct = Math.max(0.5, Math.min(99, ((e.clientX - rect.left) / rect.width) * 100));
    setDragPct(pct);
  }, [dragging]);

  const handlePointerUp = useCallback(async () => {
    if (!dragging || dragPct === null || !timelineData) {
      setDragging(false);
      setDragPct(null);
      return;
    }
    setDragging(false);

    const newTs = now + (dragPct / 100) * timelineData.horizonMs;
    const newIntervalMinutes = Math.max(1, Math.round((newTs - now) / 60_000));

    setDragPct(null);
    try {
      await agentAdminService.upsertConfig(conversationId, { scanIntervalMinutes: newIntervalMinutes });
      toast.success(`Intervalle ajuste : ${newIntervalMinutes}min`);
      fetchSchedule();
    } catch {
      toast.error('Erreur');
    }
  }, [dragging, dragPct, timelineData, now, conversationId, fetchSchedule]);

  const budgetRatio = schedule && schedule.budget.messagesMax > 0
    ? schedule.budget.remaining / schedule.budget.messagesMax
    : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-[95vw] sm:max-w-2xl md:max-w-4xl lg:max-w-7xl max-h-[90vh] flex flex-col overflow-hidden p-3 sm:p-6">
        <DialogHeader>
          <DialogTitle className="text-xs sm:text-sm flex items-center gap-2 min-w-0">
            <CalendarClock className="h-4 w-4 text-indigo-500 shrink-0" />
            <span className="truncate">Planificateur — {conversationTitle}</span>
          </DialogTitle>
        </DialogHeader>

        {/* Scheduled timer banner */}
        {scheduledTimer && (
          <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
            <div className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-400">
              <Timer className="h-4 w-4 animate-pulse" />
              <span>Trigger programme a <strong>{scheduledTimer.label}</strong></span>
              <span className="text-xs text-amber-500">({formatDuration(scheduledTimer.target - now)})</span>
            </div>
            <Button variant="ghost" size="sm" onClick={handleCancelSchedule} className="h-6 w-6 p-0 text-amber-600 hover:text-amber-800">
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          </div>
        ) : (
          <Tabs defaultValue="timeline" className="flex-1 min-h-0 flex flex-col">
            <TabsList className="shrink-0">
              <TabsTrigger value="timeline" className="gap-1.5 text-xs">
                <BarChart3 className="h-3 w-3" /> Timeline
              </TabsTrigger>
              <TabsTrigger value="history" className="gap-1.5 text-xs">
                <History className="h-3 w-3" /> Historique
              </TabsTrigger>
            </TabsList>

            <TabsContent value="timeline" className="flex-1 min-h-0 overflow-y-auto">
              <ScrollArea className="h-full">
                <div className="space-y-6 p-1">
                  {/* Trigger controls */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
                    {/* Immediate trigger */}
                    <div className="col-span-2 sm:col-span-1 p-2.5 sm:p-3 rounded-lg bg-slate-50/50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800 space-y-2">
                      <div className="flex items-center gap-1.5">
                        <Zap className="h-3 w-3 text-indigo-500" />
                        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Immediat</span>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleTriggerNow}
                        disabled={triggering}
                        className="w-full h-8 text-xs gap-1.5 border-indigo-200 dark:border-indigo-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/50"
                      >
                        {triggering ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
                        Declencher maintenant
                      </Button>
                    </div>

                    {/* Schedule at time */}
                    <div className="p-2.5 sm:p-3 rounded-lg bg-slate-50/50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800 space-y-2">
                      <div className="flex items-center gap-1.5">
                        <Clock className="h-3 w-3 text-indigo-500" />
                        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Heure fixe</span>
                      </div>
                      <div className="flex gap-1.5">
                        <Input
                          type="time"
                          value={scheduleTime}
                          onChange={e => setScheduleTime(e.target.value)}
                          className="h-8 text-xs flex-1 min-w-0"
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleScheduleAtTime}
                          disabled={!scheduleTime || !!scheduledTimer}
                          className="h-8 text-xs px-2 shrink-0"
                        >
                          OK
                        </Button>
                      </div>
                    </div>

                    {/* Schedule in delay */}
                    <div className="p-2.5 sm:p-3 rounded-lg bg-slate-50/50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800 space-y-2">
                      <div className="flex items-center gap-1.5">
                        <Timer className="h-3 w-3 text-indigo-500" />
                        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Dans X temps</span>
                      </div>
                      <div className="flex gap-1.5">
                        <Input
                          type="number"
                          value={delayValue}
                          onChange={e => setDelayValue(Math.max(1, parseInt(e.target.value) || 1))}
                          min={1}
                          max={delayUnit === 'h' ? 24 : 1440}
                          className="h-8 text-xs w-12 min-w-0"
                        />
                        <select
                          value={delayUnit}
                          onChange={e => setDelayUnit(e.target.value as 'min' | 'h')}
                          className="h-8 text-xs border rounded-md bg-white dark:bg-gray-800 px-1.5"
                        >
                          <option value="min">min</option>
                          <option value="h">h</option>
                        </select>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleScheduleDelay}
                          disabled={!!scheduledTimer}
                          className="h-8 text-xs px-2 shrink-0"
                        >
                          OK
                        </Button>
                      </div>
                    </div>

                    {/* Change frequency */}
                    <div className="p-2.5 sm:p-3 rounded-lg bg-slate-50/50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800 space-y-2">
                      <div className="flex items-center gap-1.5">
                        <RotateCcw className="h-3 w-3 text-indigo-500" />
                        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Frequence</span>
                      </div>
                      <div className="flex gap-1.5 items-center">
                        <div className="flex-1 flex gap-1 items-center min-w-0">
                          <Input
                            type="number"
                            value={freqHours}
                            onChange={e => setFreqHours(Math.max(0, Math.min(24, parseInt(e.target.value) || 0)))}
                            min={0} max={24}
                            className="h-8 text-xs w-12 min-w-0"
                          />
                          <span className="text-[10px] text-gray-400">h</span>
                          <Input
                            type="number"
                            value={freqMinutes}
                            onChange={e => setFreqMinutes(Math.max(0, Math.min(59, parseInt(e.target.value) || 0)))}
                            min={0} max={59}
                            className="h-8 text-xs w-12 min-w-0"
                          />
                          <span className="text-[10px] text-gray-400">m</span>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleSaveFrequency}
                          disabled={savingFreq}
                          className="h-8 text-xs px-2 shrink-0"
                        >
                          {savingFreq ? <Loader2 className="h-3 w-3 animate-spin" /> : 'OK'}
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* Warning for client-side timer */}
                  {scheduledTimer && (
                    <div className="text-[10px] text-amber-500 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3 shrink-0" />
                      Ce timer est perdu si vous fermez la page ou le navigateur.
                    </div>
                  )}

                  {/* Timeline header */}
                  {schedule && timelineData && (
                    <>
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-3">
                        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-wrap">
                          <div className="flex items-center gap-1.5">
                            <Clock className="h-3.5 w-3.5 text-indigo-400" />
                            <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                              Prochain scan
                            </span>
                          </div>
                          {timelineData.timeUntilNext !== null ? (
                            <Badge variant="outline" className="font-mono text-xs tabular-nums border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400 bg-indigo-50/50 dark:bg-indigo-950/30">
                              {formatDuration(timelineData.timeUntilNext)}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs text-gray-400">--</Badge>
                          )}
                          <span className="text-[10px] text-gray-400 tabular-nums">
                            toutes les {schedule.scanIntervalMinutes}min
                          </span>
                        </div>

                        {/* Zoom controls */}
                        <div className="flex items-center gap-1 shrink-0">
                          {([6, 12, 24] as const).map(h => (
                            <Button
                              key={h}
                              variant={horizon === h ? 'default' : 'outline'}
                              size="sm"
                              className="h-6 text-[10px] px-2"
                              onClick={() => setHorizon(h)}
                            >
                              {h}h
                            </Button>
                          ))}
                        </div>
                      </div>

                      {/* Interactive timeline bar */}
                      <div ref={containerRef} className="relative">
                        <div
                          className="relative h-16 sm:h-20 lg:h-24 rounded-lg bg-slate-100 dark:bg-slate-800/80 overflow-hidden border border-slate-200 dark:border-slate-700/60 select-none"
                          onPointerMove={handlePointerMove}
                          onPointerUp={handlePointerUp}
                        >
                          {/* Burst cooldown zone */}
                          {schedule.burst.cooldownActive && schedule.burst.cooldownEndsAt > now ? (
                            <div
                              className="absolute top-0 bottom-0 bg-red-500/8 dark:bg-red-500/10 border-r border-red-300/30 dark:border-red-500/20"
                              style={{
                                left: '0%',
                                width: `${Math.min(100, ((schedule.burst.cooldownEndsAt - now) / timelineData.horizonMs) * 100)}%`,
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
                          {timelineData.hourMarkers.map(ts => {
                            const pct = ((ts - now) / timelineData.horizonMs) * 100;
                            if (pct < 2 || pct > 98) return null;
                            return (
                              <div key={ts} className="absolute top-0 bottom-0" style={{ left: `${pct}%` }}>
                                <div className="h-full w-px bg-slate-300/40 dark:bg-slate-600/40" />
                                <span className="absolute top-1 -translate-x-1/2 text-[9px] text-gray-400/60 tabular-nums font-mono select-none">
                                  {new Date(ts).getHours()}h
                                </span>
                              </div>
                            );
                          })}

                          {/* Scan dots */}
                          {timelineData.scans.map((ts, i) => {
                            const isNext = i === 0;
                            const pct = isNext && dragPct !== null ? dragPct : ((ts - now) / timelineData.horizonMs) * 100;
                            return (
                              <div
                                key={ts}
                                className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 group ${isNext ? 'cursor-grab active:cursor-grabbing z-10' : ''}`}
                                style={{ left: `${pct}%` }}
                                onPointerDown={isNext ? handlePointerDown : undefined}
                              >
                                {isNext ? (
                                  <span className="absolute inset-0 -m-2 rounded-full bg-indigo-400/20 animate-ping" />
                                ) : null}
                                <span
                                  className={`relative block rounded-full transition-all ${
                                    isNext
                                      ? 'h-4 w-4 bg-indigo-500 shadow-lg shadow-indigo-500/40 ring-2 ring-indigo-300/30'
                                      : 'h-2 w-2 bg-indigo-400/50 hover:bg-indigo-400 hover:scale-150'
                                  }`}
                                />
                                {/* Tooltip */}
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20">
                                  <div className="bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-[10px] px-2 py-1 rounded shadow-lg whitespace-nowrap font-mono tabular-nums">
                                    {isNext && dragPct !== null
                                      ? formatTime(now + (dragPct / 100) * timelineData.horizonMs)
                                      : formatTime(ts)}
                                    {isNext && <span className="block text-[8px] text-center text-indigo-300 dark:text-indigo-600">glisser pour deplacer</span>}
                                  </div>
                                </div>
                              </div>
                            );
                          })}

                          {/* Scheduled trigger marker */}
                          {scheduledTimer && scheduledTimer.target > now && scheduledTimer.target <= now + timelineData.horizonMs && (
                            <div
                              className="absolute top-0 bottom-0 z-10"
                              style={{ left: `${((scheduledTimer.target - now) / timelineData.horizonMs) * 100}%` }}
                            >
                              <div className="h-full w-0.5 bg-amber-500/80" />
                              <div className="absolute top-1 -translate-x-1/2">
                                <div className="bg-amber-500 text-white text-[8px] px-1.5 py-0.5 rounded font-mono shadow">
                                  {scheduledTimer.label}
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Now indicator */}
                          <div className="absolute top-0 bottom-0 left-0 w-px bg-indigo-500/60">
                            <div className="absolute -top-1 -left-[3px] w-[7px] h-[7px] bg-indigo-500 rounded-full shadow-sm shadow-indigo-500/50" />
                          </div>
                        </div>

                        {/* Time labels */}
                        <div className="flex justify-between mt-1">
                          <span className="text-[9px] text-gray-400 font-mono tabular-nums">now</span>
                          <span className="text-[9px] text-gray-400 font-mono tabular-nums">+{horizon}h</span>
                        </div>
                      </div>

                      {/* Budget + Burst row */}
                      <div className="grid gap-2 sm:gap-3 grid-cols-1 sm:grid-cols-2">
                        {/* Budget meter */}
                        <div className="flex items-center gap-3">
                          <div className="flex-1 space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wider font-medium">Budget</span>
                              <span className="text-xs font-mono tabular-nums text-gray-600 dark:text-gray-300">
                                {schedule.budget.messagesUsed}/{schedule.budget.messagesMax}
                              </span>
                            </div>
                            <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden shadow-inner">
                              <div
                                className={`h-full rounded-full transition-all duration-500 ${budgetColor(budgetRatio)} shadow-sm ${budgetGlow(budgetRatio)}`}
                                style={{ width: `${Math.max(2, (1 - budgetRatio) * 100)}%` }}
                              />
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-[9px] text-gray-400">{schedule.budget.remaining} restants</span>
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
                              <span className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wider font-medium">Burst</span>
                              {schedule.burst.enabled ? (
                                schedule.burst.cooldownActive ? (
                                  <Badge variant="outline" className="text-[9px] h-4 px-1.5 border-red-200 dark:border-red-800 text-red-500">
                                    <PauseCircle className="h-2.5 w-2.5 mr-0.5" />
                                    {formatDuration(schedule.burst.cooldownEndsAt - now)}
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="text-[9px] h-4 px-1.5 border-emerald-200 dark:border-emerald-800 text-emerald-500">Pret</Badge>
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
                            <span className="text-[9px] text-gray-400">Quiet : {schedule.burst.quietIntervalMinutes}min</span>
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
                    </>
                  )}

                  {!schedule && (
                    <div className="flex items-center gap-2 text-sm text-gray-400 py-4">
                      <AlertTriangle className="h-4 w-4" />
                      <span>Schedule non disponible</span>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="history" className="flex-1 min-h-0 overflow-y-auto">
              <ScrollArea className="h-full">
                <div className="space-y-6 p-1">
                  <ScanHistoryChart conversationId={conversationId} />
                  <ScanLogTable conversationId={conversationId} />
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
});
