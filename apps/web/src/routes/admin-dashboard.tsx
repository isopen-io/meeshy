import type { ReactNode } from 'react';

import { AdminDetailSheet } from '@/components/admin/detail-sheet';
import { AdminOfflineNotice } from '@/components/admin/states';
import { AdminSummaryGrid } from '@/components/admin/summary-card';
import { INK2 } from '@/components/admin/tone';
import { useAdminOpen } from '@/lib/admin/use-admin-open';
import { useAdminReach } from '@/lib/admin/use-admin-reach';
import type { AdminDeps } from '@/lib/api/admin';
import { apiDeps } from '@/lib/api/deps';
import { translateAdmin, type AdminLanguage } from '@/lib/i18n-admin-catalog';

import { DashSection, type DashContext } from './admin-dashboard-parts';
import { AgentBlock, HealthBlock, NowBlock, PlatformBlock, UsageBlock } from './admin-dashboard-numbers';
import { MembersBlock, RankedConversationsChart, RankedMembersChart } from './admin-dashboard-people';
import { NowSummary, PeopleSummary, PlatformSummary, SystemSummary, TodoBand, TrendsSummary, UsageSummary } from './admin-dashboard-summaries';
import { BroadcastsBlock, ModerationBlock } from './admin-dashboard-todo';
import { EngagementChart, HourlyChart, LanguagesChart, MessageTypesChart, VolumeChart } from './admin-dashboard-trends';

/**
 * **LE TABLEAU DE BORD « VUE DE DIEU »** (#8876, spécification § 4 ; restructuré
 * en cartes de synthèse par la spec 2026-10-04 § 2) — monté par le hub
 * (`admin.tsx`), qui ne le rend qu'après sa garde : un visiteur refusé ne lance
 * aucune de ces requêtes.
 *
 * ## Une carte par zone, le détail en modale
 *
 * Le hub ne rend plus tout d'un coup. En tête, la bande « À TRAITER »
 * (signalements en attente, diffusions en cours — chaque pastille mène à la
 * liste filtrée, « Rien à traiter » sinon). Puis une carte résumée par zone :
 * EN CE MOMENT, PLATEFORME, SANTÉ DE L'USAGE, TENDANCES, PERSONNES ET ÉCHANGES,
 * SYSTÈME — deux à quatre chiffres tirés des lectures LÉGÈRES
 * (`dashboard-reads.ts`). « Ouvrir » montre la zone entière dans une
 * `AdminDetailSheet` (`?open=now|platform|usage|trends|todo|people|system`) :
 * les blocs d'hier, réutilisés tels quels. Les graphiques, les classements et la
 * liste des derniers inscrits ne se lisent QU'À L'OUVERTURE de leur modale.
 *
 * ## Chaque zone est gardée par la capacité de SES routes
 *
 * Pas par celle de la section : le hub est ouvert à tout administrateur
 * (`canAccessAdmin`), mais les statistiques exigent `canViewAnalytics`, la file
 * de modération `canModerateContent`, les diffusions `canManageNotifications`,
 * les derniers inscrits `canManageUsers`, la santé de la plateforme
 * `canViewAnalytics` ET le rang d'administration, l'agent `canManageAgent`. Une
 * zone que le lecteur ne peut pas lire n'a ni carte ni modale — ni requête qui
 * rendrait 403 : la décision se lit dans la matrice SERVIE (`useAdminReach`).
 *
 * ## Chaque bloc se suffit
 *
 * Son squelette, son erreur avec « Réessayer », son refus — et il n'empêche
 * jamais les autres de se rendre. Les clés de requête sont sous
 * `['admin', 'dash', …]` : jamais persistées sur le disque, invalidées d'un coup
 * par « Recalculer maintenant » (Réglages).
 *
 * `deps` et `now` sont injectables : sans eux, le panneau ne se montrerait qu'à
 * travers un transport réel et l'horloge de la machine.
 */
const ZONES = ['now', 'platform', 'usage', 'trends', 'todo', 'people', 'system'] as const;
type Zone = (typeof ZONES)[number];

/** La phrase d'aide d'une zone, en tête de sa modale. */
function Hint({ text }: { readonly text: string }) {
  return (
    <p className="text-caption" style={{ color: INK2 }}>
      {text}
    </p>
  );
}

