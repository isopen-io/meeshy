'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MessageSquare, Zap, Users, Shapes, RotateCcw, Trash2 } from 'lucide-react';
import { agentAdminService, type AgentStatsData } from '@/services/agent-admin.service';
import { toast } from 'sonner';

export function AgentOverviewTab() {
  const [stats, setStats] = useState<AgentStatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [conversationIdToReset, setConversationIdToReset] = useState('');
  const [userIdToReset, setUserIdToReset] = useState('');
  const [resettingConversation, setResettingConversation] = useState(false);
  const [resettingUser, setResettingUser] = useState(false);

  const fetchStats = useCallback(async () => {
    try {
      setLoading(true);
      const response = await agentAdminService.getStats();
      if (response.success && response.data) {
        setStats((response.data as any).data ?? response.data);
        setError(null);
      } else {
        setError('Impossible de charger les statistiques');
      }
    } catch {
      setError('Erreur de connexion au service agent');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const handleReset = useCallback(async () => {
    if (!confirm('ATTENTION : Cette action va supprimer TOUTES les configurations IA, profils, analytics et cache Redis. Cette action est irréversible. Continuer ?')) {
      return;
    }
    try {
      setResetting(true);
      const response = await agentAdminService.resetAll();
      if (response.success) {
        const deleted = (response as Record<string, unknown>).data as Record<string, Record<string, number>> | undefined;
        const counts = deleted?.deleted;
        toast.success(`Reset complet : ${counts?.configs ?? 0} configs, ${counts?.roles ?? 0} rôles, ${counts?.analytics ?? 0} analytics, ${counts?.redisKeys ?? 0} clés Redis supprimés`);
        fetchStats();
      } else {
        toast.error('Erreur lors du reset');
      }
    } catch {
      toast.error('Erreur lors du reset des configurations IA');
    } finally {
      setResetting(false);
    }
  }, [fetchStats]);

  const handleResetConversation = useCallback(async () => {
    const id = conversationIdToReset.trim();
    if (!id || !/^[0-9a-fA-F]{24}$/.test(id)) {
      toast.error('ID de conversation invalide (24 caractères hex)');
      return;
    }
    if (!confirm(`Supprimer toutes les données agent pour la conversation ${id} ?`)) return;
    try {
      setResettingConversation(true);
      const response = await agentAdminService.resetConversation(id);
      if (response.success) {
        toast.success(`Conversation ${id.slice(0, 8)}... réinitialisée`);
        setConversationIdToReset('');
        fetchStats();
      }
    } catch {
      toast.error('Erreur lors du reset conversation');
    } finally {
      setResettingConversation(false);
    }
  }, [conversationIdToReset, fetchStats]);

  const handleResetUser = useCallback(async () => {
    const id = userIdToReset.trim();
    if (!id || !/^[0-9a-fA-F]{24}$/.test(id)) {
      toast.error('ID utilisateur invalide (24 caractères hex)');
      return;
    }
    if (!confirm(`Supprimer tous les profils agent pour l'utilisateur ${id} (toutes conversations) ?`)) return;
    try {
      setResettingUser(true);
      const response = await agentAdminService.resetUser(id);
      if (response.success) {
        toast.success(`Utilisateur ${id.slice(0, 8)}... réinitialisé`);
        setUserIdToReset('');
        fetchStats();
      }
    } catch {
      toast.error('Erreur lors du reset utilisateur');
    } finally {
      setResettingUser(false);
    }
  }, [userIdToReset, fetchStats]);

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-32" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-sm text-red-500">{error}</p>
        </CardContent>
      </Card>
    );
  }

  const cards = [
    {
      title: 'Conversations configurées',
      value: stats?.totalConfigs ?? 0,
      icon: MessageSquare,
      color: 'text-blue-600 dark:text-blue-400',
      bg: 'bg-blue-50 dark:bg-blue-950',
    },
    {
      title: 'Agents actifs',
      value: stats?.activeConfigs ?? 0,
      icon: Zap,
      color: 'text-green-600 dark:text-green-400',
      bg: 'bg-green-50 dark:bg-green-950',
      badge: stats && stats.activeConfigs > 0 ? 'En ligne' : 'Inactif',
      badgeVariant: stats && stats.activeConfigs > 0 ? 'default' : 'secondary',
    },
    {
      title: 'Rôles assignés',
      value: stats?.totalRoles ?? 0,
      icon: Users,
      color: 'text-purple-600 dark:text-purple-400',
      bg: 'bg-purple-50 dark:bg-purple-950',
    },
    {
      title: 'Archétypes',
      value: stats?.totalArchetypes ?? 0,
      icon: Shapes,
      color: 'text-orange-600 dark:text-orange-400',
      bg: 'bg-orange-50 dark:bg-orange-950',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map(card => {
          const Icon = card.icon;
          return (
            <Card key={card.title}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-gray-500 dark:text-gray-400">
                  {card.title}
                </CardTitle>
                <div className={`p-2 rounded-lg ${card.bg}`}>
                  <Icon className={`h-4 w-4 ${card.color}`} />
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                    {card.value}
                  </span>
                  {card.badge && (
                    <Badge variant={card.badgeVariant as 'default' | 'secondary'}>
                      {card.badge}
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="border-amber-200 dark:border-amber-900">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-amber-600 dark:text-amber-400">
            Reset par conversation
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <Input
              placeholder="ID conversation (24 hex)"
              value={conversationIdToReset}
              onChange={e => setConversationIdToReset(e.target.value)}
              className="max-w-xs font-mono text-sm"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={handleResetConversation}
              disabled={resettingConversation || !conversationIdToReset.trim()}
            >
              <Trash2 className={`h-4 w-4 mr-2 ${resettingConversation ? 'animate-spin' : ''}`} />
              {resettingConversation ? 'Reset...' : 'Reset conversation'}
            </Button>
          </div>
          <p className="text-xs text-gray-400 mt-2">
            Supprime config, rôles, résumé, analytics et cache Redis pour cette conversation.
          </p>
        </CardContent>
      </Card>

      <Card className="border-amber-200 dark:border-amber-900">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-amber-600 dark:text-amber-400">
            Reset par utilisateur
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <Input
              placeholder="ID utilisateur (24 hex)"
              value={userIdToReset}
              onChange={e => setUserIdToReset(e.target.value)}
              className="max-w-xs font-mono text-sm"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={handleResetUser}
              disabled={resettingUser || !userIdToReset.trim()}
            >
              <Trash2 className={`h-4 w-4 mr-2 ${resettingUser ? 'animate-spin' : ''}`} />
              {resettingUser ? 'Reset...' : 'Reset utilisateur'}
            </Button>
          </div>
          <p className="text-xs text-gray-400 mt-2">
            Supprime profils de ton, profil global et cooldowns pour cet utilisateur (toutes conversations).
          </p>
        </CardContent>
      </Card>

      <Card className="border-red-200 dark:border-red-900">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-red-600 dark:text-red-400">
            Zone dangereuse
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Supprimer toutes les configurations, profils de ton, analytics et cache Redis de l&apos;agent IA.
            </p>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleReset}
              disabled={resetting}
            >
              <RotateCcw className={`h-4 w-4 mr-2 ${resetting ? 'animate-spin' : ''}`} />
              {resetting ? 'Reset en cours...' : 'Reset complet'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
