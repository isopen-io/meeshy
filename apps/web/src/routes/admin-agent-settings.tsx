import { useQuery } from '@tanstack/react-query';
import { useId, useState } from 'react';

import { AdminFicheSection } from '@/components/admin/fiche';
import { AdminMetaRow, AdminMomentText } from '@/components/admin/meta';
import { AdminErrorState, AdminInlineNotice } from '@/components/admin/states';
import { BRAND, EDGE, INK, INK2, SURFACE } from '@/components/admin/tone';
import { PasswordInput } from '@/components/password-input';
import { AGENT_GLOBAL_FIELDS, AGENT_LLM_FIELDS } from '@/lib/admin/agent-settings-form';
import { formatCount } from '@/lib/admin/interpret/numbers';
import { adminMomentOf } from '@/lib/admin/interpret/time';
import { useAdminReach } from '@/lib/admin/use-admin-reach';
import type { AdminDeps } from '@/lib/api/admin';
import {
  agentGlobalConfigQueryKey,
  agentLlmQueryKey,
  loadAgentGlobalConfig,
  loadAgentLlm,
  saveAgentGlobalConfig,
  saveAgentLlm,
  type AgentLlmConfig,
} from '@/lib/api/admin-agent-settings';
import { unwrap } from '@/lib/api/client';
import { translateAdmin, type AdminLanguage } from '@/lib/i18n-admin-catalog';
import { AdminSkeleton } from '@/routes/admin-parts';

import { AgentSettingsForm, providerName, useAgentConfirm, useAgentGesture } from './admin-agent-form';

/**
 * **LA MODALE « MODÈLE ET RÉGLAGES GLOBAUX »** (lot Agent complet) — le modèle de
 * langage (`GET/PUT /llm`) et la configuration globale (`GET/PUT /global-config`).
 *
 * ## Le modèle se LIT à tout administrateur de l'agent, ne s'ÉCRIT qu'au souverain
 *
 * `PUT /llm` exige le rang souverain (`requireSovereign()`, #4157) : écrire le
 * fournisseur redirige le contenu des conversations. Le formulaire n'est donc
 * peint que pour `useAdminReach().isSovereign` ; les autres lisent les réglages,
 * et une phrase dit pourquoi ils ne peuvent pas les changer — un champ grisé sans
 * raison serait un contrôle qui ment.
 *
 * ## La clé API ne revient jamais
 *
 * Le champ est un mot de passe, VIDE à chaque ouverture : la passerelle ne sert
 * que `hasApiKey`. Il ne part que saisi. Le formulaire est remonté après chaque
 * enregistrement (`key`) : la clé tapée ne survit pas au geste.
 *
 * ## Les deux écritures se confirment
 *
 * Toutes deux valent pour TOUTE la plateforme dès le prochain scan : la feuille
 * de confirmation le redit. Le motif est offert (facultatif) là où la route le
 * lit (`PUT /llm`) ; le rang souverain ne l'écrit pas (`AdminConfirmSheet`).
 */
export function AgentModelDetail({ language, deps, now }: { readonly language: AdminLanguage; readonly deps: AdminDeps; readonly now: () => Date }) {
  const gesture = useAgentGesture(language);
  const confirm = useAgentConfirm(language, gesture);

  return (
    <>
      <AgentLlmBlock language={language} deps={deps} now={now} gesture={gesture} ask={confirm.ask} />
      <AgentGlobalBlock language={language} deps={deps} gesture={gesture} ask={confirm.ask} />
      {confirm.node}
      {gesture.announcement}
    </>
  );
}

type BlockProps = {
  readonly language: AdminLanguage;
  readonly deps: AdminDeps;
  readonly gesture: ReturnType<typeof useAgentGesture>;
  readonly ask: ReturnType<typeof useAgentConfirm>['ask'];
};

const llmLabel = (language: AdminLanguage) => (key: string) => translateAdmin(language, `admin.agentPanel.llm.${key as 'provider' | 'model' | 'dailyBudgetUsd' | 'maxCostPerCall'}`);

