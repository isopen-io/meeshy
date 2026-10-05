import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { AdminButton } from '@/components/admin/button';
import { AdminDetailSheet } from '@/components/admin/detail-sheet';
import { AdminFicheSection } from '@/components/admin/fiche';
import { AdminMetaRow, AdminMomentText } from '@/components/admin/meta';
import { AdminErrorState, AdminInlineNotice } from '@/components/admin/states';
import { EDGE, INK, INK2, SURFACE } from '@/components/admin/tone';
import { AGENT_CONFIG_FIELDS } from '@/lib/admin/agent-settings-form';
import { languageName, sentenceCase } from '@/lib/admin/interpret/language';
import { personLabel } from '@/lib/admin/interpret/labels';
import { formatCount } from '@/lib/admin/interpret/numbers';
import { adminMomentOf, formatDuration } from '@/lib/admin/interpret/time';
import type { AdminDeps } from '@/lib/api/admin';
import {
  agentConfigQueryKey,
  agentMessagesQueryKey,
  agentScheduleQueryKey,
  agentSummaryQueryKey,
  deleteAgentConfig,
  loadAgentConfig,
  loadAgentMessages,
  loadAgentSchedule,
  loadAgentSummary,
  resetAgentConversation,
  saveAgentConfig,
} from '@/lib/api/admin-agent-conversation';
import { unwrap } from '@/lib/api/client';
import { translateAdmin, type AdminLanguage } from '@/lib/i18n-admin-catalog';
import { useOnline } from '@/lib/net/online';
import { AdminSkeleton } from '@/routes/admin-parts';

import { AgentSettingsForm, useAgentConfirm, useAgentGesture, type AgentGesture } from './admin-agent-form';
import { AgentRolesBlock } from './admin-agent-roles';

/**
 * **L'AGENT SUR UNE CONVERSATION SUIVIE, EN ENTIER** (lot Agent complet) — la
 * modale qu'ouvre « Réglages » dans la liste des conversations suivies.
 *
 * Elle lit, chacune dans son bloc et avec ses propres états : les réglages
 * (`GET /configs/:id`, éditables), le résumé que l'agent tient (`/summary`), son
 * planning (`/schedule`), les membres pilotés et leurs rôles (`/roles`, nommés par
 * `/live`), et les messages qu'il a publiés (`/messages`, paginés). Elle offre
 * aussi d'ouvrir le journal restreint à la conversation.
 *
 * Une conversation SUIVIE n'a pas toujours de configuration (la liste compte aussi
 * celles où l'agent a seulement laissé des rôles ou une activité) : un 404 des
 * réglages, du résumé ou du planning se dit « pas encore », jamais « échec », et
 * enregistrer les réglages en crée une.
 *
 * ## Les gestes destructifs se confirment, et disent ce qu'ils effacent
 *
 * Supprimer la configuration (`DELETE /configs/:id`) et remettre la conversation à
 * zéro (`DELETE /reset/conversation/:id`) passent par `AdminConfirmSheet`, ton
 * danger, avec la liste de ce qui disparaît — et de ce qui RESTE (les messages
 * déjà publiés).
 */
export function AgentConversationSheet({
  language,
  deps,
  conversation,
  now,
  onClose,
  onShowLogs,
}: {
  readonly language: AdminLanguage;
  readonly deps: AdminDeps;
  readonly conversation: { readonly id: string; readonly name: string };
  readonly now: () => Date;
  readonly onClose: () => void;
  readonly onShowLogs: () => void;
}) {
  const gesture = useAgentGesture(language);
  const confirm = useAgentConfirm(language, gesture);
  const conversationId = conversation.id;

  return (
    <AdminDetailSheet
      language={language}
      id="agent-conversation"
      title={translateAdmin(language, 'admin.agentPanel.conv.title', { name: conversation.name })}
      open
      onClose={onClose}
    >
      <div data-agent-conversation-sheet={conversationId} className="grid gap-6">
        <ConfigBlock language={language} deps={deps} conversationId={conversationId} gesture={gesture} ask={confirm.ask} />
        <SummaryBlock language={language} deps={deps} conversationId={conversationId} now={now} />
        <ScheduleBlock language={language} deps={deps} conversationId={conversationId} now={now} />
        <AgentRolesBlock language={language} deps={deps} conversationId={conversationId} gesture={gesture} ask={confirm.ask} />
        <MessagesBlock language={language} deps={deps} conversationId={conversationId} now={now} />
        <div className="flex flex-wrap">
          <AdminButton onClick={onShowLogs} data={{ 'data-agent-conversation-logs': conversationId }}>
            {translateAdmin(language, 'admin.agentPanel.conv.logs')}
          </AdminButton>
        </div>
        <DangerBlock language={language} deps={deps} conversationId={conversationId} ask={confirm.ask} />
      </div>
      {confirm.node}
      {gesture.announcement}
    </AdminDetailSheet>
  );
}

