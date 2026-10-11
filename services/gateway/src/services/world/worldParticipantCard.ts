/**
 * LA FICHE D'UN PARTICIPANT DE WORLD WIDE (#10102) — ce que l'équipe lit d'une
 * personne entrée dans World Wide, pour MODÉRER. Contrat :
 * `@meeshy/shared/types/world-participant-card`. Décision et finalité :
 * `services/gateway/decisions/2026-10-11-l-equipe-lit-la-fiche-d-un-participant-de-world-wide-10102.md`.
 *
 * Ce module ne JUGE pas qui lit — la route le fait avant tout appel. Il ne fait
 * que deux choses : retrouver le participant DANS World Wide (jamais ailleurs :
 * la lecture porte l'id de la conversation, un participant d'une autre
 * conversation est introuvable), et PROJETER sa fiche champ par champ.
 *
 * La projection est une liste BLANCHE écrite ici, pas un `select` qu'on
 * espère étroit : une ligne qui porterait davantage (une adresse IP héritée
 * d'avant #9342, une ville de session, la chaîne User-Agent, une empreinte, un
 * e-mail, la présence) n'en ferait rien sortir.
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { WORLD_CONVERSATION_IDENTIFIER } from '@meeshy/shared/types/world';
import type { WorldParticipantCard, WorldParticipantClient } from '@meeshy/shared/types/world-participant-card';
import { majorVersion } from '../conversations/guestClient';

type CardPrisma = Pick<PrismaClient, 'conversation' | 'participant' | 'user' | 'userSession' | 'conversationShareLink'>;

export type LoadedWorldParticipantCard = {
  readonly card: WorldParticipantCard;
  readonly conversationId: string;
  /** Le `User.id` du compte lu — `null` pour un invité. */
  readonly userId: string | null;
};

type GuestClientRow = {
  readonly browser?: string | null;
  readonly browserVersion?: string | null;
  readonly os?: string | null;
  readonly osVersion?: string | null;
  readonly deviceType?: string | null;
} | null | undefined;

type SessionRow = {
  readonly country?: string | null;
  readonly deviceType?: string | null;
  readonly osName?: string | null;
  readonly osVersion?: string | null;
  readonly browserName?: string | null;
  readonly browserVersion?: string | null;
  readonly platform?: string | null;
  readonly appVersion?: string | null;
} | null;

const PARTICIPANT_CARD_SELECT = {
  id: true,
  type: true,
  userId: true,
  displayName: true,
  role: true,
  language: true,
  isActive: true,
  joinedAt: true,
  leftAt: true,
  bannedAt: true,
  shareLinkId: true,
  joinCountry: true,
  anonymousSession: {
    select: {
      shareLinkId: true,
      session: { select: { client: true } },
      profile: { select: { username: true } },
    },
  },
} as const;

const USER_CARD_SELECT = {
  username: true,
  role: true,
  systemLanguage: true,
  regionalLanguage: true,
  customDestinationLanguage: true,
  deviceLocale: true,
} as const;

const SESSION_CARD_SELECT = {
  country: true,
  deviceType: true,
  osName: true,
  osVersion: true,
  browserName: true,
  browserVersion: true,
  platform: true,
  appVersion: true,
} as const;

const SHARE_LINK_CARD_SELECT = { linkId: true, identifier: true, name: true } as const;

const orNull = (value: string | null | undefined): string | null =>
  typeof value === 'string' && value.length > 0 ? value : null;

function guestClient(row: GuestClientRow): WorldParticipantClient | null {
  if (!row) return null;
  return {
    browser: orNull(row.browser),
    browserVersion: majorVersion(row.browserVersion),
    os: orNull(row.os),
    osVersion: majorVersion(row.osVersion),
    deviceType: orNull(row.deviceType),
    platform: null,
    appVersion: null,
  };
}

function sessionClient(row: SessionRow): WorldParticipantClient | null {
  if (!row) return null;
  return {
    browser: orNull(row.browserName),
    browserVersion: majorVersion(row.browserVersion),
    os: orNull(row.osName),
    osVersion: majorVersion(row.osVersion),
    deviceType: orNull(row.deviceType),
    platform: orNull(row.platform),
    appVersion: orNull(row.appVersion),
  };
}

function participantType(type: string): WorldParticipantCard['participantType'] {
  if (type === 'anonymous' || type === 'bot') return type;
  return 'user';
}

function status(row: { readonly isActive: boolean; readonly bannedAt: Date | null; readonly leftAt: Date | null }): WorldParticipantCard['status'] {
  if (row.bannedAt) return 'banned';
  if (!row.isActive || row.leftAt) return 'left';
  return 'active';
}

/**
 * `null` : pas de World Wide, ou ce participant n'y est pas. Les deux se
 * disent de la même façon — la route ne révèle pas qu'un id existe ailleurs.
 */
export async function loadWorldParticipantCard(
  prisma: CardPrisma,
  participantId: string,
): Promise<LoadedWorldParticipantCard | null> {
  const world = await prisma.conversation.findFirst({
    where: { identifier: WORLD_CONVERSATION_IDENTIFIER },
    select: { id: true },
  });
  if (!world) return null;

  const participant = await prisma.participant.findFirst({
    where: { id: participantId, conversationId: world.id },
    select: PARTICIPANT_CARD_SELECT,
  });
  if (!participant) return null;

  const userId = participant.userId ?? null;
  const shareLinkId = participant.shareLinkId ?? participant.anonymousSession?.shareLinkId ?? null;

  const [user, session, link] = await Promise.all([
    userId ? prisma.user.findUnique({ where: { id: userId }, select: USER_CARD_SELECT }) : null,
    userId
      ? prisma.userSession.findFirst({
          where: { userId, isValid: true },
          orderBy: { lastActivityAt: 'desc' },
          select: SESSION_CARD_SELECT,
        })
      : null,
    shareLinkId ? prisma.conversationShareLink.findUnique({ where: { id: shareLinkId }, select: SHARE_LINK_CARD_SELECT }) : null,
  ]);

  const card: WorldParticipantCard = {
    participantId: participant.id,
    participantType: participantType(participant.type),
    displayName: participant.displayName,
    username: orNull(user?.username) ?? orNull(participant.anonymousSession?.profile?.username),
    conversationRole: participant.role,
    accountRole: user ? orNull(String(user.role)) : null,
    languages: {
      conversation: participant.language,
      system: orNull(user?.systemLanguage),
      regional: orNull(user?.regionalLanguage),
      customDestination: orNull(user?.customDestinationLanguage),
      deviceLocale: orNull(user?.deviceLocale),
    },
    country: orNull(participant.joinCountry) ?? orNull(session?.country),
    client: userId ? sessionClient(session) : guestClient(participant.anonymousSession?.session?.client),
    joinedAt: participant.joinedAt.toISOString(),
    shareLink: link ? { identifier: orNull(link.identifier), linkId: link.linkId, name: orNull(link.name) } : null,
    status: status(participant),
  };

  return { card, conversationId: world.id, userId };
}
