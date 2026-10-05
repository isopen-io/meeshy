import { useQuery } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

import { AdminDetailSheet } from '@/components/admin/detail-sheet';
import { AdminFicheSection } from '@/components/admin/fiche';
import { AdminPageHeader } from '@/components/admin/page-header';
import { AdminStatCard, AdminStatGrid } from '@/components/admin/stat-card';
import { AdminOfflineNotice } from '@/components/admin/states';
import { AdminSummaryCard, AdminSummaryGrid } from '@/components/admin/summary-card';
import { agentConversationRefOf } from '@/lib/admin/agent-model';
import { formatCount, formatPercent } from '@/lib/admin/interpret/numbers';
import { adminMomentOf } from '@/lib/admin/interpret/time';
import { useAdminOpen } from '@/lib/admin/use-admin-open';
import type { AdminDeps } from '@/lib/api/admin';
import { agentOverviewQueryKey, loadAgentOverview, type AgentOverview, type AgentTrackedConversation } from '@/lib/api/admin-agent';
import { unwrap } from '@/lib/api/client';
import { apiDeps } from '@/lib/api/deps';
import { translateAdmin, type AdminLanguage } from '@/lib/i18n-admin-catalog';
import { useLiveAnnouncer } from '@/lib/view/use-live-announcer';
import { AdminAnnouncement } from '@/routes/admin-parts';

import { AgentActivityDetail } from './admin-agent-activity';
import { AgentConversationSheet } from './admin-agent-conversation-sheet';
import { AgentLogDetailSheet, AgentLogList, AgentTrackedList, type AgentLogConversation } from './admin-agent-lists';
import { AgentQueueDetail } from './admin-agent-queue';
import { AgentResetDetail } from './admin-agent-reset';
import { AgentModelDetail } from './admin-agent-settings';
import { AgentTopicsDetail } from './admin-agent-topics';

export { AgentConversationControl, AgentRelaunchControl } from './admin-agent-controls';

/**
 * **LA SECTION AGENT DE L'ADMINISTRATION** (#6733, #8876, lot Agent complet) — le
 * panneau : cinq chiffres (conversations pilotées, membres pilotés, messages et
 * mots publiés, confiance moyenne), cinq cartes résumées qui ouvrent chacune sa
 * modale (`?open=activity|model|queue|topics|reset`), les conversations suivies
 * avec leur pilotage en ligne et leur fiche, et le journal des scans.
 *
 * Il consomme désormais les 35 routes `/admin/agent/*` : chaque modale a son port
 * (`lib/api/admin-agent-*.ts`) et ne lit qu'à l'ouverture (`AdminDetailSheet`).
 * Chaque geste écrit est tracé au journal par la passerelle ; les destructifs se
 * confirment (`AdminConfirmSheet`) ; les deux gestes souverains (réécrire le
 * modèle, tout remettre à zéro) ne sont peints que pour `isSovereign`.
 *
 * ## Les listes restent dans la page
 *
 * Les conversations suivies et le journal se parcourent : ils restent des sections
 * de l'écran, pas des modales — la relance et l'arrêt sont à un geste. La fiche de
 * l'agent sur UNE conversation s'ouvre en modale depuis sa ligne (« Réglages ») ;
 * son « Voir les scans » restreint le journal à elle.
 *
 * ## Le panneau est monté SANS routeur par un témoin
 *
 * Séparé de l'écran routé pour qu'un témoin puisse le monter avec son propre
 * transport : un écran qui lit `apiDeps` au niveau du module n'est mesurable que
 * par un gate au navigateur. C'est le motif de `AdminConversationsPanel`. Hors
 * routeur, `useAdminOpen` tient l'ouverture en local.
 *
 * ## CACHE-FIRST, ET UNE COUPURE SE DIT
 *
 * Aucun squelette sur un cache non vide : les données déjà connues restent peintes
 * pendant le rafraîchissement. Une coupure certaine (`navigator.onLine === false`)
 * s'annonce, et désactive les gestes — elle ne se substitue pas à un échec de
 * requête, elle explique une absence que rien d'autre n'expliquerait.
 */
const defaultNow = (): Date => new Date();

/** Les modales de l'écran, dans l'adresse (`?open=`) — les liens des Réglages ouvrent `model` et `reset`. */
export const AGENT_MODALS = ['activity', 'model', 'queue', 'topics', 'reset'] as const;
export type AgentModal = (typeof AGENT_MODALS)[number];

