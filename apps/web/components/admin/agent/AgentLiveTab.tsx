'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Activity,
  Users,
  Brain,
  MessageSquare,
  Clock,
  Loader2,
  Search,
  Lock,
  RefreshCw,
  ChevronRight,
  Zap,
  Eye,
} from 'lucide-react';
import {
  agentAdminService,
  type LiveStateData,
  type ToneProfileEntry,
  type RecentConversationActivity,
} from '@/services/agent-admin.service';
import dynamic from 'next/dynamic';

const AgentScheduleTimeline = dynamic(() => import('./AgentScheduleTimeline'), {
  loading: () => <div className="h-24 animate-pulse bg-slate-200 dark:bg-slate-700 rounded" />,
});
import { UserDisplay } from './UserDisplay';
import { useDebounce } from 'use-debounce';

function formatTimeAgo(dateStr: string | null | undefined): string {
  if (!dateStr) return 'Jamais';
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'maintenant';
  if (minutes < 60) return `${minutes}min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}j`;
}

function confidenceColor(value: number) {
  if (value > 0.8) return 'text-green-600 dark:text-green-400';
  if (value > 0.5) return 'text-yellow-600 dark:text-yellow-400';
  return 'text-gray-500 dark:text-gray-400';
}

const TYPE_LABELS: Record<string, string> = {
  direct: 'Direct',
  group: 'Groupe',
  public: 'Public',
  global: 'Globale',
  broadcast: 'Communication',
  channel: 'Canal',
};

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-40" />
            </CardHeader>
            <CardContent className="space-y-3">
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ── Recent Conversations Sidebar ───────────────────────────────────────────

