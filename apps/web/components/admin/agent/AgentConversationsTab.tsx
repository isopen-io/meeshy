'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Settings, Trash2, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { agentAdminService, type AgentConfigData } from '@/services/agent-admin.service';
import { AgentConfigDialog } from './AgentConfigDialog';
import { toast } from 'sonner';

const TYPE_LABELS: Record<string, string> = {
  group: 'Groupe',
  channel: 'Canal',
  public: 'Public',
  global: 'Global',
  broadcast: 'Broadcast',
  direct: 'Direct',
};

function conversationLabel(config: AgentConfigData): string {
  if (config.conversation?.title) return config.conversation.title;
  return config.conversationId.slice(0, 8) + '...';
}

export function AgentConversationsTab() {
  const [configs, setConfigs] = useState<AgentConfigData[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [selectedConfig, setSelectedConfig] = useState<AgentConfigData | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const limit = 20;

  const fetchConfigs = useCallback(async () => {
    setLoading(true);
    try {
      const response = await agentAdminService.getConfigs(page, limit);
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

  useEffect(() => { fetchConfigs(); }, [fetchConfigs]);

  const handleToggle = async (config: AgentConfigData) => {
    try {
      await agentAdminService.upsertConfig(config.conversationId, { enabled: !config.enabled });
      setConfigs(prev => prev.map(c =>
        c.conversationId === config.conversationId ? { ...c, enabled: !c.enabled } : c
      ));
      toast.success(`Agent ${!config.enabled ? 'activ\u00e9' : 'd\u00e9sactiv\u00e9'}`);
    } catch {
      toast.error('Erreur lors de la mise \u00e0 jour');
    }
  };

  const handleDelete = async (conversationId: string) => {
    if (!confirm('Supprimer cette configuration agent ?')) return;
    try {
      await agentAdminService.deleteConfig(conversationId);
      setConfigs(prev => prev.filter(c => c.conversationId !== conversationId));
      toast.success('Configuration supprim\u00e9e');
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
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Configurations Agent</CardTitle>
          <Button size="sm" onClick={handleCreate}>
            <Plus className="h-4 w-4 mr-2" />
            <span className="hidden sm:inline">Configurer</span>
          </Button>
        </CardHeader>
        <CardContent>
          {configs.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">
              Aucune conversation configur&eacute;e pour l&apos;agent
            </p>
          ) : (
            <div className="space-y-2">
              {/* Desktop header */}
              <div className="hidden lg:grid grid-cols-6 gap-4 px-4 py-2 text-xs font-medium text-gray-500 uppercase">
                <span className="col-span-2">Conversation</span>
                <span>Statut</span>
                <span>Triggers</span>
                <span>Contr&ocirc;l&eacute;s</span>
                <span>Actions</span>
              </div>

              {configs.map(config => (
                <div
                  key={config.id}
                  className="grid grid-cols-1 lg:grid-cols-6 gap-3 lg:gap-4 items-start lg:items-center px-4 py-3 rounded-lg border hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  {/* Conversation name + type */}
                  <div className="col-span-1 lg:col-span-2 min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm font-medium truncate text-gray-900 dark:text-gray-100" title={config.conversationId}>
                        {conversationLabel(config)}
                      </span>
                      {config.conversation?.type && (
                        <Badge variant="outline" className="text-xs shrink-0">
                          {TYPE_LABELS[config.conversation.type] ?? config.conversation.type}
                        </Badge>
                      )}
                    </div>
                    <span className="text-xs text-gray-400 font-mono block mt-0.5">
                      {config.conversationId.slice(0, 12)}...
                    </span>
                  </div>

                  {/* Mobile: row with status + triggers + controlled + actions */}
                  <div className="flex items-center gap-2 lg:contents">
                    {/* Status */}
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={config.enabled}
                        onCheckedChange={() => handleToggle(config)}
                      />
                      <Badge variant={config.enabled ? 'default' : 'secondary'} className="text-xs">
                        {config.enabled ? 'Actif' : 'Inactif'}
                      </Badge>
                    </div>

                    {/* Triggers */}
                    <div className="flex flex-wrap gap-1 flex-1">
                      {config.triggerOnTimeout && <Badge variant="outline" className="text-xs">Timeout</Badge>}
                      {config.triggerOnUserMessage && <Badge variant="outline" className="text-xs">Message</Badge>}
                      {config.triggerOnReplyTo && <Badge variant="outline" className="text-xs">Reply</Badge>}
                    </div>

                    {/* Controlled */}
                    <span className="text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
                      {(config.manualUserIds ?? []).length}/{config.maxControlledUsers}
                    </span>

                    {/* Actions */}
                    <div className="flex gap-1 shrink-0">
                      <Button variant="ghost" size="sm" onClick={() => handleEdit(config)}>
                        <Settings className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(config.conversationId)}
                        className="text-red-500 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {total > limit && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t">
              <span className="text-sm text-gray-500">
                Page {page} - {total} r&eacute;sultats
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
    </>
  );
}
