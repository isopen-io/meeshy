'use client';

import React, { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Activity, Users, Brain, MessageSquare, Clock, Loader2, Search, Lock } from 'lucide-react';
import {
  agentAdminService,
  type LiveStateData,
  type ToneProfileEntry,
} from '@/services/agent-admin.service';

function truncateId(id: string) {
  if (id.length <= 8) return id;
  return `${id.slice(0, 4)}...${id.slice(-4)}`;
}

function confidenceColor(value: number) {
  if (value > 0.8) return 'text-green-600 dark:text-green-400';
  if (value > 0.5) return 'text-yellow-600 dark:text-yellow-400';
  return 'text-gray-500 dark:text-gray-400';
}

function activityColor(value: number) {
  if (value > 0.7) return 'bg-green-500';
  if (value > 0.3) return 'bg-yellow-500';
  return 'bg-red-500';
}

function activityLabel(value: number) {
  if (value > 0.7) return 'Haute';
  if (value > 0.3) return 'Moyenne';
  return 'Basse';
}

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

function ActivityCard({ data }: { data: LiveStateData }) {
  const score = data.analytics?.avgConfidence ?? 0;
  const hasCooldown = data.controlledUsers.some(u => u.locked);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-gray-500 dark:text-gray-400">
          Activit&eacute;
        </CardTitle>
        <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-950">
          <Activity className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-gray-500 dark:text-gray-400">Score d&apos;activit&eacute;</span>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                {(score * 100).toFixed(0)}%
              </span>
              <Badge variant={score > 0.7 ? 'default' : 'secondary'} className="text-xs">
                {activityLabel(score)}
              </Badge>
            </div>
          </div>
          <div className="relative h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
            <div
              className={`h-full rounded-full transition-all ${activityColor(score)}`}
              style={{ width: `${Math.min(score * 100, 100)}%` }}
            />
          </div>
        </div>

        {hasCooldown && (
          <Badge variant="outline" className="border-orange-300 text-orange-600 dark:text-orange-400">
            <Clock className="h-3 w-3 mr-1" />
            Cooldown actif
          </Badge>
        )}

        <div>
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
            Utilisateurs contr&ocirc;l&eacute;s ({data.controlledUsers.length})
          </p>
          {data.controlledUsers.length === 0 ? (
            <p className="text-xs text-gray-400 dark:text-gray-500 italic">Aucun utilisateur</p>
          ) : (
            <div className="space-y-1.5">
              {data.controlledUsers.map(user => (
                <div key={user.userId} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-1.5">
                    <span className="text-gray-900 dark:text-gray-100">{user.displayName}</span>
                    {user.locked && <Lock className="h-3 w-3 text-orange-500" />}
                  </div>
                  <span className={`text-xs font-mono ${confidenceColor(user.confidence)}`}>
                    {(user.confidence * 100).toFixed(0)}%
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {data.analytics && (
          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-100 dark:border-gray-800">
            <div>
              <p className="text-xs text-gray-400">Messages envoy&eacute;s</p>
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{data.analytics.messagesSent}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Mots totaux</p>
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{data.analytics.totalWordsSent}</p>
            </div>
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
          Profils de ton
        </CardTitle>
        <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-950">
          <Users className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
        </div>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-gray-500 italic">Aucun profil de ton</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-800">
                  <th className="text-left py-2 text-xs font-medium text-gray-500 dark:text-gray-400">Utilisateur</th>
                  <th className="text-left py-2 text-xs font-medium text-gray-500 dark:text-gray-400">Ton</th>
                  <th className="text-left py-2 text-xs font-medium text-gray-500 dark:text-gray-400">Vocabulaire</th>
                  <th className="text-right py-2 text-xs font-medium text-gray-500 dark:text-gray-400">Msgs</th>
                  <th className="text-right py-2 text-xs font-medium text-gray-500 dark:text-gray-400">Confiance</th>
                  <th className="text-center py-2 text-xs font-medium text-gray-500 dark:text-gray-400"></th>
                </tr>
              </thead>
              <tbody>
                {entries.map(profile => (
                  <tr key={profile.userId} className="border-b border-gray-50 dark:border-gray-800/50 last:border-0">
                    <td className="py-2">
                      <div className="flex flex-col">
                        <span className="text-gray-900 dark:text-gray-100 font-medium">
                          {profile.displayName || truncateId(profile.userId)}
                        </span>
                        <span className="text-xs text-gray-400 font-mono">{truncateId(profile.userId)}</span>
                      </div>
                    </td>
                    <td className="py-2">
                      <Badge variant="outline" className="text-xs">{profile.tone}</Badge>
                    </td>
                    <td className="py-2 text-gray-600 dark:text-gray-300 text-xs">{profile.vocabularyLevel}</td>
                    <td className="py-2 text-right text-gray-600 dark:text-gray-300">{profile.messagesAnalyzed}</td>
                    <td className="py-2 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Progress
                          value={profile.confidence * 100}
                          className="w-16 h-1.5"
                        />
                        <span className={`text-xs font-mono ${confidenceColor(profile.confidence)}`}>
                          {(profile.confidence * 100).toFixed(0)}%
                        </span>
                      </div>
                    </td>
                    <td className="py-2 text-center">
                      {profile.locked && (
                        <Badge variant="secondary" className="text-xs">
                          <Lock className="h-3 w-3 mr-0.5" />
                          Lock
                        </Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
          R&eacute;sum&eacute;
        </CardTitle>
        <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-950">
          <Brain className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {record ? (
          <>
            <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
              {record.summary}
            </p>

            {record.currentTopics.length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Sujets</p>
                <div className="flex flex-wrap gap-1.5">
                  {record.currentTopics.map(topic => (
                    <Badge key={topic} variant="secondary" className="text-xs">
                      {topic}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 dark:text-gray-400">Ton dominant :</span>
              <Badge variant="outline" className="border-indigo-300 text-indigo-600 dark:text-indigo-400 text-xs">
                {record.overallTone}
              </Badge>
            </div>

            <div className="text-xs text-gray-400">
              {record.messageCount} messages analys&eacute;s
            </div>
          </>
        ) : data.summary ? (
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            {data.summary}
          </p>
        ) : (
          <p className="text-sm text-gray-400 dark:text-gray-500 italic">Aucun r&eacute;sum&eacute; disponible</p>
        )}
      </CardContent>
    </Card>
  );
}

function HistoryCard({ data }: { data: LiveStateData }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-gray-500 dark:text-gray-400">
          Historique Agent
        </CardTitle>
        <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-950">
          <MessageSquare className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
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
            <div className="grid grid-cols-3 gap-3 pt-2">
              <div className="text-center p-2 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{data.analytics.messagesSent}</p>
                <p className="text-xs text-gray-500">Messages</p>
              </div>
              <div className="text-center p-2 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{data.analytics.totalWordsSent}</p>
                <p className="text-xs text-gray-500">Mots</p>
              </div>
              <div className="text-center p-2 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                <p className="text-lg font-bold text-gray-900 dark:text-gray-100">
                  {(data.analytics.avgConfidence * 100).toFixed(0)}%
                </p>
                <p className="text-xs text-gray-500">Confiance moy.</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-400 dark:text-gray-500 italic pt-2">Aucune analytique disponible</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function AgentLiveTab() {
  const [conversationId, setConversationId] = useState('');
  const [liveState, setLiveState] = useState<LiveStateData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchLiveState = useCallback(async () => {
    const trimmedId = conversationId.trim();
    if (!trimmedId) return;

    setLoading(true);
    setError(null);

    try {
      const response = await agentAdminService.getLiveState(trimmedId);
      if (response.success && response.data) {
        setLiveState(response.data);
      } else {
        setError('Impossible de charger l\'etat live');
      }
    } catch {
      setError('Erreur de connexion ou conversation introuvable');
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      fetchLiveState();
    }
  }, [fetchLiveState]);

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="ID de la conversation (ObjectId 24 chars)"
                value={conversationId}
                onChange={e => setConversationId(e.target.value)}
                onKeyDown={handleKeyDown}
                className="pl-9"
              />
            </div>
            <Button
              onClick={fetchLiveState}
              disabled={loading || !conversationId.trim()}
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
              ) : (
                <Activity className="h-4 w-4 mr-1.5" />
              )}
              Charger
            </Button>
          </div>
        </CardContent>
      </Card>

      {loading && <LoadingSkeleton />}

      {error && (
        <Card>
          <CardContent className="p-6">
            <p className="text-sm text-red-500">{error}</p>
          </CardContent>
        </Card>
      )}

      {liveState && !loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ActivityCard data={liveState} />
          <ToneProfilesCard profiles={liveState.toneProfiles} />
          <SummaryCard data={liveState} />
          <HistoryCard data={liveState} />
        </div>
      )}
    </div>
  );
}

export default AgentLiveTab;
