import { useQuery } from '@tanstack/react-query';
import { useId, useState } from 'react';

import { AdminBadge } from '@/components/admin/badges';
import { AdminButton } from '@/components/admin/button';
import { AdminFicheSection } from '@/components/admin/fiche';
import { AdminEmptyState, AdminErrorState, AdminSkeleton } from '@/components/admin/states';
import { BRAND, EDGE, INK, INK2, SURFACE } from '@/components/admin/tone';
import { AGENT_TOPIC_FIELDS, topicChangesOf, topicDraftOf, topicInputOf, type AgentTopicDraft, type AgentTopicField } from '@/lib/admin/agent-topic-form';
import { formatCount } from '@/lib/admin/interpret/numbers';
import { formatDuration } from '@/lib/admin/interpret/time';
import type { AdminDeps } from '@/lib/api/admin';
import {
  agentTopicQueryKey,
  agentTopicsQueryKey,
  createAgentTopic,
  deleteAgentTopic,
  loadAgentTopic,
  loadAgentTopics,
  testAgentTopic,
  updateAgentTopic,
  type AgentTopic,
  type AgentTopicTest,
} from '@/lib/api/admin-agent-topics';
import { unwrap } from '@/lib/api/client';
import { translateAdmin, type AdminLanguage } from '@/lib/i18n-admin-catalog';
import { useOnline } from '@/lib/net/online';

import { failureMessage, useAgentConfirm, useAgentGesture, type AgentGesture } from './admin-agent-form';

/**
 * **LA MODALE « SUJETS »** (lot Agent complet) — le catalogue des sujets que le
 * stratège de l'agent peut lancer (`GET /topics?active=all`), et, pour chacun :
 * l'ouvrir (`GET /topics/:id`), le modifier (`PATCH`, seuls les champs changés),
 * l'essayer contre un texte (`POST /topics/:id/test`), le désactiver (`DELETE`)
 * ou le supprimer (`DELETE ?hard=true`), ces deux derniers confirmés. Un sujet
 * neuf se crée (`POST /topics`).
 *
 * ## Le refus d'un motif dangereux se lit tel que la passerelle l'écrit
 *
 * `certifyPatterns` refuse en 400 un motif à retour arrière catastrophique et
 * NOMME le motif et la raison. Le message est posé sous le formulaire, en alerte,
 * et annoncé — jamais remplacé par un « échec » qui ferait deviner lequel.
 */
type View = { readonly kind: 'list' } | { readonly kind: 'new' } | { readonly kind: 'edit'; readonly id: string };

export function AgentTopicsDetail({ language, deps }: { readonly language: AdminLanguage; readonly deps: AdminDeps }) {
  const gesture = useAgentGesture(language);
  const confirm = useAgentConfirm(language, gesture);
  const [view, setView] = useState<View>({ kind: 'list' });

  return (
    <AdminFicheSection id="agent-topics" title={translateAdmin(language, 'admin.agentPanel.card.topics')}>
      {view.kind === 'list' ? (
        <TopicList language={language} deps={deps} ask={confirm.ask} onOpen={(id) => setView({ kind: 'edit', id })} onNew={() => setView({ kind: 'new' })} />
      ) : view.kind === 'new' ? (
        <TopicEditor language={language} deps={deps} topic={null} gesture={gesture} onBack={() => setView({ kind: 'list' })} onCreated={(id) => setView({ kind: 'edit', id })} />
      ) : (
        <TopicLoader language={language} deps={deps} id={view.id} gesture={gesture} onBack={() => setView({ kind: 'list' })} />
      )}
      {confirm.node}
      {gesture.announcement}
    </AdminFicheSection>
  );
}

