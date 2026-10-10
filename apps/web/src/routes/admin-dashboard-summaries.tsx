import { AdminLink } from '@/components/admin/entity-chip';
import { AdminSummaryCard } from '@/components/admin/summary-card';
import { BRAND, EDGE, SURFACE } from '@/components/admin/tone';
import type { AdminTarget } from '@/lib/admin/admin-routes';
import { useDashBlock, type DashBlock } from '@/lib/admin/dashboard-block';
import { agentStats, healthAlerts, healthStats, nowStats, platformStats, usageStats } from '@/lib/admin/dashboard-cards';
import { agentRead, kpisRead, monitoringRead, platformRead, realtimeRead, reportsQueueRead, sendingBroadcastsRead } from '@/lib/admin/dashboard-reads';
import { captionOf, summaryRetryOf, summaryStateOf, summaryValues, todoPills, type TodoPill } from '@/lib/admin/dashboard-summary';
import { translateAdmin } from '@/lib/i18n-admin-catalog';

import type { DashContext } from './admin-dashboard-parts';

/**
 * **LES CARTES RÉSUMÉES DU HUB** (spec 2026-10-04 § 2) — une carte par zone,
 * deux à quatre chiffres prélevés des lectures LÉGÈRES (`dashboard-reads.ts`, la
 * même clé que le bloc de la modale : un seul aller-retour), et « Ouvrir » qui
 * montre la zone entière dans sa modale. Aucun graphique, aucun classement,
 * aucune liste ne se lit ici : ils ne partent qu'à l'ouverture.
 */
type SummaryProps = DashContext & { readonly onOpen: () => void };

export function NowSummary({ language, deps, onOpen }: SummaryProps) {
  const block = useDashBlock(realtimeRead(deps));
  const stats = nowStats(block.status === 'ready' ? block.data : null, language);
  return (
    <AdminSummaryCard
      language={language}
      id="now"
      glyph="lightning"
      title={translateAdmin(language, 'admin.dash.zone.now')}
      values={summaryValues(stats, ['now-online', 'now-messages', 'now-conversations'])}
      state={summaryStateOf(block)}
      {...summaryRetryOf(block)}
      onOpen={onOpen}
    />
  );
}

export function PlatformSummary({ language, deps, onOpen }: SummaryProps) {
  const block = useDashBlock(platformRead(deps));
  const stats = platformStats(block.status === 'ready' ? block.data : null, language);
  return (
    <AdminSummaryCard
      language={language}
      id="platform"
      glyph="squaresFour"
      title={translateAdmin(language, 'admin.dash.zone.platform')}
      values={summaryValues(stats, ['platform-users', 'platform-active-users', 'platform-messages', 'platform-communities'])}
      sentence={captionOf(stats, 'platform-users')}
      state={summaryStateOf(block)}
      {...summaryRetryOf(block)}
      onOpen={onOpen}
    />
  );
}

export function UsageSummary({ language, deps, onOpen }: SummaryProps) {
  const block = useDashBlock(kpisRead(deps));
  const stats = usageStats(block.status === 'ready' ? block.data : null, language);
  return (
    <AdminSummaryCard
      language={language}
      id="usage"
      glyph="heartbeat"
      title={translateAdmin(language, 'admin.dash.zone.usage')}
      values={summaryValues(stats, ['usage-engagement', 'usage-active-rate', 'usage-growth', 'usage-per-user'])}
      sentence={translateAdmin(language, 'admin.dash.zone.usage.hint')}
      state={summaryStateOf(block)}
      {...summaryRetryOf(block)}
      onOpen={onOpen}
    />
  );
}

/** Les tendances sont des GRAPHIQUES : la carte n'en lit aucun — elle reprend la croissance et le rythme des taux déjà lus. */
export function TrendsSummary({ language, deps, onOpen }: SummaryProps) {
  const block = useDashBlock(kpisRead(deps));
  const stats = usageStats(block.status === 'ready' ? block.data : null, language);
  return (
    <AdminSummaryCard
      language={language}
      id="trends"
      glyph="chartLine"
      title={translateAdmin(language, 'admin.dash.zone.trends')}
      values={summaryValues(stats, ['usage-growth', 'usage-per-user'])}
      sentence={translateAdmin(language, 'admin.dash.zone.trends.hint')}
      state={summaryStateOf(block)}
      {...summaryRetryOf(block)}
      onOpen={onOpen}
    />
  );
}

