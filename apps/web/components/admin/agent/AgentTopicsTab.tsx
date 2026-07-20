'use client';

import { useEffect, useState, useCallback } from 'react';
import { Loader2, Plus, RefreshCw, Pencil, EyeOff, Trash2 } from 'lucide-react';
import { agentAdminService, type TopicCatalogItem } from '@/services/agent-admin.service';
import { AgentTopicEditModal } from './AgentTopicEditModal';
import { useI18n } from '@/hooks/use-i18n';
import { useAgentAdminEvents } from '@/hooks/admin/use-agent-admin-events';

/**
 * Catalogue dynamique des topics utilisés par le strategist agent pour
 * provoquer de nouveaux sujets dans les conversations. CRUD complet :
 *   - Liste tabulaire (slug, label, état actif, cooldown, nb patterns)
 *   - Bouton + Nouveau topic → ouvre AgentTopicEditModal en mode create
 *   - Éditer → AgentTopicEditModal en mode edit avec testeur regex
 *   - Désactiver → soft delete (isActive=false, garde l'historique)
 *   - Supprimer → hard delete avec confirmation
 *
 * Auth : BIGBOSS + ADMIN (gardé côté backend par requireAgentAdmin).
 */
export function AgentTopicsTab() {
  const [topics, setTopics] = useState<TopicCatalogItem[]>([]);
  const { t } = useI18n('admin');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<TopicCatalogItem | null>(null);
  const [creating, setCreating] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await agentAdminService.listTopics();
      if (!res.success) throw new Error(res.error ?? 'Erreur chargement');
      setTopics(res.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  useAgentAdminEvents({ kinds: ['topics'], onChange: reload });

  const handleDelete = async (id: string, hard: boolean) => {
    const msg = hard
      ? 'Supprimer DÉFINITIVEMENT ce topic ? (irréversible, supprime aussi l\'historique d\'usage)'
      : 'Désactiver ce topic ? Il restera visible mais le strategist ne l\'utilisera plus.';
    if (!confirm(msg)) return;
    try {
      const res = await agentAdminService.deleteTopic(id, { hard });
      if (!res.success) throw new Error(res.error ?? 'Erreur');
      await reload();
    } catch (err) {
      alert(`Erreur : ${err instanceof Error ? err.message : 'Inconnue'}`);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">{t('agent.topics.title')}</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {t('agent.topics.description')}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-md"
          >
            <Plus className="h-4 w-4" /> {t('agent.topics.newTopic')}
          </button>
          <button
            onClick={reload}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> {t('agent.topics.reload')}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-md text-sm">
          {error}
        </div>
      )}

      {loading && topics.length === 0 ? (
        <div className="flex items-center justify-center p-12">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      ) : (
        <div className="overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-md">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-700 dark:text-slate-300">
              <tr>
                <th className="text-left px-3 py-2 font-medium">{t('agent.topics.colActive')}</th>
                <th className="text-left px-3 py-2 font-medium">{t('agent.topics.colSlug')}</th>
                <th className="text-left px-3 py-2 font-medium">{t('agent.topics.colLabel')}</th>
                <th className="text-left px-3 py-2 font-medium">{t('agent.topics.colCooldown')}</th>
                <th className="text-left px-3 py-2 font-medium">{t('agent.topics.colPatterns')}</th>
                <th className="text-right px-3 py-2 font-medium">{t('agent.topics.colActions')}</th>
              </tr>
            </thead>
            <tbody>
              {topics.length === 0 && !loading && (
                <tr>
                  <td colSpan={6} className="text-center p-6 text-slate-500">
                    {t('agent.topics.emptyState')}
                  </td>
                </tr>
              )}
              {topics.map((topic) => (
                <tr
                  key={topic.id}
                  className="border-t border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/40"
                >
                  <td className="px-3 py-2">
                    <span className={topic.isActive ? 'text-emerald-600' : 'text-slate-400'}>
                      {topic.isActive ? '✓' : '✗'}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{topic.slug}</td>
                  <td className="px-3 py-2">{topic.label}</td>
                  <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{topic.cooldownMinutes} min</td>
                  <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{topic.keywordPatterns.length}</td>
                  <td className="px-3 py-2 text-right">
                    <div className="inline-flex items-center gap-1">
                      <button
                        onClick={() => setEditing(topic)}
                        title={t('agent.topics.editTitle')}
                        className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-indigo-600 dark:text-indigo-400"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(topic.id, false)}
                        title={t('agent.topics.disableTitle')}
                        aria-label="Disable topic"
                        className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-orange-600 dark:text-orange-400"
                      >
                        <EyeOff className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(topic.id, true)}
                        title={t('agent.topics.deleteTitle')}
                        aria-label="Delete topic"
                        className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-red-600 dark:text-red-400"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(creating || editing) && (
        <AgentTopicEditModal
          topic={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => {
            setCreating(false);
            setEditing(null);
            reload();
          }}
        />
      )}
    </div>
  );
}
