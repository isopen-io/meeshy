import type { AdminDashboard } from '@/lib/api/admin-dashboard';
import type { AdminKpis, AdminRealtime } from '@/lib/api/admin-overview';
import type { AdminAgentDigest, AdminMonitoring, AdminReportsQueue } from '@/lib/api/admin-overview-queue';
import { translateAdmin, type AdminLanguage } from '@/lib/i18n-admin-catalog';

import type { AdminTarget } from './admin-routes';
import { interpretServiceStatus } from './interpret/enums';
import { formatCount, formatPercent } from './interpret/numbers';
import { adminMomentOf, formatDuration } from './interpret/time';
import { ADMINISTRATION_RANK } from './user-list';

/**
 * **LES CARTES DU TABLEAU DE BORD** (#8876, § 4) — des fonctions PURES : ce que
 * les décodeurs ont lu entre, des cartes DÉJÀ dites en mots sortent (libellé,
 * valeur formatée, légende, cible). `data === null` est l'état « pas encore
 * là » : les cartes gardent leur libellé et leur cible — elles se dessinent en
 * squelette à la même place, sans saut de mise en page.
 *
 * Chaque carte MÈNE à la liste filtrée qui l'explique (`target`) ; un lien vers
 * une section que le lecteur ne peut pas ouvrir devient du texte (`AdminLink`),
 * la carte reste une carte.
 *
 * Une légende n'est posée que si TOUT ce qu'elle cite est lu : « 12 % des
 * comptes · — désactivés » n'est pas une phrase.
 */
export type DashStat = {
  readonly anchor: string;
  readonly label: string;
  readonly value: string;
  readonly caption?: string;
  readonly target: AdminTarget;
};

const section = (id: Extract<AdminTarget, { readonly kind: 'section' }>['section'], search?: Readonly<Record<string, string>>): AdminTarget =>
  search === undefined ? { kind: 'section', section: id } : { kind: 'section', section: id, search };

const PENDING = '—';

const known = (value: number | null | undefined): value is number => value !== null && value !== undefined;

const captioned = (caption: string | null): { readonly caption?: string } => (caption === null ? {} : { caption });

export function nowStats(data: AdminRealtime | null, language: AdminLanguage): readonly DashStat[] {
  const analytics = section('analytics');
  return [
    {
      anchor: 'now-online',
      label: translateAdmin(language, 'admin.dash.now.online'),
      value: formatCount(data?.onlineUsers, language),
      caption: translateAdmin(language, 'admin.dash.now.online.caption'),
      target: analytics,
    },
    {
      anchor: 'now-messages',
      label: translateAdmin(language, 'admin.dash.now.messages'),
      value: formatCount(data?.messagesLastHour, language),
      caption: translateAdmin(language, 'admin.dash.now.messages.caption'),
      target: analytics,
    },
    {
      anchor: 'now-conversations',
      label: translateAdmin(language, 'admin.dash.now.conversations'),
      value: formatCount(data?.activeConversations, language),
      caption: translateAdmin(language, 'admin.dash.now.conversations.caption'),
      target: analytics,
    },
  ];
}

function activeUsersCaption(data: AdminDashboard | null, language: AdminLanguage): string | null {
  if (data === null || data.activeUsers === null || data.totalUsers === null || data.totalUsers === 0) return null;
  const share = formatPercent(data.activeUsers / data.totalUsers, 'ratio', language);
  return data.inactiveUsers === null
    ? translateAdmin(language, 'admin.dash.platform.activeUsers.share', { share })
    : translateAdmin(language, 'admin.dash.platform.activeUsers.caption', { share, inactive: formatCount(data.inactiveUsers, language) });
}

function anonymousCaption(data: AdminDashboard | null, language: AdminLanguage): string | null {
  if (data === null || data.activeAnonymousUsers === null || data.newAnonymousUsers24h === null) return null;
  return translateAdmin(language, 'admin.dash.platform.anonymous.caption', {
    active: formatCount(data.activeAnonymousUsers, language),
    recent: formatCount(data.newAnonymousUsers24h, language),
  });
}