function TopicList({
  language,
  deps,
  ask,
  onOpen,
  onNew,
}: {
  readonly language: AdminLanguage;
  readonly deps: AdminDeps;
  readonly ask: ReturnType<typeof useAgentConfirm>['ask'];
  readonly onOpen: (id: string) => void;
  readonly onNew: () => void;
}) {
  const online = useOnline();
  const topics = useQuery({
    queryKey: agentTopicsQueryKey(),
    queryFn: async ({ signal }) => unwrap(await loadAgentTopics({ ...deps, signal })),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const rows = topics.data;

  return (
    <div className="grid gap-3">
      <div className="flex justify-end">
        <AdminButton tone="primary" disabled={!online} data={{ 'data-agent-topic-new': '' }} onClick={onNew}>
          {translateAdmin(language, 'admin.agentPanel.topics.new')}
        </AdminButton>
      </div>
      {rows === undefined ? (
        topics.isPending ? (
          <AdminSkeleton rows={3} />
        ) : (
          <AdminErrorState language={language} onRetry={() => void topics.refetch()} />
        )
      ) : rows.length === 0 ? (
        <AdminEmptyState title={translateAdmin(language, 'admin.agentPanel.topics.empty')} hint={translateAdmin(language, 'admin.agentPanel.topics.emptyHint')} glyph="chats" />
      ) : (
        <ul className="grid gap-3" data-agent-topics>
          {rows.map((topic) => (
            <li key={topic.id} data-agent-topic={topic.id} className="grid gap-2 rounded-card p-3" style={{ backgroundColor: SURFACE, border: `1px solid ${EDGE}` }}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-body font-semibold" style={{ color: INK }}>
                  {topic.label}
                </span>
                <AdminBadge tone={topic.isActive ? 'success' : 'neutral'} glyph={topic.isActive ? 'checkCircle' : 'prohibit'}>
                  {translateAdmin(language, topic.isActive ? 'admin.agentPanel.topics.active' : 'admin.agentPanel.topics.inactive')}
                </AdminBadge>
              </div>
              {topic.description === null ? null : (
                <p className="text-caption" style={{ color: INK2 }}>
                  {topic.description}
                </p>
              )}
              <p className="text-caption" style={{ color: INK2 }}>
                {translateAdmin(language, 'admin.agentPanel.topics.meta', {
                  priority: formatCount(topic.priority, language),
                  cooldown: formatDuration(topic.cooldownMinutes * 60, 's', language),
                  patterns: formatCount(topic.keywordPatterns.length, language),
                })}
              </p>
              <div className="flex flex-wrap gap-2">
                <AdminButton data={{ 'data-agent-topic-open': topic.id }} label={translateAdmin(language, 'admin.agentPanel.topics.edit', { label: topic.label })} onClick={() => onOpen(topic.id)}>
                  {translateAdmin(language, 'admin.agentPanel.topics.edit', { label: topic.label })}
                </AdminButton>
                {topic.isActive ? (
                  <AdminButton
                    disabled={!online}
                    data={{ 'data-agent-topic-deactivate': topic.id }}
                    onClick={() =>
                      ask({
                        id: `deactivate:${topic.id}`,
                        title: translateAdmin(language, 'admin.agentPanel.topics.deactivate'),
                        body: translateAdmin(language, 'admin.agentPanel.topics.deactivateBody', { label: topic.label }),
                        confirmLabel: translateAdmin(language, 'admin.agentPanel.topics.deactivate'),
                        tone: 'danger',
                        act: () => deleteAgentTopic({ ...deps, id: topic.id, hard: false }),
                        success: translateAdmin(language, 'admin.agentPanel.topics.deactivated'),
                      })
                    }
                  >
                    {translateAdmin(language, 'admin.agentPanel.topics.deactivate')}
                  </AdminButton>
                ) : null}
                <AdminButton
                  tone="danger"
                  disabled={!online}
                  data={{ 'data-agent-topic-delete': topic.id }}
                  onClick={() =>
                    ask({
                      id: `delete:${topic.id}`,
                      title: translateAdmin(language, 'admin.agentPanel.topics.delete'),
                      body: translateAdmin(language, 'admin.agentPanel.topics.deleteBody', { label: topic.label }),
                      confirmLabel: translateAdmin(language, 'admin.agentPanel.topics.delete'),
                      tone: 'danger',
                      act: () => deleteAgentTopic({ ...deps, id: topic.id, hard: true }),
                      success: translateAdmin(language, 'admin.agentPanel.topics.deleted'),
                    })
                  }
                >
                  {translateAdmin(language, 'admin.agentPanel.topics.delete')}
                </AdminButton>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TopicLoader({
  language,
  deps,
  id,
  gesture,
  onBack,
}: {
  readonly language: AdminLanguage;
  readonly deps: AdminDeps;
  readonly id: string;
  readonly gesture: AgentGesture;
  readonly onBack: () => void;
}) {
  const topic = useQuery({
    queryKey: agentTopicQueryKey(id),
    queryFn: async ({ signal }) => unwrap(await loadAgentTopic({ ...deps, id, signal })),
    retry: false,
    refetchOnWindowFocus: false,
  });
  if (topic.data === undefined) {
    return topic.isPending ? <AdminSkeleton rows={4} /> : <AdminErrorState language={language} onRetry={() => void topic.refetch()} />;
  }
  return (
    <div className="grid gap-6">
      <TopicEditor key={JSON.stringify(topic.data)} language={language} deps={deps} topic={topic.data} gesture={gesture} onBack={onBack} onCreated={() => undefined} />
      <TopicTester language={language} deps={deps} id={id} />
    </div>
  );
}

const FIELD_STYLE = { minHeight: 44, backgroundColor: SURFACE, border: `1px solid ${EDGE}`, color: INK, outlineColor: BRAND } as const;
const FIELD_CLASS = 'w-full rounded-chip px-3 text-body focus-visible:outline-2 focus-visible:outline-offset-2';
const MULTILINE: ReadonlySet<AgentTopicField> = new Set(['keywordPatterns', 'instructionTemplate', 'examples', 'description']);

function TopicEditor({
  language,
  deps,
  topic,
  gesture,
  onBack,
  onCreated,
}: {
  readonly language: AdminLanguage;
  readonly deps: AdminDeps;
  readonly topic: AgentTopic | null;
  readonly gesture: AgentGesture;
  readonly onBack: () => void;
  readonly onCreated: (id: string) => void;
}) {
  const online = useOnline();
  const formId = useId();
  const [draft, setDraft] = useState<AgentTopicDraft>(() => topicDraftOf(topic));
  const [invalid, setInvalid] = useState<readonly AgentTopicField[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const saveId = topic === null ? 'topic-create' : `topic-save:${topic.id}`;
  const label = (field: AgentTopicField) => translateAdmin(language, `admin.agentPanel.topics.field.${field}`);

  const save = async () => {
    const verdict = topicInputOf(draft);
    if (!verdict.ok) {
      setInvalid(verdict.invalid);
      setNotice(translateAdmin(language, 'admin.agentPanel.form.invalid', { fields: verdict.invalid.map(label).join(', ') }));
      return;
    }
    setInvalid([]);
    if (topic === null) {
      let created: string | null = null;
      const done = await gesture.run(
        saveId,
        async () => {
          const result = await createAgentTopic({ ...deps, input: verdict.input });
          if (result.ok) created = result.data.id;
          return result;
        },
        translateAdmin(language, 'admin.agentPanel.topics.created'),
      );
      setNotice(null);
      if (done && created !== null) onCreated(created);
      return;
    }
    const changes = topicChangesOf(topic, verdict.input);
    if (Object.keys(changes).length === 0) {
      setNotice(translateAdmin(language, 'admin.agentPanel.form.unchanged'));
      return;
    }
    setNotice(null);
    await gesture.run(saveId, () => updateAgentTopic({ ...deps, id: topic.id, changes }), translateAdmin(language, 'admin.agentPanel.topics.saved'));
  };

  const refusal = gesture.errorOf(saveId);
  const message = notice ?? refusal;

  return (
    <form
      data-agent-topic-form={topic?.id ?? 'new'}
      className="grid gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-body font-semibold" style={{ color: INK }}>
          {topic === null ? translateAdmin(language, 'admin.agentPanel.topics.new') : translateAdmin(language, 'admin.agentPanel.topics.edit', { label: topic.label })}
        </h3>
        <AdminButton data={{ 'data-agent-topic-back': '' }} onClick={onBack}>
          {translateAdmin(language, 'admin.agentPanel.topics.back')}
        </AdminButton>
      </div>
      <div className="grid gap-3 @lg:grid-cols-2">
        {AGENT_TOPIC_FIELDS.map((field) => {
          const id = `${formId}-${field}`;
          const value = draft[field];
          const style = invalid.includes(field) ? { ...FIELD_STYLE, border: '1px solid var(--color-danger)' } : FIELD_STYLE;
          if (typeof value === 'boolean') {
            return (
              <label key={field} className="flex items-center gap-3 text-body" style={{ minHeight: 44, color: INK }}>
                <input
                  type="checkbox"
                  data-agent-topic-field={field}
                  checked={value}
                  onChange={(event) => setDraft((current) => ({ ...current, [field]: event.currentTarget.checked }))}
                  className="size-5 shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2"
                  style={{ accentColor: BRAND, outlineColor: BRAND }}
                />
                {label(field)}
              </label>
            );
          }
          const update = (next: string) => setDraft((current) => ({ ...current, [field]: next }));
          return (
            <div key={field} className={`grid gap-1 ${MULTILINE.has(field) ? '@lg:col-span-2' : ''}`.trim()}>
              <label htmlFor={id} className="text-caption font-medium" style={{ color: INK2 }}>
                {label(field)}
              </label>
              {MULTILINE.has(field) ? (
                <textarea
                  id={id}
                  data-agent-topic-field={field}
                  rows={3}
                  value={value}
                  aria-invalid={invalid.includes(field)}
                  onInput={(event) => update(event.currentTarget.value)}
                  onChange={() => undefined}
                  className={`${FIELD_CLASS} py-2`}
                  style={style}
                />
              ) : (
                <input
                  id={id}
                  data-agent-topic-field={field}
                  type="text"
                  {...(field === 'cooldownMinutes' || field === 'priority' ? { inputMode: 'numeric' as const } : {})}
                  value={value}
                  aria-invalid={invalid.includes(field)}
                  onInput={(event) => update(event.currentTarget.value)}
                  onChange={() => undefined}
                  className={FIELD_CLASS}
                  style={style}
                />
              )}
            </div>
          );
        })}
      </div>
      {message === null ? null : (
        <p role="alert" data-agent-topic-error className="whitespace-pre-line break-words text-caption font-medium" style={{ color: notice !== null && invalid.length === 0 ? INK2 : 'var(--color-danger)' }}>
          {message}
        </p>
      )}
      <div className="flex justify-end">
        <AdminButton type="submit" tone="primary" disabled={!online} busy={gesture.busy === saveId} data={{ 'data-agent-topic-save': topic?.id ?? 'new' }}>
          {translateAdmin(language, 'admin.agentPanel.topics.save')}
        </AdminButton>
      </div>
    </form>
  );
}

function TopicTester({ language, deps, id }: { readonly language: AdminLanguage; readonly deps: AdminDeps; readonly id: string }) {
  const online = useOnline();
  const fieldId = useId();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AgentTopicTest | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    const outcome = await testAgentTopic({ ...deps, id, sampleText: text.trim() });
    setBusy(false);
    if (outcome.ok) setResult(outcome.data);
    else {
      setResult(null);
      setError(failureMessage(language, outcome));
    }
  };

  const hits = result?.matches.filter((entry) => entry.count > 0) ?? [];

  return (
    <div className="grid gap-2" data-agent-topic-tester={id}>
      <h3 className="text-body font-semibold" style={{ color: INK }}>
        {translateAdmin(language, 'admin.agentPanel.topics.test')}
      </h3>
      <label htmlFor={fieldId} className="text-caption font-medium" style={{ color: INK2 }}>
        {translateAdmin(language, 'admin.agentPanel.topics.testLabel')}
      </label>
      <textarea
        id={fieldId}
        data-agent-topic-sample
        rows={3}
        maxLength={5000}
        value={text}
        onInput={(event) => setText(event.currentTarget.value)}
        onChange={() => undefined}
        className={`${FIELD_CLASS} py-2`}
        style={FIELD_STYLE}
      />
      <div className="flex justify-end">
        <AdminButton disabled={text.trim() === '' || !online} busy={busy} data={{ 'data-agent-topic-test': id }} onClick={() => void run()}>
          {translateAdmin(language, 'admin.agentPanel.topics.testRun')}
        </AdminButton>
      </div>
      <div role="status" aria-live="polite" data-agent-topic-result className="grid gap-1">
        {error === null ? null : (
          <p className="text-caption font-medium" style={{ color: 'var(--color-danger)' }}>
            {error}
          </p>
        )}
        {result === null ? null : hits.length === 0 && result.refused.length === 0 ? (
          <p className="text-caption" style={{ color: INK2 }}>
            {translateAdmin(language, 'admin.agentPanel.topics.testNone')}
          </p>
        ) : (
          <ul className="grid gap-1">
            {hits.map((entry) => (
              <li key={entry.pattern} className="break-words text-caption" style={{ color: INK }}>
                {translateAdmin(language, 'admin.agentPanel.topics.testHit', { pattern: entry.pattern, count: formatCount(entry.count, language) })}
              </li>
            ))}
            {result.refused.map((entry) => (
              <li key={`refused-${entry.pattern}`} className="break-words text-caption" style={{ color: 'var(--color-danger)' }}>
                {translateAdmin(language, 'admin.agentPanel.topics.testRefused', { pattern: entry.pattern, message: entry.message })}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