/** Les personnes : les comptes et les anonymes de la plateforme — la liste des inscrits (qui écrit une trace d'audit) et les classements attendent la modale. */
export function PeopleSummary({ language, deps, onOpen }: SummaryProps) {
  const block = useDashBlock(platformRead(deps));
  const stats = platformStats(block.status === 'ready' ? block.data : null, language);
  return (
    <AdminSummaryCard
      language={language}
      id="people"
      glyph="users"
      title={translateAdmin(language, 'admin.dash.zone.people')}
      values={summaryValues(stats, ['platform-users', 'platform-anonymous'])}
      sentence={captionOf(stats, 'platform-anonymous')}
      state={summaryStateOf(block)}
      {...summaryRetryOf(block)}
      onOpen={onOpen}
    />
  );
}

/** L'état combiné de deux blocs lus sous deux capacités : un refus ou une panne d'UN bloc visible se dit ; le prêt attend tous les visibles. */
function combined(blocks: readonly DashBlock<unknown>[]): DashBlock<unknown> {
  const error = blocks.find((block) => block.status === 'error');
  if (error !== undefined) return error;
  if (blocks.some((block) => block.status === 'loading')) return { status: 'loading' };
  if (blocks.every((block) => block.status === 'denied')) return { status: 'denied' };
  return { status: 'ready', data: null };
}

export function SystemSummary({ language, deps, now, health, agent, onOpen }: SummaryProps & { readonly health: boolean; readonly agent: boolean }) {
  const monitoring = useDashBlock(monitoringRead(deps), { enabled: health });
  const digest = useDashBlock(agentRead(deps), { enabled: agent });
  const state = combined([...(health ? [monitoring] : []), ...(agent ? [digest] : [])]);
  const values = [
    ...(health ? summaryValues(healthStats(monitoring.status === 'ready' ? monitoring.data : null, language), ['health-database', 'health-redis', 'health-breakers']) : []),
    ...(agent ? summaryValues(agentStats(digest.status === 'ready' ? digest.data : null, now, language), ['agent-active']) : []),
  ];
  const alerts = health && monitoring.status === 'ready' ? healthAlerts(monitoring.data, language) : [];
  const sentence = !health || monitoring.status !== 'ready' ? null : alerts.length === 0 ? translateAdmin(language, 'admin.dash.system.ok') : alerts.join(' ');
  return (
    <AdminSummaryCard
      language={language}
      id="system"
      glyph="cpu"
      title={translateAdmin(language, 'admin.dash.zone.system')}
      values={values}
      sentence={sentence}
      state={summaryStateOf(state)}
      {...summaryRetryOf(state)}
      onOpen={onOpen}
    />
  );
}

const PILL_TARGET: Readonly<Record<TodoPill['id'], AdminTarget>> = {
  reports: { kind: 'section', section: 'reports', search: { status: 'pending' } },
  broadcasts: { kind: 'section', section: 'broadcasts', search: { status: 'SENDING' } },
};

/**
 * **LA BANDE « À TRAITER »**, en tête du hub — ce qui attend un geste : les
 * signalements en attente, les diffusions en cours. Chaque pastille mène à la
 * liste FILTRÉE (un lien seulement si le lecteur peut ouvrir la section) ; une
 * file vide n'a pas de pastille, et deux files vides se disent « Rien à
 * traiter ». « Ouvrir » montre la file de modération et les diffusions en détail.
 */
export function TodoBand({ language, deps, moderation, notifications, onOpen }: SummaryProps & { readonly moderation: boolean; readonly notifications: boolean }) {
  const reports = useDashBlock(reportsQueueRead(deps), { enabled: moderation });
  const broadcasts = useDashBlock(sendingBroadcastsRead(deps), { enabled: notifications });
  const state = combined([...(moderation ? [reports] : []), ...(notifications ? [broadcasts] : [])]);

  const pending = moderation && reports.status === 'ready' ? reports.data.pending : null;
  const sending = notifications && broadcasts.status === 'ready' ? broadcasts.data.total : null;
  const pills = todoPills(pending, sending, language);

  return (
    <AdminSummaryCard
      language={language}
      id="todo"
      glyph="flag"
      title={translateAdmin(language, 'admin.dash.zone.todo')}
      values={[]}
      sentence={pills.length === 0 ? translateAdmin(language, 'admin.dash.todo.nothing') : null}
      state={summaryStateOf(state)}
      {...summaryRetryOf(state)}
      onOpen={onOpen}
    >
      {state.status !== 'ready' || pills.length === 0 ? null : (
        <ul className="flex flex-wrap gap-2">
          {pills.map((pill) => (
            <li key={pill.id} data-admin-todo={pill.id}>
              <AdminLink
                target={PILL_TARGET[pill.id]}
                className="inline-flex items-center rounded-chip px-4 text-body font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
                style={{ minHeight: 44, color: BRAND, backgroundColor: SURFACE, border: `1px solid ${EDGE}`, outlineColor: BRAND }}
              >
                {pill.text}
              </AdminLink>
            </li>
          ))}
        </ul>
      )}
    </AdminSummaryCard>
  );
}
