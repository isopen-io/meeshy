import { useQuery } from '@tanstack/react-query';

import { AdminBadge, AdminInterpretedBadge } from '@/components/admin/badges';
import { AdminEntityChip, AdminEntityIdentity } from '@/components/admin/entity-chip';
import { AdminEntityList, type AdminColumn } from '@/components/admin/entity-list';
import { AdminListToolbar, type AdminToolbarFilter } from '@/components/admin/list-toolbar';
import { AdminMetaPanel, AdminMetaRow, AdminMomentText, AdminTechnicalId } from '@/components/admin/meta';
import { AdminErrorState } from '@/components/admin/states';
import { Sheet } from '@/components/sheet';
import {
  AGENT_OUTCOMES,
  AGENT_TRIGGERS,
  agentConversationRefOf,
  interpretAgentOutcome,
  interpretAgentTrigger,
} from '@/lib/admin/agent-model';
import { NARROW_LIST_FRAME, useLocalAdminList } from '@/lib/admin/conversation-paged-list';
import { formatCount, formatMoney } from '@/lib/admin/interpret/numbers';
import { adminMomentOf, formatDuration } from '@/lib/admin/interpret/time';
import type { AdminDeps } from '@/lib/api/admin';
import {
  ADMIN_AGENT_PAGE_SIZES,
  agentScanLogQueryKey,
  agentScanLogsQueryKey,
  agentTrackedQueryKey,
  loadAgentScanLog,
  loadAgentScanLogs,
  loadAgentTracked,
  type AgentScanLogRow,
  type AgentTrackedConversation,
} from '@/lib/api/admin-agent';
import { unwrap } from '@/lib/api/client';
import { translateAdmin, type AdminLanguage } from '@/lib/i18n-admin-catalog';
import type { AnnouncementTone } from '@/lib/view/use-live-announcer';
import type { AdminOption } from '@/routes/admin-table';
import { AdminSkeleton } from '@/routes/admin-parts';

import { AgentRelaunchControl } from './admin-agent-controls';

/**
 * **LES DEUX LISTES DE L'AGENT** (#6733, #8876) — les conversations SUIVIES
 * (recherche par titre, état, membres pilotés, dernière réponse, et le pilotage
 * en ligne) et le JOURNAL des scans (issue et déclencheur en mots, filtrables ;
 * chaque ligne ouvre son détail).
 *
 * ## Nommées, mais pas plus que ce que la passerelle sert
 *
 * Ces routes servent le titre et le type de la conversation, jamais ses membres :
 * une conversation privée sans titre se dit « Conversation sans titre » ici, et
 * « Awa et Jean » sur sa fiche — un clic plus loin, `AdminEntityIdentity` en est
 * le lien. Les membres PILOTÉS ne sont désignés que par leur NOMBRE : seule la vue
 * en direct (`AgentConversationControl`) résout leurs noms.
 *
 * ## Paginées par PAGE, présentées par OFFSET
 *
 * La passerelle lit `?page=` ; la manette commune parle offset. `loadAgentTracked`
 * et `loadAgentScanLogs` font la conversion, et `useLocalAdminList` tient l'état
 * dans l'écran — deux listes sur une même adresse ne se piétineraient pas.
 */
const defaultNow = (): Date => new Date();

const option = (value: string, label: string): AdminOption => ({ value, label });

type ListProps = {
  readonly language: AdminLanguage;
  readonly deps: AdminDeps;
  readonly now?: () => Date;
};

