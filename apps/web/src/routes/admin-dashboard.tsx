import { AdminOfflineNotice } from '@/components/admin/states';
import { useAdminReach } from '@/lib/admin/use-admin-reach';
import type { AdminDeps } from '@/lib/api/admin';
import { apiDeps } from '@/lib/api/deps';
import { translateAdmin, type AdminLanguage } from '@/lib/i18n-admin-catalog';

import { DashSection, DashZone, type DashContext } from './admin-dashboard-parts';
import { AgentBlock, HealthBlock, NowBlock, PlatformBlock, UsageBlock } from './admin-dashboard-numbers';
import { MembersBlock, RankedConversationsChart, RankedMembersChart } from './admin-dashboard-people';
import { BroadcastsBlock, ModerationBlock } from './admin-dashboard-todo';
import { EngagementChart, HourlyChart, LanguagesChart, MessageTypesChart, VolumeChart } from './admin-dashboard-trends';

/**
 * **LE TABLEAU DE BORD « VUE DE DIEU »** (#8876, spécification § 4) — monté par
 * le hub (`admin.tsx`), qui ne le rend qu'après sa garde : un visiteur refusé
 * ne lance aucune de ces requêtes.
 *
 * Sept zones, chacune une question que le créateur se pose en ouvrant
 * l'administration : qu'est-ce qui se passe EN CE MOMENT, où en est la
 * PLATEFORME, l'usage est-il SAIN, vers où vont les TENDANCES, qu'y a-t-il À
 * TRAITER, qui sont les PERSONNES actives, le SYSTÈME tient-il ?
 *
 * ## Chaque bloc est gardé par la capacité de SA route
 *
 * Pas par celle de la section : le hub est ouvert à tout administrateur
 * (`canAccessAdmin`), mais les statistiques exigent `canViewAnalytics`, la file
 * de modération `canModerateContent`, les diffusions `canManageNotifications`,
 * les derniers inscrits `canManageUsers`, la santé de la plateforme
 * `canViewAnalytics` ET le rang d'administration, l'agent `canManageAgent`. Un
 * bloc que le lecteur ne peut pas lire n'est PAS rendu — ni titre vide, ni
 * requête qui rendrait 403 : la décision se lit dans la matrice SERVIE
 * (`useAdminReach`), jamais dans la session. Une zone sans bloc visible
 * disparaît.
 *
 * ## Chaque bloc se suffit
 *
 * Son squelette, son erreur avec « Réessayer », son refus (un 403 malgré la
 * matrice se dessine comme un refus, pas comme une panne) — et il n'empêche
 * jamais les autres de se rendre. Les clés de requête sont sous
 * `['admin', 'dash', …]` : jamais persistées sur le disque, invalidées d'un
 * coup par « Recalculer maintenant » (Réglages).
 *
 * `deps` et `now` sont injectables : sans eux, le panneau ne se montrerait qu'à
 * travers un transport réel et l'horloge de la machine.
 */
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
  if (reach.status !== 'ready') return null;

  const context: DashContext = { language, deps, now: now() };
  const analytics = reach.can('canViewAnalytics');
  const platform = reach.can('canAccessAdmin');
  const moderation = reach.can('canModerateContent');
  const notifications = reach.can('canManageNotifications');
  const members = reach.can('canManageUsers');
  const agent = reach.can('canManageAgent');
  const health = analytics && reach.hasAdminRank;

  return (
    <div data-admin-dashboard className="grid gap-8">
      <AdminOfflineNotice language={language} />

      {analytics ? (
        <DashZone id="now" title={translateAdmin(language, 'admin.dash.zone.now')} hint={translateAdmin(language, 'admin.dash.zone.now.hint')}>
          <NowBlock {...context} />
        </DashZone>
      ) : null}

      {platform ? (
        <DashZone id="platform" title={translateAdmin(language, 'admin.dash.zone.platform')} hint={translateAdmin(language, 'admin.dash.zone.platform.hint')}>
          <PlatformBlock {...context} />
        </DashZone>
      ) : null}

      {analytics ? (
        <DashZone id="usage" title={translateAdmin(language, 'admin.dash.zone.usage')} hint={translateAdmin(language, 'admin.dash.zone.usage.hint')}>
          <UsageBlock {...context} />
        </DashZone>
      ) : null}

      {analytics ? (
        <DashZone id="trends" title={translateAdmin(language, 'admin.dash.zone.trends')} hint={translateAdmin(language, 'admin.dash.zone.trends.hint')}>
          <div className="grid gap-4">
            <VolumeChart {...context} />
            <div className="grid items-start gap-4 @4xl:grid-cols-2">
              <HourlyChart {...context} />
              <EngagementChart {...context} />
              <LanguagesChart {...context} />
              <MessageTypesChart {...context} />
            </div>
          </div>
        </DashZone>
      ) : null}

      {moderation || notifications ? (
        <DashZone id="todo" title={translateAdmin(language, 'admin.dash.zone.todo')}>
          <div className="grid items-start gap-6 @4xl:grid-cols-2">
            {moderation ? <ModerationBlock {...context} /> : null}
            {notifications ? <BroadcastsBlock {...context} /> : null}
          </div>
        </DashZone>
      ) : null}

      {members || analytics ? (
        <DashZone id="people" title={translateAdmin(language, 'admin.dash.zone.people')}>
          <div className="grid items-start gap-4 @2xl:grid-cols-2 @5xl:grid-cols-3">
            {members ? <MembersBlock {...context} /> : null}
            {analytics ? <RankedConversationsChart {...context} /> : null}
            {analytics ? <RankedMembersChart {...context} /> : null}
          </div>
        </DashZone>
      ) : null}

      {health || agent ? (
        <DashZone id="system" title={translateAdmin(language, 'admin.dash.zone.system')}>
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
          </div>
        </DashZone>
      ) : null}
    </div>
  );
}