type Ask = ReturnType<typeof useAgentConfirm>['ask'];
type BlockProps = { readonly language: AdminLanguage; readonly deps: AdminDeps; readonly conversationId: string };

const cfgLabel = (language: AdminLanguage) => (key: string) =>
  translateAdmin(
    language,
    `admin.agentPanel.cfg.${key as 'enabled' | 'autoPickupEnabled' | 'scanIntervalMinutes' | 'maxControlledUsers' | 'minResponsesPerCycle' | 'maxResponsesPerCycle' | 'reactionsEnabled' | 'maxReactionsPerCycle' | 'weekdayMaxMessages' | 'weekendMaxMessages' | 'minWordsPerMessage' | 'maxWordsPerMessage' | 'generationTemperature' | 'qualityGateEnabled' | 'webSearchEnabled' | 'agentInstructions'}`,
  );

function ConfigBlock({ language, deps, conversationId, gesture }: BlockProps & { readonly gesture: AgentGesture; readonly ask: Ask }) {
  const online = useOnline();
  const config = useQuery({
    queryKey: agentConfigQueryKey(conversationId),
    queryFn: async ({ signal }) => unwrap(await loadAgentConfig({ ...deps, conversationId, signal })),
    retry: false,
    refetchOnWindowFocus: false,
  });

  return (
    <AdminFicheSection id="agent-config" title={translateAdmin(language, 'admin.agentPanel.conv.settings')}>
      {config.isPending ? (
        <AdminSkeleton rows={4} />
      ) : config.isError ? (
        <AdminErrorState language={language} onRetry={() => void config.refetch()} />
      ) : (
        <div className="grid gap-3" data-agent-config={conversationId}>
          {config.data === null ? <AdminInlineNotice tone="info" text={translateAdmin(language, 'admin.agentPanel.conv.noConfig')} /> : null}
          <AgentSettingsForm
            key={config.data?.updatedAt ?? 'none'}
            id="conversation"
            language={language}
            specs={AGENT_CONFIG_FIELDS}
            served={config.data?.fields ?? {}}
            labelOf={cfgLabel(language)}
            saveLabel={translateAdmin(language, 'admin.agentPanel.conv.save')}
            busy={gesture.busy === 'config'}
            error={gesture.errorOf('config')}
            disabled={!online}
            onSubmit={(changes) =>
              void gesture.run('config', () => saveAgentConfig({ ...deps, conversationId, changes }), translateAdmin(language, 'admin.agentPanel.conv.saved'))
            }
          />
        </div>
      )}
    </AdminFicheSection>
  );
}

