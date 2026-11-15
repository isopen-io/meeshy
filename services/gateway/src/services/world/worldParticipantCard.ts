/**
 * LA FICHE D'UN PARTICIPANT DE WORLD WIDE (#10102) — ce que l'équipe lit d'une
 * personne entrée dans World Wide, pour MODÉRER. Contrat :
 * `@meeshy/shared/types/world-participant-card`. Décision et finalité :
 * `services/gateway/decisions/2026-10-11-l-equipe-lit-la-fiche-d-un-participant-de-world-wide-10102.md`.
 *
 * Ce module ne JUGE pas qui OUVRE la fiche — la route le fait avant tout appel.
 * Il fait trois choses : retrouver le participant DANS World Wide (jamais
 * ailleurs : la lecture porte l'id de la conversation, un participant d'une
 * autre conversation est introuvable), décider ce que le lecteur lit d'un
 * COMPTE — la hiérarchie, la règle de `requireHierarchy` : rôle global, rangs
 * du Prisme et session ne sortent que pour qui SURCLASSE la cible, ou pour
 * elle-même ; sinon la session n'est même pas lue —, et PROJETER sa fiche
 * champ par champ.
 *
 * La projection est une liste BLANCHE écrite ici, pas un `select` qu'on
 * espère étroit : une ligne qui porterait davantage (une adresse IP héritée
 * d'avant #9342, une ville de session, la chaîne User-Agent, une empreinte, un
 * e-mail, la présence) n'en ferait rien sortir. Le visage (`avatar`, #12571) y
 * est un champ NOMMÉ, résolu par la loi partagée `resolveParticipantAvatar`.
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { resolveParticipantAvatar } from '@meeshy/shared/utils/participant-helpers';
import { WORLD_CONVERSATION_IDENTIFIER } from '@meeshy/shared/types/world';
import type { WorldParticipantCard, WorldParticipantClient } from '@meeshy/shared/types/world-participant-card';
import { majorVersion } from '../conversations/guestClient';
import { permissionsService } from '../admin/permissions.service';
import type { UserRoleEnum } from '@meeshy/shared/types';

type CardPrisma = Pick<PrismaClient, 'conversation' | 'participant' | 'user' | 'userSession' | 'conversationShareLink'>;

/** Qui lit — un COMPTE que la route a déjà admis. */
export type WorldParticipantCardReader = { readonly userId: string; readonly role: string };

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
  avatar: true,
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
  avatar: true,
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
 * Le lecteur lit-il le COMPTE de la cible ? Soi-même, toujours ; sinon il doit
 * la SURCLASSER strictement (`canManageUser`, la comparaison de
 * `requireHierarchy`). Une cible sans ligne `User`, ou dont le rôle ne se
 * compare pas, est retenue : fail-closed.
 */
function readsAccountOf(reader: WorldParticipantCardReader, targetUserId: string, targetRole: string | null): boolean {
  if (targetUserId === reader.userId) return true;
  if (!targetRole) return false;
  return permissionsService.canManageUser(reader.role as UserRoleEnum, targetRole as UserRoleEnum);
}

/**
 * `null` : pas de World Wide, ou ce participant n'y est pas. Les deux se
 * disent de la même façon — la route ne révèle pas qu'un id existe ailleurs.
 */
export async function loadWorldParticipantCard(
  prisma: CardPrisma,
  participantId: string,
  reader: WorldParticipantCardReader,
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

  const [user, link] = await Promise.all([
    userId ? prisma.user.findUnique({ where: { id: userId }, select: USER_CARD_SELECT }) : null,
    shareLinkId ? prisma.conversationShareLink.findUnique({ where: { id: shareLinkId }, select: SHARE_LINK_CARD_SELECT }) : null,
  ]);

  const accountDetailsWithheld = userId !== null && !readsAccountOf(reader, userId, user ? orNull(String(user.role)) : null);
  const account = accountDetailsWithheld ? null : user;
  const session = userId && account
    ? await prisma.userSession.findFirst({
        where: { userId, isValid: true },
        orderBy: { lastActivityAt: 'desc' },
        select: SESSION_CARD_SELECT,
      })
    : null;

  const card: WorldParticipantCard = {
    participantId: participant.id,
    participantType: participantType(participant.type),
    displayName: participant.displayName,
    /* Le VISAGE du fil, lu sur `user` (jamais sur `account`) : la hiérarchie
       retient les détails d'un compte, pas la photo qu'il montre déjà à toute la conversation. */
    avatar: resolveParticipantAvatar({ avatar: participant.avatar ?? null, user: { avatar: user?.avatar ?? null } }),
    username: orNull(user?.username) ?? orNull(participant.anonymousSession?.profile?.username),
    conversationRole: participant.role,
    accountRole: account ? orNull(String(account.role)) : null,
    languages: {
      conversation: participant.language,
      system: orNull(account?.systemLanguage),
      regional: orNull(account?.regionalLanguage),
      customDestination: orNull(account?.customDestinationLanguage),
      deviceLocale: orNull(account?.deviceLocale),
    },
    country: orNull(participant.joinCountry) ?? orNull(session?.country),
    client: userId ? sessionClient(session) : guestClient(participant.anonymousSession?.session?.client),
    joinedAt: participant.joinedAt.toISOString(),
    shareLink: link ? { identifier: orNull(link.identifier), linkId: link.linkId, name: orNull(link.name) } : null,
    status: status(participant),
    accountDetailsWithheld,
  };

  return { card, conversationId: world.id, userId };
}
