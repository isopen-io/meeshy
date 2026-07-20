'use client';

import { useState } from 'react';
import { Loader2, FlaskConical } from 'lucide-react';
import { agentAdminService } from '@/services/agent-admin.service';
import { useI18n } from '@/hooks/useI18n';

interface Props {
  topicId: string;
}

/**
 * Sous-section du modal d'édition : permet à l'admin de coller un texte
 * sample et de voir combien de matches chaque regex du topic produit.
 * Backed by POST /admin/agent/topics/:id/test (server-side regex match
 * pour cohérence avec ce que le strategist verrait).
 */
export function AgentTopicRegexTester({ topicId }: Props) {
  const { t } = useI18n('admin');
  const [sampleText, setSampleText] = useState('');
  const [matches, setMatches] = useState<Record<string, number> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleTest = async () => {
    /* istanbul ignore if -- button is disabled when sampleText is blank; guard is unreachable via UI */
    if (!sampleText.trim()) return;
    setLoading(true);
    setError(null);
    setMatches(null);
    try {
      const res = await agentAdminService.testTopicRegex(topicId, sampleText);
      if (!res.success) throw new Error(res.error ?? 'Erreur');
      setMatches(res.data?.matches ?? {});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <FlaskConical className="h-4 w-4 text-indigo-600" />
        <h4 className="font-medium text-sm">{t('regexTester.title')}</h4>
      </div>
      <textarea
        value={sampleText}
        onChange={(e) => setSampleText(e.target.value)}
        className="w-full border border-slate-300 dark:border-slate-700 dark:bg-slate-900 rounded-md p-2 text-sm h-20"
        placeholder={t('regexTester.placeholder')}
      />
      <button
        type="button"
        onClick={handleTest}
        disabled={loading || !sampleText.trim()}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-slate-300 dark:border-slate-700 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
      >
        {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        {t('regexTester.test')}
      </button>

      {error && (
        <div className="text-red-600 dark:text-red-400 text-sm">{error}</div>
      )}

      {matches && Object.keys(matches).length === 0 && (
        <div className="text-sm text-slate-500">{t('regexTester.noPatterns')}</div>
      )}

      {matches && Object.keys(matches).length > 0 && (
        <div className="space-y-1 mt-2">
          {Object.entries(matches).map(([pattern, count]) => (
            <div key={pattern} className="font-mono text-xs">
              <span
                className={
                  count > 0
                    ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                    : 'text-slate-400'
                }
              >
                {count >= 0
                  ? `${count} ${count !== 1 ? t('regexTester.matches') : t('regexTester.match')}`
                  : t('regexTester.invalidRegex')}
              </span>
              <span className="text-slate-500"> — </span>
              <code className="bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">{pattern}</code>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