function RecentConversationsList({
  selected,
  onSelect,
}: {
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const [items, setItems] = useState<RecentConversationActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch] = useDebounce(search, 500);

  const fetchRecent = useCallback(async () => {
    setLoading(true);
    try {
      const res = await agentAdminService.getRecentActivity(30, debouncedSearch || undefined);
      if (res.success && res.data) {
        setItems(Array.isArray(res.data) ? res.data : []);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch]);

  useEffect(() => { fetchRecent(); }, [fetchRecent]);

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 pt-3 pb-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <Input
            placeholder="Filtrer..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8 h-8 text-xs"
          />
        </div>
      </div>
      <ScrollArea className="flex-1">
        <div className="px-2 pb-2 space-y-0.5">
          {loading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-lg" />
            ))
          ) : items.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-6 italic">Aucune activité récente</p>
          ) : (
            items.map((item) => {
              const isSelected = selected === item.conversationId;
              return (
                <button
                  key={item.conversationId}
                  onClick={() => onSelect(item.conversationId)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg transition-all ${
                    isSelected
                      ? 'bg-indigo-50 dark:bg-indigo-950 border border-indigo-200 dark:border-indigo-800'
                      : 'hover:bg-gray-50 dark:hover:bg-gray-800/50 border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <div className="flex items-center gap-1 flex-1 min-w-0">
                      {item.enabled && (
                        <div className="h-1.5 w-1.5 rounded-full bg-green-500 shrink-0" />
                      )}
                      <span className="text-xs font-medium truncate text-gray-900 dark:text-gray-100">
                        {item.conversation?.title ?? item.conversationId.slice(0, 10) + '...'}
                      </span>
                    </div>
                    {item.conversation?.type && (
                      <Badge variant="outline" className="text-[9px] px-1 py-0 shrink-0">
                        {TYPE_LABELS[item.conversation.type] ?? item.conversation.type}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-[10px] text-gray-400">
                    <span className="tabular-nums">{item.messagesSent} msgs</span>
                    <span className="tabular-nums">{item.controlledUsersCount} users</span>
                    <span className="tabular-nums ml-auto">{formatTimeAgo(item.lastResponseAt)}</span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

// ── Live State Detail Cards ───────────────────────────────────────────────

function ActivityCard({ data }: { data: LiveStateData }) {
  const score = data.analytics?.avgConfidence ?? 0;
  const hasCooldown = (data.controlledUsers ?? []).some(u => u.locked);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-gray-500 dark:text-gray-400">
          Utilisateurs contrôlés
        </CardTitle>
        <div className="flex items-center gap-2">
          {hasCooldown && (
            <Badge variant="outline" className="border-orange-300 text-orange-600 dark:text-orange-400 text-[10px]">
              <Clock className="h-3 w-3 mr-0.5" />
              Cooldown
            </Badge>
          )}
          <div className="p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950">
            <Users className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {(data.controlledUsers ?? []).length === 0 ? (
          <p className="text-xs text-gray-400 dark:text-gray-500 italic">Aucun utilisateur contrôlé</p>
        ) : (
          <div className="space-y-2">
            {(data.controlledUsers ?? []).map(user => (
              <div key={user.userId} className="flex items-center justify-between p-2 rounded-md bg-gray-50/50 dark:bg-gray-800/30 hover:bg-gray-100/50 dark:hover:bg-gray-800/50 transition-colors">
                <div className="flex items-center gap-2 overflow-hidden flex-1">
                  <UserDisplay userId={user.userId} size="sm" showUsername className="flex-1" />
                  {user.locked && <Lock className="h-3 w-3 text-orange-500 shrink-0" />}
                </div>
                <div className="flex items-center gap-2 pl-2 shrink-0">
                  <Badge variant="outline" className="text-[9px] px-1">{user.systemLanguage}</Badge>
                  <Progress value={user.confidence * 100} className="w-14 h-1.5" />
                  <span className={`text-xs font-bold ${confidenceColor(user.confidence)} tabular-nums w-8 text-right`}>
                    {(user.confidence * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ToneProfilesCard({ profiles }: { profiles: Record<string, ToneProfileEntry> }) {
  const entries = Object.values(profiles);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-gray-500 dark:text-gray-400">
          Profils de ton ({entries.length})
        </CardTitle>
        <div className="p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950">
          <Activity className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
        </div>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <p className="text-xs text-gray-400 dark:text-gray-500 italic">Aucun profil de ton</p>
        ) : (
          <div className="space-y-2">
            {entries.map(profile => (
              <div key={profile.userId} className="flex items-center gap-3 p-2 rounded-md bg-gray-50/50 dark:bg-gray-800/30">
                <UserDisplay userId={profile.userId} size="sm" showUsername={false} className="shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <Badge variant="outline" className="text-[10px]">{profile.tone}</Badge>
                    <span className="text-[10px] text-gray-400">{profile.vocabularyLevel}</span>
                    {profile.locked && (
                      <Lock className="h-2.5 w-2.5 text-orange-500" />
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Progress value={profile.confidence * 100} className="flex-1 h-1" />
                    <span className={`text-[10px] font-mono ${confidenceColor(profile.confidence)} tabular-nums`}>
                      {(profile.confidence * 100).toFixed(0)}%
                    </span>
                    <span className="text-[10px] text-gray-400 tabular-nums">{profile.messagesAnalyzed} msgs</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SummaryCard({ data }: { data: LiveStateData }) {
  const record = data.summaryRecord;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-gray-500 dark:text-gray-400">
          Résumé contextuel
        </CardTitle>
        <div className="p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950">
          <Brain className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {record ? (
          <>
            <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
              {record.summary}
            </p>

            {(record.currentTopics ?? []).length > 0 && (
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Sujets</p>
                <div className="flex flex-wrap gap-1">
                  {(record.currentTopics ?? []).map(topic => (
                    <Badge key={topic} variant="secondary" className="text-[10px]">
                      {topic}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5">
                <span className="text-gray-400">Ton :</span>
                <Badge variant="outline" className="border-indigo-300 text-indigo-600 dark:text-indigo-400 text-[10px]">
                  {record.overallTone}
                </Badge>
              </div>
              <span className="text-gray-400 tabular-nums">{record.messageCount} msgs analysés</span>
            </div>
          </>
        ) : data.summary ? (
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            {data.summary}
          </p>
        ) : (
          <p className="text-xs text-gray-400 dark:text-gray-500 italic">Aucun résumé disponible</p>
        )}
      </CardContent>
    </Card>
  );
}

function MetricsCard({ data }: { data: LiveStateData }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-gray-500 dark:text-gray-400">
          Métriques
        </CardTitle>
        <div className="p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950">
          <MessageSquare className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-gray-400">
            <span>{data.cachedMessageCount} messages en cache</span>
            {data.analytics?.lastResponseAt && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {new Date(data.analytics.lastResponseAt).toLocaleString('fr-FR', {
                  day: '2-digit',
                  month: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            )}
          </div>

          {data.analytics ? (
            <div className="grid grid-cols-3 gap-2">
              <div className="text-center p-2.5 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                <p className="text-xl font-bold text-gray-900 dark:text-gray-100 tabular-nums">{data.analytics.messagesSent}</p>
                <p className="text-[10px] text-gray-500 uppercase tracking-wider">Messages</p>
              </div>
              <div className="text-center p-2.5 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                <p className="text-xl font-bold text-gray-900 dark:text-gray-100 tabular-nums">{data.analytics.totalWordsSent}</p>
                <p className="text-[10px] text-gray-500 uppercase tracking-wider">Mots</p>
              </div>
              <div className="text-center p-2.5 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                <p className="text-xl font-bold text-gray-900 dark:text-gray-100 tabular-nums">
                  {(data.analytics.avgConfidence * 100).toFixed(0)}%
                </p>
                <p className="text-[10px] text-gray-500 uppercase tracking-wider">Confiance</p>
              </div>
            </div>
          ) : (
            <p className="text-xs text-gray-400 dark:text-gray-500 italic">Aucune analytique disponible</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Main Live Tab ─────────────────────────────────────────────────────────

export function AgentLiveTab() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [liveState, setLiveState] = useState<LiveStateData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchLiveState = useCallback(async (id?: string) => {
    const targetId = id ?? selectedId;
    if (!targetId) return;

    setLoading(true);
    setError(null);

    try {
      const response = await agentAdminService.getLiveState(targetId);
      if (response.success && response.data) {
        setLiveState(response.data);
      } else {
        setError('Impossible de charger l\'état live');
      }
    } catch {
      setError('Erreur de connexion ou conversation introuvable');
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  const handleSelect = useCallback((id: string) => {
    setSelectedId(id);
    setLiveState(null);
    setError(null);
    fetchLiveState(id);
  }, [fetchLiveState]);

  // Auto-refresh
  useEffect(() => {
    if (autoRefresh && selectedId) {
      intervalRef.current = setInterval(() => {
        fetchLiveState();
      }, 15000);
      return () => {
        if (intervalRef.current) clearInterval(intervalRef.current);
      };
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, [autoRefresh, selectedId, fetchLiveState]);

  return (
    <div className="flex gap-4 min-h-[600px]">
      {/* Left panel - Recent conversations list */}
      <Card className="w-80 shrink-0 hidden lg:flex flex-col overflow-hidden">
        <CardHeader className="pb-2 shrink-0">
          <CardTitle className="text-xs font-bold uppercase tracking-wider text-gray-500 flex items-center gap-1.5">
            <Zap className="h-3.5 w-3.5 text-indigo-500" />
            Conversations actives
          </CardTitle>
        </CardHeader>
        <div className="flex-1 overflow-hidden">
          <RecentConversationsList selected={selectedId} onSelect={handleSelect} />
        </div>
      </Card>

      {/* Mobile: show list as horizontal scroll */}
      <div className="lg:hidden w-full space-y-4">
        <Card>
          <CardContent className="p-3">
            <RecentConversationsList selected={selectedId} onSelect={handleSelect} />
          </CardContent>
        </Card>
      </div>

      {/* Right panel - Live state detail */}
      <div className="flex-1 min-w-0 space-y-4">
        {!selectedId ? (
          <Card className="h-full flex items-center justify-center">
            <CardContent className="text-center py-16">
              <Eye className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
              <p className="text-sm text-gray-400">
                Sélectionnez une conversation pour superviser son état en temps réel
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Header with controls */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                  {liveState?.conversationId ? `Live : ${liveState.conversationId.slice(0, 12)}...` : 'Chargement...'}
                </h3>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  variant={autoRefresh ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setAutoRefresh(!autoRefresh)}
                  className="text-xs h-7"
                >
                  <RefreshCw className={`h-3 w-3 mr-1 ${autoRefresh ? 'animate-spin' : ''}`} />
                  {autoRefresh ? 'Auto 15s' : 'Auto'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fetchLiveState()}
                  disabled={loading}
                  className="text-xs h-7"
                >
                  {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                </Button>
              </div>
            </div>

            {loading && !liveState && <LoadingSkeleton />}

            {error && (
              <Card>
                <CardContent className="p-4">
                  <p className="text-sm text-red-500">{error}</p>
                </CardContent>
              </Card>
            )}

            {liveState && (
              <div className="space-y-4">
                {/* Schedule Timeline — full width */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Clock className="h-4 w-4 text-indigo-500" />
                      Schedule
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <AgentScheduleTimeline conversationId={selectedId!} compact />
                  </CardContent>
                </Card>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <ActivityCard data={liveState} />
                  <ToneProfilesCard profiles={liveState.toneProfiles} />
                  <SummaryCard data={liveState} />
                  <MetricsCard data={liveState} />
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default AgentLiveTab;