export function AgentTrackedList({
  language,
  deps,
  now = defaultNow,
  announce,
}: ListProps & { readonly announce: (message: string, tone?: AnnouncementTone) => void }) {
  const list = useLocalAdminList<AgentTrackedConversation, never>({
    queryKey: (state) => agentTrackedQueryKey(state.offset, state.limit, state.q),
    load: (state, signal) => loadAgentTracked({ ...deps, offset: state.offset, limit: state.limit, search: state.q, signal }),
    pageSizes: ADMIN_AGENT_PAGE_SIZES,
    staleTime: 15_000,
  });

  const columns: readonly AdminColumn<AgentTrackedConversation>[] = [
    {
      id: 'conversation',
      header: translateAdmin(language, 'admin.agentPanel.tracked.col.conversation'),
      primary: true,
      cell: (row) => <AdminEntityIdentity language={language} entity={agentConversationRefOf(row, language)} />,
    },
    {
      id: 'state',
      header: translateAdmin(language, 'admin.agentPanel.tracked.col.state'),
      cell: (row) => (
        <span className="flex flex-wrap gap-1">
          <AdminBadge tone={row.enabled ? 'success' : 'neutral'} glyph={row.enabled ? 'checkCircle' : 'prohibit'}>
            {translateAdmin(language, row.enabled ? 'admin.agentPanel.state.on' : 'admin.agentPanel.state.off')}
          </AdminBadge>
          {row.isScanning ? (
            <AdminBadge tone="info" glyph="hourglass">
              {translateAdmin(language, 'admin.agentPanel.state.scanning')}
            </AdminBadge>
          ) : null}
        </span>
      ),
    },
    {
      id: 'users',
      header: translateAdmin(language, 'admin.agentPanel.tracked.col.users'),
      align: 'end',
      cell: (row) => formatCount(row.controlledUsersCount, language),
    },
    {
      id: 'messages',
      header: translateAdmin(language, 'admin.agentPanel.tracked.col.messages'),
      align: 'end',
      cell: (row) => formatCount(row.messagesSent, language),
    },
    {
      id: 'lastResponse',
      header: translateAdmin(language, 'admin.agentPanel.tracked.col.lastResponse'),
      priority: 3,
      cell: (row) =>
        row.lastResponseAt === null ? (
          translateAdmin(language, 'admin.agentPanel.lastResponse.never')
        ) : (
          <AdminMomentText moment={adminMomentOf(row.lastResponseAt, now(), language)} />
        ),
    },
    {
      id: 'control',
      header: translateAdmin(language, 'admin.agentPanel.tracked.col.control'),
      cell: (row) => (
        <AgentRelaunchControl
          conversationId={row.conversationId}
          language={language}
          deps={deps}
          isScanning={row.isScanning}
          currentNode={row.currentNode}
          onAnnounce={announce}
        />
      ),
    },
  ];

  const total = list.query.data?.total;

  return (
    <div className={NARROW_LIST_FRAME}>
      <AdminEntityList
        language={language}
        section="agent"
        list={list}
        columns={columns}
        rowKey={(row) => row.conversationId}
        rowTarget={(row) => ({ kind: 'entity', entity: 'conversation', id: row.conversationId })}
        caption={translateAdmin(language, 'admin.agentPanel.tracked.caption')}
        toolbar={
          <AdminListToolbar
            language={language}
            search={{ label: translateAdmin(language, 'admin.agentPanel.tracked.search'), value: list.draft, onChange: list.setDraft }}
            onReset={list.reset}
            {...(total === undefined ? {} : { trailing: translateAdmin(language, 'admin.agentPanel.tracked.count', { count: formatCount(total, language) }) })}
          />
        }
        empty={{ title: translateAdmin(language, 'admin.agentPanel.tracked.empty'), hint: translateAdmin(language, 'admin.agentPanel.tracked.emptyHint') }}
        filteredEmpty={{ title: translateAdmin(language, 'admin.agentPanel.tracked.filteredEmpty') }}
        pageSizes={ADMIN_AGENT_PAGE_SIZES}
      />
    </div>
  );
}

/** Une ligne du journal : la conversation nommée ET un bouton qui ouvre le détail du scan — le clavier y arrive, pas seulement la souris. */
function LogOpenCell({
  language,
  row,
  onOpen,
}: {
  readonly language: AdminLanguage;
  readonly row: AgentScanLogRow;
  readonly onOpen: () => void;
}) {
  const entity = agentConversationRefOf(row, language);
  return (
    <button
      type="button"
      data-agent-log-open={row.id}
      aria-label={translateAdmin(language, 'admin.agentPanel.logs.open', { name: entity.label })}
      onClick={onOpen}
      className="flex w-full min-w-0 items-center text-start focus-visible:outline-2 focus-visible:outline-offset-2"
      style={{ minHeight: 44, outlineColor: 'var(--color-ios-brand)' }}
    >
      <AdminEntityIdentity language={language} entity={entity} />
    </button>
  );
}