export function platformStats(data: AdminDashboard | null, language: AdminLanguage): readonly DashStat[] {
  const count = (value: number | null | undefined) => (data === null ? PENDING : formatCount(value, language));
  return [
    {
      anchor: 'platform-users',
      label: translateAdmin(language, 'admin.dash.platform.users'),
      value: count(data?.totalUsers),
      ...captioned(
        known(data?.newUsers24h) ? translateAdmin(language, 'admin.dash.platform.users.caption', { count: formatCount(data.newUsers24h, language) }) : null,
      ),
      target: section('users'),
    },
    {
      anchor: 'platform-active-users',
      label: translateAdmin(language, 'admin.dash.platform.activeUsers'),
      value: count(data?.activeUsers),
      ...captioned(activeUsersCaption(data, language)),
      target: section('users', { isActive: 'true' }),
    },
    {
      anchor: 'platform-anonymous',
      label: translateAdmin(language, 'admin.dash.platform.anonymous'),
      value: count(data?.totalAnonymousUsers),
      ...captioned(anonymousCaption(data, language)),
      target: section('anonymous'),
    },
    {
      anchor: 'platform-messages',
      label: translateAdmin(language, 'admin.dash.platform.messages'),
      value: count(data?.totalMessages),
      ...captioned(
        known(data?.newMessages24h) ? translateAdmin(language, 'admin.dash.platform.messages.caption', { count: formatCount(data.newMessages24h, language) }) : null,
      ),
      target: section('analytics', { tab: 'messages' }),
    },
    {
      anchor: 'platform-conversations',
      label: translateAdmin(language, 'admin.dash.platform.conversations'),
      value: count(data?.newConversations24h),
      caption: translateAdmin(language, 'admin.dash.platform.conversations.caption'),
      target: section('conversations', { period: '24h', sort: 'createdAt' }),
    },
    {
      anchor: 'platform-communities',
      label: translateAdmin(language, 'admin.dash.platform.communities'),
      value: count(data?.totalCommunities),
      target: section('communities'),
    },
    {
      anchor: 'platform-share-links',
      label: translateAdmin(language, 'admin.dash.platform.shareLinks'),
      value: count(data?.activeShareLinks),
      ...captioned(
        known(data?.totalShareLinks) ? translateAdmin(language, 'admin.dash.platform.shareLinks.caption', { total: formatCount(data.totalShareLinks, language) }) : null,
      ),
      target: section('shareLinks', { isActive: 'true' }),
    },
    {
      anchor: 'platform-admins',
      label: translateAdmin(language, 'admin.dash.platform.admins'),
      value: count(data?.adminUsers),
      caption: translateAdmin(language, 'admin.dash.platform.admins.caption'),
      target: section('users', { role: ADMINISTRATION_RANK }),
    },
  ];
}

export function usageStats(data: AdminKpis | null, language: AdminLanguage): readonly DashStat[] {
  const analytics = section('analytics');
  const percent = (value: number | null | undefined) => (data === null ? PENDING : formatPercent(value, 'hundred', language));
  return [
    {
      anchor: 'usage-engagement',
      label: translateAdmin(language, 'admin.dash.usage.engagement'),
      value: percent(data?.engagementRate),
      caption: translateAdmin(language, 'admin.dash.usage.engagement.caption'),
      target: analytics,
    },
    {
      anchor: 'usage-growth',
      label: translateAdmin(language, 'admin.dash.usage.growth'),
      value: percent(data?.growthRate),
      caption: translateAdmin(language, 'admin.dash.usage.growth.caption'),
      target: analytics,
    },
    {
      anchor: 'usage-per-user',
      label: translateAdmin(language, 'admin.dash.usage.perUser'),
      value: data === null ? PENDING : formatCount(data.messagesPerUser, language),
      caption: translateAdmin(language, 'admin.dash.usage.perUser.caption'),
      target: analytics,
    },
    {
      anchor: 'usage-active-rate',
      label: translateAdmin(language, 'admin.dash.usage.activeRate'),
      value: percent(data?.activeUserRate),
      caption: translateAdmin(language, 'admin.dash.usage.activeRate.caption'),
      target: analytics,
    },
  ];
}

/**
 * Le délai moyen vient en HEURES ; la passerelle rend 0 quand aucun dossier
 * n'est encore résolu — une absence de mesure, pas une réponse instantanée :
 * « — », jamais « 0 ms ».
 */
const resolutionDelay = (hours: number | null | undefined, language: AdminLanguage): string =>
  hours === null || hours === undefined || hours <= 0 ? PENDING : formatDuration(hours * 3600, 's', language);

export function moderationStats(data: AdminReportsQueue | null, language: AdminLanguage): readonly DashStat[] {
  const count = (value: number | null | undefined) => (data === null ? PENDING : formatCount(value, language));
  return [
    {
      anchor: 'moderation-pending',
      label: translateAdmin(language, 'admin.dash.moderation.pending'),
      value: count(data?.pending),
      caption: translateAdmin(language, 'admin.dash.moderation.pending.caption'),
      target: section('reports', { status: 'pending' }),
    },
    {
      anchor: 'moderation-review',
      label: translateAdmin(language, 'admin.dash.moderation.review'),
      value: count(data?.underReview),
      caption: translateAdmin(language, 'admin.dash.moderation.review.caption'),
      target: section('reports', { status: 'under_review' }),
    },
    {
      anchor: 'moderation-delay',
      label: translateAdmin(language, 'admin.dash.moderation.delay'),
      value: data === null ? PENDING : resolutionDelay(data.averageResolutionHours, language),
      caption: translateAdmin(language, 'admin.dash.moderation.delay.caption'),
      target: section('reports'),
    },
  ];
}