function AgentLlmBlock({ language, deps, now, gesture, ask }: BlockProps & { readonly now: () => Date }) {
  const reach = useAdminReach();
  const [apiKey, setApiKey] = useState('');
  const [generation, setGeneration] = useState(0);
  const keyId = useId();

  const llm = useQuery({
    queryKey: agentLlmQueryKey(),
    queryFn: async ({ signal }) => unwrap(await loadAgentLlm({ ...deps, signal })),
    retry: false,
    refetchOnWindowFocus: false,
  });

  const title = translateAdmin(language, 'admin.agentPanel.llm.title');
  if (llm.isPending) {
    return (
      <AdminFicheSection id="agent-llm" title={title}>
        <AdminSkeleton rows={3} />
      </AdminFicheSection>
    );
  }
  if (llm.isError) {
    return (
      <AdminFicheSection id="agent-llm" title={title}>
        <AdminErrorState language={language} onRetry={() => void llm.refetch()} />
      </AdminFicheSection>
    );
  }

  const config: AgentLlmConfig | null = llm.data ?? null;
  const fields = config?.fields ?? {};
  const read = (key: string): string => {
    const value = fields[key];
    if (typeof value === 'number') return formatCount(value, language);
    if (typeof value === 'string' && value !== '') return key === 'provider' ? providerName(value) : value;
    return translateAdmin(language, 'admin.agentPanel.form.notProvided');
  };

  const submit = (changes: Readonly<Record<string, unknown>>) =>
    ask({
      id: 'llm',
      title: translateAdmin(language, 'admin.agentPanel.llm.save'),
      body: translateAdmin(language, 'admin.agentPanel.llm.confirm'),
      confirmLabel: translateAdmin(language, 'admin.agentPanel.llm.save'),
      tone: 'primary',
      withMotive: true,
      act: (reason) => saveAgentLlm({ ...deps, changes, apiKey, reason }),
      success: translateAdmin(language, 'admin.agentPanel.llm.saved'),
      after: () => {
        setApiKey('');
        setGeneration((value) => value + 1);
      },
    });

  return (
    <AdminFicheSection id="agent-llm" title={title}>
      <div data-agent-llm className="grid gap-4">
        {config === null ? (
          <AdminInlineNotice tone="info" text={translateAdmin(language, 'admin.agentPanel.llm.none')} />
        ) : (
          <dl className="grid gap-3 @lg:grid-cols-2">
            {AGENT_LLM_FIELDS.map((spec) => (
              <AdminMetaRow key={spec.key} anchor={`llm-${spec.key}`} label={llmLabel(language)(spec.key)} value={read(spec.key)} />
            ))}
            <AdminMetaRow
              anchor="llm-key"
              label={translateAdmin(language, 'admin.agentPanel.llm.key')}
              value={translateAdmin(language, config.hasApiKey ? 'admin.agentPanel.llm.keySet' : 'admin.agentPanel.llm.keyMissing')}
            />
            <AdminMetaRow anchor="llm-tokens" label={translateAdmin(language, 'admin.agentPanel.llm.tokens')} value={formatCount(config.maxTokens, language)} />
            <AdminMetaRow
              anchor="llm-temperature"
              label={translateAdmin(language, 'admin.agentPanel.llm.temperature')}
              value={config.temperature === null ? translateAdmin(language, 'admin.agentPanel.form.notProvided') : new Intl.NumberFormat(language).format(config.temperature)}
            />
            {config.fallbackModel === null ? null : (
              <AdminMetaRow
                anchor="llm-fallback"
                label={translateAdmin(language, 'admin.agentPanel.llm.fallback')}
                value={[config.fallbackProvider === null ? null : providerName(config.fallbackProvider), config.fallbackModel].filter(Boolean).join(' · ')}
              />
            )}
            {config.updatedAt === null ? null : (
              <AdminMetaRow
                anchor="llm-updated"
                label={translateAdmin(language, 'admin.agentPanel.llm.updated')}
                value={<AdminMomentText moment={adminMomentOf(config.updatedAt, now(), language)} variant="both" />}
              />
            )}
          </dl>
        )}

        {reach.isSovereign ? (
          <AgentSettingsForm
            key={generation}
            id="llm"
            language={language}
            specs={AGENT_LLM_FIELDS}
            served={fields}
            labelOf={llmLabel(language)}
            saveLabel={translateAdmin(language, 'admin.agentPanel.llm.save')}
            busy={gesture.busy === 'llm'}
            error={null}
            extraDirty={apiKey.trim() !== ''}
            onSubmit={submit}
            extra={
              <div className="grid gap-1">
                <label htmlFor={keyId} className="text-caption font-medium" style={{ color: INK2 }}>
                  {translateAdmin(language, 'admin.agentPanel.llm.keyField')}
                </label>
                <span
                  data-agent-llm-key
                  className="flex items-center rounded-chip ps-3 focus-within:outline-2 focus-within:outline-offset-2"
                  style={{ minHeight: 44, backgroundColor: SURFACE, border: `1px solid ${EDGE}`, outlineColor: BRAND }}
                >
                  {/* LE champ de mot de passe de l'application (`PasswordInput`) : masqué, révélable, jamais pré-rempli. */}
                  <PasswordInput
                    id={keyId}
                    value={apiKey}
                    onValue={setApiKey}
                    autoComplete="new-password"
                    describedBy={`${keyId}-hint`}
                    className="w-full bg-transparent py-2 text-body outline-none"
                    style={{ color: INK }}
                  />
                </span>
                <span id={`${keyId}-hint`} className="text-caption" style={{ color: INK2 }}>
                  {translateAdmin(language, 'admin.agentPanel.llm.keyHint')}
                </span>
              </div>
            }
          />
        ) : (
          <p data-agent-llm-readonly className="text-caption" style={{ color: INK2 }}>
            {translateAdmin(language, 'admin.agentPanel.llm.sovereignOnly')}
          </p>
        )}
      </div>
    </AdminFicheSection>
  );
}