export function AgentLogList({
  language,
  deps,
  now = defaultNow,
  onOpen,
}: ListProps & { readonly onOpen: (logId: string) => void }) {
  const list = useLocalAdminList<AgentScanLogRow, 'outcome' | 'trigger'>({
    queryKey: (state) => agentScanLogsQueryKey(state.offset, state.limit, state.filters.outcome ?? '', state.filters.trigger ?? ''),
    load: (state, signal) =>
      loadAgentScanLogs({
        ...deps,
        offset: state.offset,
        limit: state.limit,
        outcome: state.filters.outcome ?? '',
        trigger: state.filters.trigger ?? '',
        signal,
      }),
    pageSizes: ADMIN_AGENT_PAGE_SIZES,
    staleTime: 15_000,
  });

  const all = translateAdmin(language, 'admin.list.all');
  const filter = (id: 'outcome' | 'trigger', label: string, options: readonly AdminOption[]): AdminToolbarFilter => ({
    id,
    label,
    value: list.state.filters[id] ?? '',
    options,
    onChange: (value) => list.filter(id, value === '' ? null : value),
  });

  const filters: readonly AdminToolbarFilter[] = [
    filter('outcome', translateAdmin(language, 'admin.agentPanel.logs.filter.outcome'), [
      option('', all),
      ...AGENT_OUTCOMES.map((outcome) => option(outcome, interpretAgentOutcome(outcome, language).label)),
    ]),
    filter('trigger', translateAdmin(language, 'admin.agentPanel.logs.filter.trigger'), [
      option('', all),
      ...AGENT_TRIGGERS.map((trigger) => option(trigger, interpretAgentTrigger(trigger, language).label)),
    ]),
  ];

  const columns: readonly AdminColumn<AgentScanLogRow>[] = [
    {
      id: 'conversation',
      header: translateAdmin(language, 'admin.agentPanel.logs.col.conversation'),
      primary: true,
      cell: (row) => <LogOpenCell language={language} row={row} onOpen={() => onOpen(row.id)} />,
    },
    {
      id: 'started',
      header: translateAdmin(language, 'admin.agentPanel.logs.col.started'),
      cell: (row) => (
        <span className="whitespace-nowrap">
          <AdminMomentText moment={adminMomentOf(row.startedAt, now(), language)} />
        </span>
      ),
    },
    {
      id: 'trigger',
      header: translateAdmin(language, 'admin.agentPanel.logs.col.trigger'),
      cell: (row) => <AdminInterpretedBadge value={interpretAgentTrigger(row.trigger, language)} />,
    },
    {
      id: 'outcome',
      header: translateAdmin(language, 'admin.agentPanel.logs.col.outcome'),
      cell: (row) => <AdminInterpretedBadge value={interpretAgentOutcome(row.outcome, language)} />,
    },
    {
      id: 'messages',
      header: translateAdmin(language, 'admin.agentPanel.logs.col.messages'),
      align: 'end',
      cell: (row) => formatCount(row.messagesSent, language),
    },
    {
      id: 'duration',
      header: translateAdmin(language, 'admin.agentPanel.logs.col.duration'),
      align: 'end',
      priority: 3,
      cell: (row) => formatDuration(row.durationMs, 'ms', language),
    },
  ];

  const total = list.query.data?.total;

  return (
    <div className={NARROW_LIST_FRAME}>
      <AdminEntityList
        language={language}
        section="agent"
        list={list}
        columns={columns}
        rowKey={(row) => row.id}
        rowTarget={() => null}
        caption={translateAdmin(language, 'admin.agentPanel.logs.caption')}
        toolbar={
          <AdminListToolbar
            language={language}
            filters={filters}
            onReset={list.reset}
            {...(total === undefined ? {} : { trailing: translateAdmin(language, 'admin.agentPanel.logs.count', { count: formatCount(total, language) }) })}
          />
        }
        empty={{ title: translateAdmin(language, 'admin.agentPanel.logs.empty'), hint: translateAdmin(language, 'admin.agentPanel.logs.emptyHint') }}
        filteredEmpty={{ title: translateAdmin(language, 'admin.agentPanel.logs.filteredEmpty') }}
        pageSizes={ADMIN_AGENT_PAGE_SIZES}
      />
    </div>
  );
}

