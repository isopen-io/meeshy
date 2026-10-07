/**
 * CE QUE LE COMPTE FAIT D'HABITUDE (#9539) — les trois lectures qui rendent la mission personnelle « à lui » :
 * ses heures habituelles d'écriture, ses usages (les compteurs d'engagement), ses langues.
 *
 * ## Ce qui reste ici
 *
 * L'histogramme des heures est une ENTRÉE du tirage, jamais une sortie : il ne part dans aucune charge, aucun
 * journal, aucune notification (conformité : « jamais une heure d'activité », partie IX de la conception).
 *
 * ## Le coût
 *
 * Une fois par compte et par jour, hors voie chaude : les participants du compte (au plus 300), puis ses 150
 * derniers messages des 30 derniers jours (index `senderId`). Un compte sans message garde la courbe par défaut.
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { EngagementOperationKey } from '@meeshy/shared/types/engagement-operations';
import type { MissionCapability, MissionProfile } from '@meeshy/shared/utils/game/missions';
import { activeHoursHistogram } from '@meeshy/shared/utils/game/personal-mission';
import { minuteOfDayInTimezone } from './gameClock';

const PARTICIPANT_LIMIT = 300;
const MESSAGE_SAMPLE = 150;
const HABIT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/** Les compteurs d'engagement, relus comme des comptes par signal de mission. */
export const MISSION_HABIT_COUNTER_LIMIT = 100;

export async function activeHoursOf(params: {
  readonly prisma: PrismaClient;
  readonly userId: string;
  readonly timezone: string | null | undefined;
  readonly now: Date;
}): Promise<number[] | null> {
  const { prisma, userId, timezone, now } = params;
  const participants = await prisma.participant.findMany({ where: { userId }, select: { id: true }, take: PARTICIPANT_LIMIT });
  if (participants.length === 0) return null;
  const messages = await prisma.message.findMany({
    where: { senderId: { in: participants.map((p) => p.id) }, createdAt: { gte: new Date(now.getTime() - HABIT_WINDOW_MS) } },
    orderBy: { createdAt: 'desc' },
    take: MESSAGE_SAMPLE,
    select: { createdAt: true },
  });
  return messages.length === 0 ? null : activeHoursHistogram(messages.map((m) => minuteOfDayInTimezone(m.createdAt, timezone)));
}

/** Un compte par signal de mission : un axe d'engagement vaut `axis:<clé>` (tous les gabarits sont des axes, #9634). */
export async function usageOf(prisma: PrismaClient, userId: string): Promise<Record<string, number>> {
  const counters = await prisma.engagementCounter.findMany({
    where: { userId },
    select: { axisKey: true, count: true },
    take: MISSION_HABIT_COUNTER_LIMIT,
  });
  return Object.fromEntries(counters.map((c) => [`axis:${c.axisKey}`, c.count]));
}

type LanguageFields = {
  readonly systemLanguage?: string | null;
  readonly regionalLanguage?: string | null;
  readonly customDestinationLanguage?: string | null;
};

/** Au moins deux langues distinctes configurées : les missions du Prisme lui sont ouvertes. */
export const isMultilingual = (user: LanguageFields): boolean =>
  new Set(
    [user.systemLanguage, user.regionalLanguage, user.customDestinationLanguage]
      .map((language) => (language ?? '').trim().toLowerCase().split(/[-_]/)[0] ?? '')
      .filter((language) => language !== ''),
  ).size >= 2;

const DAY_MS = 24 * 60 * 60 * 1000;
/** La moyenne quotidienne lisse sur l'âge du compte, borné : un compte neuf ne paraît pas hyperactif, un ancien pas endormi. */
const HABIT_MIN_DAYS = 7;
const HABIT_MAX_DAYS = 60;
const ACTIVE_WINDOW_MS = 7 * DAY_MS;
const ACTIVE_CONVERSATIONS = 2;

type ProfileUser = LanguageFields & { readonly createdAt?: Date | null };

/**
 * CE QUE LE COMPTE PEUT FAIRE ET FAIT D'ORDINAIRE (#9635) — l'entrée du tirage des défis du jour :
 *
 *  - ses habitudes : chaque compteur d'engagement ÷ l'âge du compte en jours (borné entre 7 et 60). La base ne
 *    garde aucun historique par jour (`EngagementCounter` est cumulatif, `ConversationEngagement` ne tient que
 *    le jour courant) : c'est une moyenne lissée, pas « les 7 derniers jours » ;
 *  - ses capacités : des contacts (un ami accepté ou une conversation où il a écrit), des conversations actives
 *    (au moins deux où il a écrit depuis 7 jours), une communauté, plusieurs langues.
 *
 * Lue une fois par jour, au tirage (ou à un changement de mission), jamais sur la voie chaude d'un geste.
 */
export async function missionProfileOf(params: {
  readonly prisma: PrismaClient;
  readonly userId: string;
  readonly user: ProfileUser | null;
  readonly now: Date;
}): Promise<MissionProfile> {
  const { prisma, userId, user, now } = params;
  const [counters, friend, wrote, active, community] = await Promise.all([
    prisma.engagementCounter.findMany({ where: { userId }, select: { axisKey: true, count: true }, take: MISSION_HABIT_COUNTER_LIMIT }),
    prisma.friendRequest.findFirst({ where: { status: 'accepted', OR: [{ senderId: userId }, { receiverId: userId }] }, select: { id: true } }),
    prisma.conversationEngagement.findFirst({ where: { userId }, select: { id: true } }),
    prisma.conversationEngagement.count({ where: { userId, day: { gte: new Date(now.getTime() - ACTIVE_WINDOW_MS) } } }),
    prisma.communityMember.findFirst({ where: { userId, isActive: true }, select: { id: true } }),
  ]);
  const ageDays = user?.createdAt ? (now.getTime() - user.createdAt.getTime()) / DAY_MS : HABIT_MIN_DAYS;
  const days = Math.min(HABIT_MAX_DAYS, Math.max(HABIT_MIN_DAYS, ageDays));
  const habits: Partial<Record<EngagementOperationKey, number>> = Object.fromEntries(
    counters.map((c) => [c.axisKey as EngagementOperationKey, c.count / days]),
  );
  const capabilities: readonly MissionCapability[] = [
    ...(friend !== null || wrote !== null ? (['contacts'] as const) : []),
    ...(active >= ACTIVE_CONVERSATIONS ? (['active-conversations'] as const) : []),
    ...(community !== null ? (['communities'] as const) : []),
    ...(user !== null && isMultilingual(user) ? (['multilingual'] as const) : []),
  ];
  return { capabilities, habits };
}

/** Les colonnes du compte que `missionProfileOf` lit. */
export const MISSION_PROFILE_USER_SELECT = {
  createdAt: true,
  systemLanguage: true,
  regionalLanguage: true,
  customDestinationLanguage: true,
} as const;