const globalLabel = (language: AdminLanguage) => (key: string) =>
  translateAdmin(
    language,
    `admin.agentPanel.global.${key as 'enabled' | 'globalScanEnabled' | 'defaultProvider' | 'defaultModel' | 'globalDailyBudgetUsd' | 'maxConcurrentCalls' | 'messageFreshnessHours' | 'weekdayMaxConversations' | 'weekendMaxConversations' | 'systemPrompt'}`,
  );

function AgentGlobalBlock({ language, deps, gesture, ask }: BlockProps) {
  const global = useQuery({
    queryKey: agentGlobalConfigQueryKey(),
    queryFn: async ({ signal }) => unwrap(await loadAgentGlobalConfig({ ...deps, signal })),
    retry: false,
    refetchOnWindowFocus: false,
  });

  const title = translateAdmin(language, 'admin.agentPanel.global.title');
  const data = global.data;

  return (
    <AdminFicheSection id="agent-global" title={title}>
      {data === undefined ? (
        global.isPending ? (
          <AdminSkeleton rows={4} />
        ) : (
          <AdminErrorState language={language} onRetry={() => void global.refetch()} />
        )
      ) : (
        <div data-agent-global style={{ color: INK }}>
          <AgentSettingsForm
            key={data.updatedAt ?? 'initial'}
            id="global"
            language={language}
            specs={AGENT_GLOBAL_FIELDS}
            served={data.fields}
            labelOf={globalLabel(language)}
            saveLabel={translateAdmin(language, 'admin.agentPanel.global.save')}
            busy={gesture.busy === 'global'}
            error={null}
            onSubmit={(changes) =>
              ask({
                id: 'global',
                title: translateAdmin(language, 'admin.agentPanel.global.save'),
                body: translateAdmin(language, 'admin.agentPanel.global.confirm'),
                confirmLabel: translateAdmin(language, 'admin.agentPanel.global.save'),
                tone: 'primary',
                act: () => saveAgentGlobalConfig({ ...deps, changes }),
                success: translateAdmin(language, 'admin.agentPanel.global.saved'),
              })
            }
          />
        </div>
      )}
    </AdminFicheSection>
  );
}