/**
 * LE DÉTAIL D'UN SCAN — une modale, parce que le journal est une LISTE qu'on
 * parcourt : ouvrir un détail à sa propre adresse ferait perdre la place dans la
 * liste au retour, et le journal se lit ligne après ligne.
 *
 * Il sert ce que la ligne NE PORTE PAS (réactions, messages écartés, membres
 * joués, jetons, coût estimé) : sinon ouvrir serait un geste sans effet (loi 4).
 * Les membres joués ne sont comptés, jamais désignés : la route ne sert que leurs
 * identifiants.
 */
export function AgentLogDetailSheet({
  logId,
  language,
  deps,
  now = defaultNow,
  onClose,
}: {
  readonly logId: string;
  readonly language: AdminLanguage;
  readonly deps: AdminDeps;
  readonly now?: () => Date;
  readonly onClose: () => void;
}) {
  const detail = useQuery({
    queryKey: agentScanLogQueryKey(logId),
    queryFn: async ({ signal }) => unwrap(await loadAgentScanLog({ ...deps, logId, signal })),
    retry: false,
    refetchOnWindowFocus: false,
  });

  const log = detail.data;

  return (
    <Sheet title={translateAdmin(language, 'admin.agentPanel.detail.title')} bodyAs="div" closeLabel={translateAdmin(language, 'admin.kit.close')} onClose={onClose}>
      <div className="grid gap-3 px-4 pb-6" data-agent-log-detail={logId}>
        {log === undefined ? (
          detail.isPending ? (
            <AdminSkeleton rows={4} />
          ) : (
            <AdminErrorState language={language} onRetry={() => void detail.refetch()} />
          )
        ) : (
          <AdminMetaPanel title={translateAdmin(language, 'admin.kit.meta.title')}>
            <AdminMetaRow
              anchor="conversation"
              label={translateAdmin(language, 'admin.agentPanel.detail.conversation')}
              value={<AdminEntityChip language={language} size="sm" entity={agentConversationRefOf(log, language)} />}
            />
            <AdminMetaRow
              anchor="started"
              label={translateAdmin(language, 'admin.agentPanel.detail.started')}
              value={<AdminMomentText moment={adminMomentOf(log.startedAt, now(), language)} variant="both" />}
            />
            <AdminMetaRow
              anchor="trigger"
              label={translateAdmin(language, 'admin.agentPanel.logs.col.trigger')}
              value={<AdminInterpretedBadge value={interpretAgentTrigger(log.trigger, language)} />}
              explain={interpretAgentTrigger(log.trigger, language).explain}
            />
            <AdminMetaRow
              anchor="outcome"
              label={translateAdmin(language, 'admin.agentPanel.logs.col.outcome')}
              value={<AdminInterpretedBadge value={interpretAgentOutcome(log.outcome, language)} />}
              explain={interpretAgentOutcome(log.outcome, language).explain}
            />
            <AdminMetaRow anchor="duration" label={translateAdmin(language, 'admin.agentPanel.logs.col.duration')} value={formatDuration(log.durationMs, 'ms', language)} />
            <AdminMetaRow anchor="messages" label={translateAdmin(language, 'admin.agentPanel.logs.col.messages')} value={formatCount(log.messagesSent, language)} />
            <AdminMetaRow anchor="reactions" label={translateAdmin(language, 'admin.agentPanel.detail.reactions')} value={formatCount(log.reactionsSent, language)} />
            <AdminMetaRow
              anchor="rejected"
              label={translateAdmin(language, 'admin.agentPanel.detail.rejected')}
              value={formatCount(log.messagesRejected, language)}
              explain={log.messagesRejected === 0 ? null : translateAdmin(language, 'admin.agentPanel.detail.rejectedExplain')}
            />
            <AdminMetaRow anchor="users" label={translateAdmin(language, 'admin.agentPanel.detail.users')} value={formatCount(log.userIdsUsed.length, language)} />
            <AdminMetaRow
              anchor="tokens"
              label={translateAdmin(language, 'admin.agentPanel.detail.tokens')}
              value={`${formatCount(log.totalInputTokens, language)} / ${formatCount(log.totalOutputTokens, language)}`}
            />
            <AdminMetaRow anchor="cost" label={translateAdmin(language, 'admin.agentPanel.detail.cost')} value={formatMoney(log.estimatedCostUsd, language)} />
            <AdminTechnicalId language={language} id={log.id} />
          </AdminMetaPanel>
        )}
      </div>
    </Sheet>
  );
}