function SummaryBlock({ language, deps, conversationId, now }: BlockProps & { readonly now: () => Date }) {
  const summary = useQuery({
    queryKey: agentSummaryQueryKey(conversationId),
    queryFn: async ({ signal }) => unwrap(await loadAgentSummary({ ...deps, conversationId, signal })),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const data = summary.data;

  return (
    <AdminFicheSection id="agent-summary" title={translateAdmin(language, 'admin.agentPanel.conv.summary')}>
      {summary.isPending ? (
        <AdminSkeleton rows={2} />
      ) : summary.isError ? (
        <AdminErrorState language={language} onRetry={() => void summary.refetch()} />
      ) : data === null || data === undefined ? (
        <p className="text-caption" style={{ color: INK2 }}>
          {translateAdmin(language, 'admin.agentPanel.conv.summary.none')}
        </p>
      ) : (
        <div className="grid gap-3" data-agent-summary>
          <p className="max-w-prose whitespace-pre-line text-body" style={{ color: INK }}>
            {data.summary}
          </p>
          <dl className="grid gap-3 @lg:grid-cols-2">
            {data.currentTopics.length === 0 ? null : (
              <AdminMetaRow anchor="summary-topics" label={translateAdmin(language, 'admin.agentPanel.conv.summary.topics')} value={data.currentTopics.join(', ')} />
            )}
            {data.overallTone === null ? null : (
              <AdminMetaRow anchor="summary-tone" label={translateAdmin(language, 'admin.agentPanel.conv.summary.tone')} value={data.overallTone} />
            )}
            {data.healthScore === null ? null : (
              <AdminMetaRow
                anchor="summary-health"
                label={translateAdmin(language, 'admin.agentPanel.conv.summary.health')}
                value={translateAdmin(language, 'admin.agentPanel.conv.summary.healthValue', { score: formatCount(data.healthScore, language) })}
              />
            )}
            <AdminMetaRow anchor="summary-messages" label={translateAdmin(language, 'admin.agentPanel.conv.summary.messages')} value={formatCount(data.messageCount, language)} />
            {data.updatedAt === null ? null : (
              <AdminMetaRow
                anchor="summary-updated"
                label={translateAdmin(language, 'admin.agentPanel.conv.summary.updated')}
                value={<AdminMomentText moment={adminMomentOf(data.updatedAt, now(), language)} variant="both" />}
              />
            )}
          </dl>
        </div>
      )}
    </AdminFicheSection>
  );
}

function ScheduleBlock({ language, deps, conversationId, now }: BlockProps & { readonly now: () => Date }) {
  const schedule = useQuery({
    queryKey: agentScheduleQueryKey(conversationId),
    queryFn: async ({ signal }) => unwrap(await loadAgentSchedule({ ...deps, conversationId, signal })),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const data = schedule.data;
  const moment = (iso: string | null) =>
    iso === null ? translateAdmin(language, 'admin.agentPanel.conv.schedule.never') : <AdminMomentText moment={adminMomentOf(iso, now(), language)} variant="both" />;

  return (
    <AdminFicheSection id="agent-schedule" title={translateAdmin(language, 'admin.agentPanel.conv.schedule')}>
      {schedule.isPending ? (
        <AdminSkeleton rows={2} />
      ) : schedule.isError ? (
        <AdminErrorState language={language} onRetry={() => void schedule.refetch()} />
      ) : data === null || data === undefined ? (
        <p className="text-caption" style={{ color: INK2 }}>
          {translateAdmin(language, 'admin.agentPanel.conv.schedule.none')}
        </p>
      ) : (
        <dl className="grid gap-3 @lg:grid-cols-2" data-agent-schedule>
          <AdminMetaRow
            anchor="schedule-interval"
            label={translateAdmin(language, 'admin.agentPanel.conv.schedule.interval')}
            value={formatDuration(data.scanIntervalMinutes * 60, 's', language)}
          />
          <AdminMetaRow anchor="schedule-next" label={translateAdmin(language, 'admin.agentPanel.conv.schedule.next')} value={moment(data.nextScanAt)} />
          <AdminMetaRow anchor="schedule-last" label={translateAdmin(language, 'admin.agentPanel.conv.schedule.last')} value={moment(data.lastScanAt)} />
          <AdminMetaRow anchor="schedule-upcoming" label={translateAdmin(language, 'admin.agentPanel.conv.schedule.upcoming')} value={formatCount(data.upcomingCount, language)} />
          <AdminMetaRow
            anchor="schedule-budget"
            label={translateAdmin(language, 'admin.agentPanel.conv.schedule.budget')}
            value={translateAdmin(language, 'admin.agentPanel.conv.schedule.budgetValue', {
              used: formatCount(data.messagesUsed, language),
              max: formatCount(data.messagesMax, language),
            })}
          />
          <AdminMetaRow
            anchor="schedule-burst"
            label={translateAdmin(language, 'admin.agentPanel.conv.schedule.burst')}
            value={
              data.burstCooldownEndsAt === null ? (
                translateAdmin(language, 'admin.agentPanel.conv.schedule.burstNone')
              ) : (
                <span>
                  {translateAdmin(language, 'admin.agentPanel.conv.schedule.burstUntil', {
                    when: adminMomentOf(data.burstCooldownEndsAt, now(), language)?.absolute ?? '',
                  })}
                </span>
              )
            }
          />
        </dl>
      )}
    </AdminFicheSection>
  );
}

function MessagesBlock({ language, deps, conversationId, now }: BlockProps & { readonly now: () => Date }) {
  const [page, setPage] = useState(1);
  const messages = useQuery({
    queryKey: agentMessagesQueryKey(conversationId, page),
    queryFn: async ({ signal }) => unwrap(await loadAgentMessages({ ...deps, conversationId, page, signal })),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const data = messages.data;

  return (
    <AdminFicheSection id="agent-messages" title={translateAdmin(language, 'admin.agentPanel.conv.messages')}>
      {messages.isPending ? (
        <AdminSkeleton rows={3} />
      ) : messages.isError ? (
        <AdminErrorState language={language} onRetry={() => void messages.refetch()} />
      ) : data === null || data === undefined || data.rows.length === 0 ? (
        <p className="text-caption" style={{ color: INK2 }}>
          {translateAdmin(language, 'admin.agentPanel.conv.messages.empty')}
        </p>
      ) : (
        <div className="grid gap-3">
          <ul className="grid gap-2" data-agent-messages>
            {data.rows.map((message) => (
              <li key={message.id} className="grid gap-1 rounded-card p-3" style={{ backgroundColor: SURFACE, border: `1px solid ${EDGE}` }}>
                <span className="text-caption font-semibold" style={{ color: INK }}>
                  {personLabel({ displayName: message.senderName, username: message.senderUsername }, language)}
                  {message.language === null ? '' : ` · ${sentenceCase(languageName(message.language, language), language)}`}
                </span>
                <p className="whitespace-pre-line break-words text-body" style={{ color: INK }}>
                  {message.content}
                </p>
                <span className="text-caption" style={{ color: INK2 }}>
                  <AdminMomentText moment={adminMomentOf(message.createdAt, now(), language)} />
                </span>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap justify-between gap-2">
            <AdminButton disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} data={{ 'data-agent-messages-newer': '' }}>
              {translateAdmin(language, 'admin.agentPanel.conv.messages.newer')}
            </AdminButton>
            <AdminButton disabled={!data.hasMore} onClick={() => setPage((value) => value + 1)} data={{ 'data-agent-messages-older': '' }}>
              {translateAdmin(language, 'admin.agentPanel.conv.messages.older')}
            </AdminButton>
          </div>
        </div>
      )}
    </AdminFicheSection>
  );
}

function DangerBlock({ language, deps, conversationId, ask }: BlockProps & { readonly ask: Ask }) {
  const online = useOnline();
  return (
    <AdminFicheSection id="agent-danger" title={translateAdmin(language, 'admin.agentPanel.conv.danger')}>
      <div className="flex flex-wrap gap-2">
        <AdminButton
          tone="danger"
          disabled={!online}
          data={{ 'data-agent-config-delete': conversationId }}
          onClick={() =>
            ask({
              id: 'config-delete',
              title: translateAdmin(language, 'admin.agentPanel.conv.delete'),
              body: translateAdmin(language, 'admin.agentPanel.conv.deleteBody'),
              confirmLabel: translateAdmin(language, 'admin.agentPanel.conv.delete'),
              tone: 'danger',
              act: () => deleteAgentConfig({ ...deps, conversationId }),
              success: translateAdmin(language, 'admin.agentPanel.conv.deleted'),
            })
          }
        >
          {translateAdmin(language, 'admin.agentPanel.conv.delete')}
        </AdminButton>
        <AdminButton
          tone="danger"
          disabled={!online}
          data={{ 'data-agent-conversation-reset': conversationId }}
          onClick={() =>
            ask({
              id: 'conversation-reset',
              title: translateAdmin(language, 'admin.agentPanel.conv.reset'),
              body: translateAdmin(language, 'admin.agentPanel.conv.resetBody'),
              confirmLabel: translateAdmin(language, 'admin.agentPanel.conv.reset'),
              tone: 'danger',
              act: () => resetAgentConversation({ ...deps, conversationId }),
              success: translateAdmin(language, 'admin.agentPanel.conv.resetDone'),
            })
          }
        >
          {translateAdmin(language, 'admin.agentPanel.conv.reset')}
        </AdminButton>
      </div>
    </AdminFicheSection>
  );
}