export function AdminAgentPanel({
  language,
  deps = apiDeps,
  now = defaultNow,
}: {
  readonly language: AdminLanguage;
  readonly deps?: AdminDeps;
  readonly now?: () => Date;
}) {
  const announcer = useLiveAnnouncer();
  const sheet = useAdminOpen(AGENT_MODALS);
  const [openLog, setOpenLog] = useState<string | null>(null);
  const [openConversation, setOpenConversation] = useState<AgentLogConversation | null>(null);
  const [logConversation, setLogConversation] = useState<AgentLogConversation | null>(null);

  const overview = useQuery({
    queryKey: agentOverviewQueryKey(),
    queryFn: async ({ signal }) => unwrap(await loadAgentOverview({ ...deps, signal })),
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 15_000,
  });

  const data = overview.data;
  const state = data === undefined ? (overview.isPending ? 'loading' : 'error') : 'ready';
  const retry = () => void overview.refetch();

  const openSettings = (row: AgentTrackedConversation) =>
    setOpenConversation({ id: row.conversationId, name: agentConversationRefOf(row, language).label });

  const modal = (id: AgentModal, title: string, content: ReactNode) => (
    <AdminDetailSheet language={language} id={`agent-${id}`} title={title} open={sheet.active === id} onClose={sheet.close} inAddress={sheet.inAddress}>
      {content}
    </AdminDetailSheet>
  );

  return (
    <div className="@container grid gap-6" data-admin-agent-panel>
      <AdminPageHeader
        language={language}
        title={translateAdmin(language, 'admin.agent.title')}
        subtitle={translateAdmin(language, 'admin.agentPanel.subtitle')}
        crumbs={[{ label: translateAdmin(language, 'admin.group.platform') }, { label: translateAdmin(language, 'admin.nav.agent') }]}
      />
      <AdminOfflineNotice language={language} />

      <AdminStatGrid columns={3}>
        <AdminStatCard
          language={language}
          anchor="tracked"
          label={translateAdmin(language, 'admin.agentPanel.stat.tracked')}
          value={formatCount(data?.activeConfigs, language)}
          {...(data === undefined ? {} : { caption: translateAdmin(language, 'admin.agentPanel.stat.trackedCaption', { total: formatCount(data.totalConfigs, language) }) })}
          state={state}
          onRetry={retry}
        />
        <AdminStatCard
          language={language}
          anchor="users"
          label={translateAdmin(language, 'admin.agentPanel.stat.users')}
          value={formatCount(data?.totalControlledUsers, language)}
          state={state}
          onRetry={retry}
        />
        <AdminStatCard
          language={language}
          anchor="messages"
          label={translateAdmin(language, 'admin.agentPanel.stat.messages')}
          value={formatCount(data?.totalMessagesSent, language)}
          state={state}
          onRetry={retry}
        />
        {data !== undefined && data.totalWordsSent === null ? null : (
          <AdminStatCard
            language={language}
            anchor="words"
            label={translateAdmin(language, 'admin.agentPanel.stat.words')}
            value={formatCount(data?.totalWordsSent, language)}
            state={state}
            onRetry={retry}
          />
        )}
        {data !== undefined && data.avgConfidence === null ? null : (
          <AdminStatCard
            language={language}
            anchor="confidence"
            label={translateAdmin(language, 'admin.agentPanel.stat.confidence')}
            value={formatPercent(data?.avgConfidence, 'ratio', language)}
            caption={translateAdmin(language, 'admin.agentPanel.stat.confidenceCaption')}
            state={state}
            onRetry={retry}
          />
        )}
      </AdminStatGrid>

      <section aria-label={translateAdmin(language, 'admin.agentPanel.cards.title')}>
        <AdminSummaryGrid>
          <AdminSummaryCard
            language={language}
            id="activity"
            title={translateAdmin(language, 'admin.agentPanel.card.activity')}
            glyph="chartLine"
            values={data === undefined ? [{ label: translateAdmin(language, 'admin.agentPanel.card.activity.count'), value: '' }] : [{ label: translateAdmin(language, 'admin.agentPanel.card.activity.count'), value: formatCount(data.recentActivity.length, language) }]}
            sentence={data === undefined ? null : activitySentence(data, language, now())}
            state={state}
            onRetry={retry}
            onOpen={() => sheet.open('activity')}
          />
          <AdminSummaryCard
            language={language}
            id="model"
            title={translateAdmin(language, 'admin.agentPanel.card.model')}
            glyph="cpu"
            values={[]}
            sentence={translateAdmin(language, 'admin.agentPanel.card.model.hint')}
            onOpen={() => sheet.open('model')}
          />
          <AdminSummaryCard
            language={language}
            id="queue"
            title={translateAdmin(language, 'admin.agentPanel.card.queue')}
            glyph="hourglass"
            values={[]}
            sentence={translateAdmin(language, 'admin.agentPanel.card.queue.hint')}
            onOpen={() => sheet.open('queue')}
          />
          <AdminSummaryCard
            language={language}
            id="topics"
            title={translateAdmin(language, 'admin.agentPanel.card.topics')}
            glyph="chats"
            values={[]}
            sentence={translateAdmin(language, 'admin.agentPanel.card.topics.hint')}
            onOpen={() => sheet.open('topics')}
          />
          <AdminSummaryCard
            language={language}
            id="reset"
            title={translateAdmin(language, 'admin.agentPanel.card.reset')}
            glyph="arrowClockwise"
            values={[]}
            sentence={translateAdmin(language, 'admin.agentPanel.card.reset.hint')}
            onOpen={() => sheet.open('reset')}
          />
        </AdminSummaryGrid>
      </section>

      <AdminFicheSection id="tracked" title={translateAdmin(language, 'admin.agent.tracked')}>
        {/* « Suivies » n'est pas « configurées » (la carte) : la liste compte aussi les conversations sans configuration où l'agent a laissé des rôles ou une activité. */}
        <p data-admin-agent-tracked-hint className="text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
          {translateAdmin(language, 'admin.agentPanel.tracked.hint')}
        </p>
        <AgentTrackedList language={language} deps={deps} now={now} announce={announcer.announce} onOpenSettings={openSettings} />
      </AdminFicheSection>

      <AdminFicheSection id="logs" title={translateAdmin(language, 'admin.agent.logs')}>
        <AgentLogList
          key={logConversation?.id ?? 'all'}
          language={language}
          deps={deps}
          now={now}
          onOpen={setOpenLog}
          conversation={logConversation}
          onClearConversation={() => setLogConversation(null)}
        />
      </AdminFicheSection>

      {openLog === null ? null : <AgentLogDetailSheet logId={openLog} language={language} deps={deps} now={now} onClose={() => setOpenLog(null)} />}

      {openConversation === null ? null : (
        <AgentConversationSheet
          language={language}
          deps={deps}
          conversation={openConversation}
          now={now}
          onClose={() => setOpenConversation(null)}
          onShowLogs={() => {
            setLogConversation(openConversation);
            setOpenConversation(null);
          }}
        />
      )}

      {modal('activity', translateAdmin(language, 'admin.agentPanel.card.activity'), <AgentActivityDetail language={language} deps={deps} now={now} />)}
      {modal('model', translateAdmin(language, 'admin.agentPanel.card.model'), <AgentModelDetail language={language} deps={deps} now={now} />)}
      {modal('queue', translateAdmin(language, 'admin.agentPanel.card.queue'), <AgentQueueDetail language={language} deps={deps} now={now} />)}
      {modal('topics', translateAdmin(language, 'admin.agentPanel.card.topics'), <AgentTopicsDetail language={language} deps={deps} />)}
      {modal('reset', translateAdmin(language, 'admin.agentPanel.card.reset'), <AgentResetDetail language={language} deps={deps} />)}

      <AdminAnnouncement text={announcer.text} />
    </div>
  );
}

/** « Dernière réponse il y a 2 h dans Atelier. » — lue dans les dix activités que `GET /stats` sert déjà. */
function activitySentence(overview: AgentOverview, language: AdminLanguage, now: Date): string {
  const last = overview.recentActivity.find((row) => row.lastResponseAt !== null);
  const moment = last === undefined ? null : adminMomentOf(last.lastResponseAt, now, language);
  if (last === undefined || moment === null) return translateAdmin(language, 'admin.agentPanel.card.activity.none');
  return translateAdmin(language, 'admin.agentPanel.card.activity.last', { when: moment.relative, name: agentConversationRefOf(last, language).label });
}