function dependencyStat(
  anchor: string,
  labelKey: 'admin.dash.system.database' | 'admin.dash.system.redis',
  dependency: AdminMonitoring['database'] | undefined,
  language: AdminLanguage,
): DashStat {
  const status = interpretServiceStatus(dependency?.status ?? 'unknown', language);
  const caption =
    dependency === undefined
      ? null
      : dependency.status === 'down'
        ? translateAdmin(language, 'admin.dash.system.unreachable')
        : dependency.latencyMs === null
          ? null
          : translateAdmin(language, 'admin.dash.system.latency', { latency: formatDuration(dependency.latencyMs, 'ms', language) });
  return {
    anchor,
    label: translateAdmin(language, labelKey),
    value: dependency === undefined ? PENDING : status.label,
    ...captioned(caption),
    target: section('monitoring'),
  };
}

export const openBreakers = (data: AdminMonitoring): readonly string[] =>
  data.breakers.filter((breaker) => breaker.state === 'OPEN').map((breaker) => breaker.name);

export function healthStats(data: AdminMonitoring | null, language: AdminLanguage): readonly DashStat[] {
  const open = data === null ? [] : openBreakers(data);
  return [
    dependencyStat('health-database', 'admin.dash.system.database', data?.database, language),
    dependencyStat('health-redis', 'admin.dash.system.redis', data?.redis, language),
    {
      anchor: 'health-realtime',
      label: translateAdmin(language, 'admin.dash.system.realtime'),
      value: data === null ? PENDING : formatCount(data.connections, language),
      ...captioned(
        data === null || data.connectedUsers === null ? null : translateAdmin(language, 'admin.dash.system.realtime.caption', { count: formatCount(data.connectedUsers, language) }),
      ),
      target: section('monitoring'),
    },
    {
      anchor: 'health-breakers',
      label: translateAdmin(language, 'admin.dash.system.breakers'),
      value: data === null ? PENDING : formatCount(open.length, language),
      ...captioned(
        data === null
          ? null
          : open.length === 0
            ? translateAdmin(language, 'admin.dash.system.breakers.none')
            : translateAdmin(language, 'admin.dash.system.breakers.open', { names: open.join(', ') }),
      ),
      target: section('monitoring'),
    },
  ];
}

/** Ce qui ne va pas, en phrases : la base ou Redis qui ne répondent pas, des coupe-circuits ouverts. Vide si tout va bien. */
export function healthAlerts(data: AdminMonitoring, language: AdminLanguage): readonly string[] {
  return [
    data.database.status === 'down' ? translateAdmin(language, 'admin.dash.system.alert.database') : null,
    data.redis.status === 'down' ? translateAdmin(language, 'admin.dash.system.alert.redis') : null,
    openBreakers(data).length > 0 ? translateAdmin(language, 'admin.dash.system.alert.breakers') : null,
  ].filter((sentence): sentence is string => sentence !== null);
}

export function agentStats(data: AdminAgentDigest | null, now: Date, language: AdminLanguage): readonly DashStat[] {
  const agent = section('agent');
  const last = data === null ? null : adminMomentOf(data.lastActivityAt, now, language);
  return [
    {
      anchor: 'agent-active',
      label: translateAdmin(language, 'admin.dash.agent.active'),
      value: data === null ? PENDING : formatCount(data.activeConfigs, language),
      ...captioned(
        data === null || data.totalConfigs === null ? null : translateAdmin(language, 'admin.dash.agent.active.caption', { total: formatCount(data.totalConfigs, language) }),
      ),
      target: agent,
    },
    {
      anchor: 'agent-messages',
      label: translateAdmin(language, 'admin.dash.agent.messages'),
      value: data === null ? PENDING : formatCount(data.messagesSent, language),
      caption: translateAdmin(language, 'admin.dash.agent.messages.caption'),
      target: agent,
    },
    {
      anchor: 'agent-last',
      label: translateAdmin(language, 'admin.dash.agent.last'),
      value: data === null ? PENDING : (last?.relative ?? translateAdmin(language, 'admin.dash.agent.last.none')),
      ...captioned(last === null ? null : last.absolute),
      target: agent,
    },
  ];
}
