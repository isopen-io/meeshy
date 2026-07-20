'use client';

import { useEffect, useRef, useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { agentAdminService, type TopicCatalogItem, type TopicInput } from '@/services/agent-admin.service';
import { AgentTopicRegexTester } from './AgentTopicRegexTester';
import { useI18n } from '@/hooks/use-i18n';
import { useFocusTrap } from '@/hooks/use-accessibility';

interface Props {
  topic: TopicCatalogItem | null;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Modal de création/édition d'un topic du catalogue.
 *
 * Mode create (topic=null) : tous les champs vierges, slug éditable.
 * Mode edit (topic≠null) : champs préremplis, slug verrouillé (clé Prisma
 * unique). Section "Tester regex" visible uniquement en mode edit (l'id
 * topic est requis côté backend pour le test endpoint).
 *
 * Validation client basique : slug kebab-case, regex syntaxiquement valide.
 * Validation finale côté backend via Zod (cf. agent-topics.ts).
 */
export function AgentTopicEditModal({ topic, onClose, onSaved }: Props) {
  const { t } = useI18n('admin');
  const isEdit = topic !== null;
  const [form, setForm] = useState<TopicInput>(
    topic
      ? {
          slug: topic.slug,
          label: topic.label,
          description: topic.description ?? '',
          keywordPatterns: topic.keywordPatterns,
          instructionTemplate: topic.instructionTemplate,
          searchHintTemplate: topic.searchHintTemplate,
          examples: topic.examples,
          cooldownMinutes: topic.cooldownMinutes,
          isActive: topic.isActive,
        }
      : {
          slug: '',
          label: '',
          description: '',
          keywordPatterns: [],
          instructionTemplate: '',
          searchHintTemplate: '',
          examples: [],
          cooldownMinutes: 60,
          isActive: true,
        }
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Trap Tab focus inside the modal while open and restore it on close.
  useFocusTrap(panelRef, true);

  // Standard dismiss gesture: close on Escape (but never interrupt an in-flight save).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [saving, onClose]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      if (!/^[a-z0-9_-]+$/.test(form.slug)) {
        throw new Error(t('agent.topicEditModal.errorSlugFormat'));
      }
      if (form.keywordPatterns.length === 0) {
        throw new Error(t('agent.topicEditModal.errorNoPatterns'));
      }
      for (const p of form.keywordPatterns) {
        try {
          new RegExp(p);
        } catch {
          throw new Error(t('agent.topicEditModal.errorInvalidRegex', { pattern: p }));
        }
      }
      if (form.instructionTemplate.length < 20) {
        throw new Error(t('agent.topicEditModal.errorTemplateTooShort'));
      }
      const res = isEdit
        ? await agentAdminService.updateTopic(topic!.id, form)
        : await agentAdminService.createTopic(form);
      if (!res.success) throw new Error(res.error ?? t('agent.topicEditModal.errorSave'));
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('agent.topicEditModal.errorUnknown'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="agent-topic-edit-modal-title"
        className="bg-white dark:bg-slate-900 rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700 sticky top-0 bg-white dark:bg-slate-900 z-10">
          <h3 id="agent-topic-edit-modal-title" className="text-lg font-semibold">
            {isEdit ? t('agent.topicEditModal.titleEdit', { label: topic!.label }) : t('agent.topicEditModal.titleNew')}
          </h3>
          <button
            onClick={onClose}
            disabled={saving}
            aria-label={t('agent.topicEditModal.close')}
            className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-md text-sm">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="text-sm font-medium">{t('agent.topicEditModal.fieldSlug')}</span>
              <input
                type="text"
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value })}
                disabled={isEdit}
                className="mt-1 w-full border border-slate-300 dark:border-slate-700 dark:bg-slate-900 rounded-md p-2 text-sm font-mono disabled:bg-slate-100 dark:disabled:bg-slate-800"
                placeholder={t('agent.topicEditModal.placeholderSlug')}
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium">{t('agent.topicEditModal.fieldLabel')}</span>
              <input
                type="text"
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                className="mt-1 w-full border border-slate-300 dark:border-slate-700 dark:bg-slate-900 rounded-md p-2 text-sm"
                placeholder={t('agent.topicEditModal.placeholderLabel')}
              />
            </label>
          </div>

          <label className="block">
            <span className="text-sm font-medium">{t('agent.topicEditModal.fieldDescription')}</span>
            <textarea
              value={form.description ?? ''}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="mt-1 w-full border border-slate-300 dark:border-slate-700 dark:bg-slate-900 rounded-md p-2 text-sm h-16"
              placeholder={t('agent.topicEditModal.placeholderDescription')}
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium">{t('agent.topicEditModal.fieldKeywordPatterns')}</span>
            <textarea
              value={form.keywordPatterns.join('\n')}
              onChange={(e) =>
                setForm({ ...form, keywordPatterns: e.target.value.split('\n').filter(Boolean) })
              }
              className="mt-1 w-full border border-slate-300 dark:border-slate-700 dark:bg-slate-900 rounded-md p-2 text-xs font-mono h-24"
              placeholder={'\\bastronomy\\b\n\\bspace\\b\n\\b(nasa|esa)\\b'}
            />
            <p className="mt-1 text-xs text-slate-500">
              {t('agent.topicEditModal.keywordPatternsHint')}
            </p>
          </label>

          <label className="block">
            <span className="text-sm font-medium">
              {t('agent.topicEditModal.fieldInstruction')}{' '}
              <span className="text-xs text-slate-500">
                {t('agent.topicEditModal.instructionHint')}
              </span>
            </span>
            <textarea
              value={form.instructionTemplate}
              onChange={(e) => setForm({ ...form, instructionTemplate: e.target.value })}
              className="mt-1 w-full border border-slate-300 dark:border-slate-700 dark:bg-slate-900 rounded-md p-2 text-sm h-24"
              placeholder={t('agent.topicEditModal.placeholderInstruction')}
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium">{t('agent.topicEditModal.fieldSearchHint')}</span>
            <input
              type="text"
              value={form.searchHintTemplate}
              onChange={(e) => setForm({ ...form, searchHintTemplate: e.target.value })}
              className="mt-1 w-full border border-slate-300 dark:border-slate-700 dark:bg-slate-900 rounded-md p-2 text-sm"
              placeholder={t('agent.topicEditModal.placeholderSearchHint')}
            />
          </label>

          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="text-sm font-medium">{t('agent.topicEditModal.fieldCooldown')}</span>
              <input
                type="number"
                value={form.cooldownMinutes}
                onChange={(e) => setForm({ ...form, cooldownMinutes: Number(e.target.value) })}
                min={0}
                max={10080}
                className="mt-1 w-full border border-slate-300 dark:border-slate-700 dark:bg-slate-900 rounded-md p-2 text-sm"
              />
              <p className="mt-1 text-xs text-slate-500">
                {t('agent.topicEditModal.cooldownHint')}
              </p>
            </label>
            <label className="flex items-center gap-2 pt-6">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                className="h-4 w-4"
              />
              <span className="text-sm font-medium">{t('agent.topicEditModal.fieldActive')}</span>
            </label>
          </div>

          {isEdit && topic && (
            <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
              <AgentTopicRegexTester topicId={topic.id} />
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 p-4 border-t border-slate-200 dark:border-slate-700 sticky bottom-0 bg-white dark:bg-slate-900">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-sm border border-slate-300 dark:border-slate-700 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            {t('agent.topicEditModal.cancel')}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-md disabled:opacity-50"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {saving ? t('agent.topicEditModal.saving') : t('agent.topicEditModal.save')}
          </button>
        </div>
      </div>
    </div>
  );
}