export function AdminDashboardPanel({
  language,
  deps = apiDeps,
  now = () => new Date(),
}: {
  readonly language: AdminLanguage;
  readonly deps?: AdminDeps;
  readonly now?: () => Date;
}) {
  const reach = useAdminReach();
  const sheet = useAdminOpen(ZONES);
  if (reach.status !== 'ready') return null;

  const context: DashContext = { language, deps, now: now() };
  const analytics = reach.can('canViewAnalytics');
  const platform = reach.can('canAccessAdmin');
  const moderation = reach.can('canModerateContent');
  const notifications = reach.can('canManageNotifications');
  const members = reach.can('canManageUsers');
  const agent = reach.can('canManageAgent');
  const health = analytics && reach.hasAdminRank;

  const visible: Readonly<Record<Zone, boolean>> = {
    now: analytics,
    platform,
    usage: analytics,
    trends: analytics,
    todo: moderation || notifications,
    people: members || analytics,
    system: health || agent,
  };
  const t = (zone: Zone) => translateAdmin(language, `admin.dash.zone.${zone}`);
  const opener = (zone: Zone) => () => sheet.open(zone);

  const detail = (zone: Zone, children: ReactNode) =>
    visible[zone] ? (
      <AdminDetailSheet key={zone} language={language} id={zone} title={t(zone)} open={sheet.active === zone} onClose={sheet.close} inAddress={sheet.inAddress}>
        {children}
      </AdminDetailSheet>
    ) : null;

  return (
    <div data-admin-dashboard className="grid gap-6">
      <AdminOfflineNotice language={language} />

      {visible.todo ? <TodoBand {...context} moderation={moderation} notifications={notifications} onOpen={opener('todo')} /> : null}

      <AdminSummaryGrid>
        {visible.now ? <NowSummary {...context} onOpen={opener('now')} /> : null}
        {visible.platform ? <PlatformSummary {...context} onOpen={opener('platform')} /> : null}
        {visible.usage ? <UsageSummary {...context} onOpen={opener('usage')} /> : null}
        {visible.trends ? <TrendsSummary {...context} onOpen={opener('trends')} /> : null}
        {visible.people ? <PeopleSummary {...context} onOpen={opener('people')} /> : null}
        {visible.system ? <SystemSummary {...context} health={health} agent={agent} onOpen={opener('system')} /> : null}
      </AdminSummaryGrid>

      {detail(
        'now',
        <>
          <Hint text={translateAdmin(language, 'admin.dash.zone.now.hint')} />
          <NowBlock {...context} />
        </>,
      )}
      {detail(
        'platform',
        <>
          <Hint text={translateAdmin(language, 'admin.dash.zone.platform.hint')} />
          <PlatformBlock {...context} />
        </>,
      )}
      {detail(
        'usage',
        <>
          <Hint text={translateAdmin(language, 'admin.dash.zone.usage.hint')} />
          <UsageBlock {...context} />
        </>,
      )}
      {detail(
        'trends',
        <>
          <Hint text={translateAdmin(language, 'admin.dash.zone.trends.hint')} />
          <VolumeChart {...context} />
          <div className="grid items-start gap-4 @4xl:grid-cols-2">
            <HourlyChart {...context} />
            <EngagementChart {...context} />
            <LanguagesChart {...context} />
            <MessageTypesChart {...context} />
          </div>
        </>,
      )}
      {detail(
        'todo',
        <div className="grid items-start gap-6 @4xl:grid-cols-2">
          {moderation ? <ModerationBlock {...context} /> : null}
          {notifications ? <BroadcastsBlock {...context} /> : null}
        </div>,
      )}
      {detail(
        'people',
        <div className="grid items-start gap-4 @2xl:grid-cols-2 @5xl:grid-cols-3">
          {members ? <MembersBlock {...context} /> : null}
          {analytics ? <RankedConversationsChart {...context} /> : null}
          {analytics ? <RankedMembersChart {...context} /> : null}
        </div>,
      )}
      {detail(
        'system',
        <div className="grid gap-6">
          {health ? (
            <DashSection id="system-health" title={translateAdmin(language, 'admin.dash.system.health')}>
              <HealthBlock {...context} />
            </DashSection>
          ) : null}
          {agent ? (
            <DashSection id="system-agent" title={translateAdmin(language, 'admin.dash.agent.title')}>
              <AgentBlock {...context} />
            </DashSection>
          ) : null}
        </div>,
      )}
    </div>
  );
}
