'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Settings, Trash2, ChevronLeft, ChevronRight, Plus, Search as SearchIcon, MessageSquare, Clock } from 'lucide-react';
import { agentAdminService, type AgentConfigData } from '@/services/agent-admin.service';
import { AgentConfigDialog } from './AgentConfigDialog';
import { UserDisplay } from './UserDisplay';
import { useDebounce } from 'use-debounce';
import { toast } from 'sonner';
import dynamic from 'next/dynamic';

const TriggerSchedulingModal = dynamic(() => import('./TriggerSchedulingModal'), {
  loading: () => null,
});
const AgentMessagesModal = dynamic(() => import('./AgentMessagesModal'), {
  loading: () => null,
});

const TYPE_LABELS: Record<string, string> = {
  direct: 'Direct',
  group: 'Groupe',
  public: 'Public',
  global: 'Globale',
  broadcast: 'Communication',
  channel: 'Canal',
};

function conversationLabel(config: AgentConfigData): string {
  if (config.conversation?.title) return config.conversation.title;
  return config.conversationId.slice(0, 8) + '...';
}

function formatTimeAgo(dateStr: string | null | undefined): string {
  if (!dateStr) return '-';
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'maintenant';
  if (minutes < 60) return `${minutes}min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}j`;
}

export function AgentConversationsTab() {
  const [configs, setConfigs] = useState<AgentConfigData[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch] = useDebounce(searchTerm, 500);
  const [selectedConfig, setSelectedConfig] = useState<AgentConfigData | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [scheduleModalConfig, setScheduleModalConfig] = useState<AgentConfigData | null>(null);
  const [messagesModalConfig, setMessagesModalConfig] = useState<AgentConfigData | null>(null);
  const limit = 20;

  const fetchConfigs = useCallback(async () => {
    setLoading(true);
    try {
      const response = await agentAdminService.getConfigs(page, limit, debouncedSearch);
      if (response.success && response.data) {
        setConfigs(Array.isArray(response.data) ? response.data : []);
        setTotal(response.pagination?.total ?? 0);
        setHasMore(response.pagination?.hasMore ?? false);
      }
    } catch {
      toast.error('Erreur lors du chargement des configurations');
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => { fetchConfigs(); }, [fetchConfigs, debouncedSearch]);

  const handleToggle = async (config: AgentConfigData) => {
    try {
      await agentAdminService.upsertConfig(config.conversationId, { enabled: !config.enabled });
      setConfigs(prev => prev.map(c =>
        c.conversationId === config.conversationId ? { ...c, enabled: !c.enabled } : c
      ));
      toast.success(`Agent ${!config.enabled ? 'activé' : 'désactivé'}`);
    } catch {
      toast.error('Erreur lors de la mise à jour');
    }
  };

  const handleDelete = async (conversationId: string) => {
    if (!confirm('Supprimer cette configuration agent ?')) return;
    try {
      await agentAdminService.deleteConfig(conversationId);
      setConfigs(prev => prev.filter(c => c.conversationId !== conversationId));
      toast.success('Configuration supprimée');
    } catch {
      toast.error('Erreur lors de la suppression');
    }
  };

  const handleEdit = (config: AgentConfigData) => {
    setSelectedConfig(config);
    setDialogOpen(true);
  };

  const handleCreate = () => {
    setSelectedConfig(null);
    setDialogOpen(true);
  };

  const handleDialogSave = () => {
    setDialogOpen(false);
    setSelectedConfig(null);
    fetchConfigs();
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6 space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <CardTitle className="text-lg">Configurations Agent</CardTitle>
            <p className="text-xs text-gray-500 mt-0.5">{total} conversations configurées</p>
          </div>
          <div className="flex w-full sm:w-auto gap-2">
            <div className="relative flex-1 sm:w-64">
              <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Rechercher..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && fetchConfigs()}
                className="pl-9"
              />
            </div>
            <Button size="sm" onClick={handleCreate}>
              <Plus className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">Configurer</span>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {configs.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">
              Aucune conversation configur&eacute;e pour l&apos;agent
            </p>
          ) : (
            <div className="space-y-1">
              {/* Desktop header */}
              <div className="hidden lg:grid grid-cols-12 gap-3 px-4 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                <span className="col-span-3">Conversation</span>
                <span>Statut</span>
                <span>Triggers</span>
                <span className="col-span-2">Contrôlés</span>
                <span className="text-right">Messages</span>
                <span className="text-right">Confiance</span>
                <span className="text-right">Dernière rép.</span>
                <span>Actions</span>
              </div>

              {configs.map(config => {
                const analytics = config.analytics;
                const controlledUsers = config.controlledUserIds ?? [];

                return (
                  <div
                    key={config.id}
                    className="grid grid-cols-1 lg:grid-cols-12 gap-2 lg:gap-3 items-start lg:items-center px-4 py-3 rounded-lg border hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                  >
                    {/* Conversation name + type */}
                    <div className="col-span-1 lg:col-span-3 min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm font-medium truncate flex-1 text-gray-900 dark:text-gray-100" title={config.conversationId}>
                          {conversationLabel(config)}
                        </span>
                        {config.conversation?.type && (
                          <Badge variant="outline" className="text-[10px] shrink-0">
                            {TYPE_LABELS[config.conversation.type] ?? config.conversation.type}
                          </Badge>
                        )}
                      </div>
                      <span className="text-[10px] text-gray-400 font-mono block mt-0.5">
                        {config.conversationId.slice(0, 12)}...
                      </span>
                    </div>

                    {/* Mobile: compact row / Desktop: individual columns */}
                    <div className="flex items-center gap-2 lg:contents flex-wrap">
                      {/* Status */}
                      <div className="flex items-center gap-1.5">
                        <Switch
                          checked={config.enabled}
                          onCheckedChange={() => handleToggle(config)}
                        />
                        <Badge variant={config.enabled ? 'default' : 'secondary'} className="text-[10px]">
                          {config.enabled ? 'Actif' : 'Off'}
                        </Badge>
                      </div>

                      {/* Triggers */}
                      <div className="flex flex-wrap gap-0.5">
                        {config.triggerOnTimeout && <Badge variant="outline" className="text-[10px] px-1.5">T</Badge>}
                        {config.triggerOnUserMessage && <Badge variant="outline" className="text-[10px] px-1.5">M</Badge>}
                        {config.triggerOnReplyTo && <Badge variant="outline" className="text-[10px] px-1.5">R</Badge>}
                      </div>

                      {/* Controlled users */}
                      <div className="flex items-center gap-1 overflow-hidden col-span-2">
                        {controlledUsers.slice(0, 4).map(id => (
                          <UserDisplay key={id} userId={id} size="sm" showUsername={false} className="w-6" />
                        ))}
                        {controlledUsers.length > 4 && (
                          <Badge variant="secondary" className="h-5 min-w-[20px] rounded-full p-0 flex items-center justify-center text-[9px]">
                            +{controlledUsers.length - 4}
                          </Badge>
                        )}
                        {controlledUsers.length === 0 && (
                          <span className="text-[10px] text-gray-400">0/{config.maxControlledUsers}</span>
                        )}
                      </div>

                      {/* Messages sent */}
                      <div className="text-right">
                        <button
                          onClick={() => setMessagesModalConfig(config)}
                          className="flex items-center gap-1 justify-end hover:text-indigo-500 transition-colors"
                          title="Voir les messages agent"
                        >
                          <MessageSquare className="h-3 w-3 text-gray-400 hidden lg:block" />
                          <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 tabular-nums">
                            {analytics?.messagesSent ?? 0}
                          </span>
                        </button>
                      </div>

                      {/* Avg confidence */}
                      <div className="text-right">
                        {analytics ? (
                          <div className="flex items-center gap-1.5 justify-end">
                            <Progress value={analytics.avgConfidence * 100} className="w-10 h-1.5 hidden lg:block" />
                            <span className="text-xs font-mono text-gray-600 dark:text-gray-300 tabular-nums">
                              {(analytics.avgConfidence * 100).toFixed(0)}%
                            </span>
                          </div>
                        ) : (
                          <span className="text-[10px] text-gray-400">-</span>
                        )}
                      </div>

                      {/* Last response */}
                      <div className="text-right">
                        <button
                          onClick={() => setScheduleModalConfig(config)}
                          className="flex items-center gap-1 justify-end hover:text-indigo-500 transition-colors"
                          title="Planificateur de triggers"
                        >
                          <Clock className="h-3 w-3 text-gray-400 hidden lg:block" />
                          <span className="text-xs text-gray-500 tabular-nums">
                            {formatTimeAgo(analytics?.lastResponseAt)}
                          </span>
                        </button>
                      </div>

                      {/* Actions */}
                      <div className="flex gap-0.5 shrink-0">
                        <Button variant="ghost" size="sm" onClick={() => handleEdit(config)} className="h-7 w-7 p-0">
                          <Settings className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(config.conversationId)}
                          className="text-red-500 hover:text-red-700 h-7 w-7 p-0"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {total > limit && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t">
              <span className="text-sm text-gray-500">
                Page {page} sur {Math.ceil(total / limit)} ({total} résultats)
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage(p => p - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!hasMore}
                  onClick={() => setPage(p => p + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <AgentConfigDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        config={selectedConfig}
        onSave={handleDialogSave}
      />

      {scheduleModalConfig && (
        <TriggerSchedulingModal
          conversationId={scheduleModalConfig.conversationId}
          conversationTitle={conversationLabel(scheduleModalConfig)}
          open={!!scheduleModalConfig}
          onOpenChange={(open) => { if (!open) setScheduleModalConfig(null); }}
        />
      )}

      {messagesModalConfig && (
        <AgentMessagesModal
          conversationId={messagesModalConfig.conversationId}
          conversationTitle={conversationLabel(messagesModalConfig)}
          open={!!messagesModalConfig}
          onOpenChange={(open) => { if (!open) setMessagesModalConfig(null); }}
        />
      )}
    </>
  );
}
