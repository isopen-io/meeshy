import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { isValidMongoId } from '@meeshy/shared/utils/conversation-helpers';
import { attachmentMediaSelect } from '../../../services/attachments/attachmentIncludes';
import { applyHistoryFloor } from '../../../services/historyFloor';

/**
 * Plafond d'affichage des listes membres / participants anonymes d'un lien de
 * partage (#4165). Aligné sur le plafond de `validatePagination` (≤ 100) : au
 * -delà, `totalMembers`/`totalAnonymousParticipants` (comptés à part, JAMAIS
 * dérivés de la longueur du tableau affiché) disent au client qu'il y en a
 * plus — c'est `membersHasMore`/`anonymousParticipantsHasMore` côté route.
 */
export const LINK_PARTICIPANT_DISPLAY_CAP = 100;

/** Sous-ensemble de `ParticipantPermissions` (schema.prisma) que `retrieval.ts` lit. */
type LinkParticipantPermissions = {
  canSendMessages: boolean;
  canSendFiles: boolean;
  canSendImages: boolean;
};

/** Sous-ensemble d'`AnonymousProfile` (schema.prisma) que `retrieval.ts` lit. */
type LinkAnonymousProfile = {
  username: string;
  firstName: string;
  lastName: string;
};

const senderInclude = {
  select: {
    id: true,
    displayName: true,
    avatar: true,
    type: true,
    language: true,
    isOnline: true,
    user: {
      select: {
        id: true,
        username: true,
        firstName: true,
        lastName: true,
        displayName: true,
        avatar: true,
        systemLanguage: true
      }
    }
  }
};

/**
 * Structure d'inclusion pour récupérer un lien de partage avec toutes ses relations
 */
export const shareLinkIncludeStructure = {
  conversation: {
    select: {
      id: true,
      identifier: true,
      title: true,
      description: true,
      type: true,
      createdAt: true
    }
  },
  creator: {
    select: {
      id: true,
      username: true,
      firstName: true,
      lastName: true,
      displayName: true
    }
  }
};

/**
 * Est-ce que `userId` a une participation ACTIVE de type `user` dans cette
 * conversation ? Requête ciblée et indexée — indépendante de l'effectif de la
 * conversation, à l'inverse de l'ancien `participants.find(...)` sur la
 * relation chargée en bloc (#4165). Sert à la fois la garde d'accès et le
 * calcul de `userType` : un lecteur `hasAccess` par le cas spécial "meeshy"
 * sans être réellement participant reste `userType: 'anonymous'`, comme avant.
 */
export async function findActiveUserParticipant(
  prisma: PrismaClient,
  conversationId: string,
  userId: string
): Promise<{ id: string } | null> {
  return prisma.participant.findFirst({
    where: { conversationId, userId, type: 'user', isActive: true },
    select: { id: true }
  });
}

/**
 * Page (bornée, `LINK_PARTICIPANT_DISPLAY_CAP`) des membres inscrits affichés
 * sur la fiche d'un lien. Ne sélectionne PAS `isOnline`/`lastActiveAt` : la
 * route les sert toujours masqués (lien consultable sans authentification),
 * les charger serait payer une colonne que rien ne lit.
 */
export async function findLinkMembers(
  prisma: PrismaClient,
  conversationId: string,
  take: number = LINK_PARTICIPANT_DISPLAY_CAP
): Promise<Array<{
  id: string;
  role: string;
  joinedAt: Date;
  user: { id: string; username: string; firstName: string | null; lastName: string | null; displayName: string | null; avatar: string | null } | null;
}>> {
  return prisma.participant.findMany({
    where: { conversationId, type: 'user', isActive: true },
    orderBy: { joinedAt: 'asc' },
    take: take,
    select: {
      id: true,
      role: true,
      joinedAt: true,
      user: {
        select: {
          id: true,
          username: true,
          firstName: true,
          lastName: true,
          displayName: true,
          avatar: true
        }
      }
    }
  });
}

/**
 * Page (bornée) des participants anonymes affichés. `isOnline`/`lastActiveAt`
 * SONT sélectionnés ici (contrairement aux membres) parce que la route les
 * gate — elle ne les tait pas — derrière `anonymousPresenceVisible`
 * (ADMIN/BIGBOSS uniquement, directive présence du 2026-08-25).
 */
export async function findLinkAnonymousParticipants(
  prisma: PrismaClient,
  conversationId: string,
  take: number = LINK_PARTICIPANT_DISPLAY_CAP
): Promise<Array<{
  id: string;
  displayName: string | null;
  avatar: string | null;
  language: string;
  isOnline: boolean;
  lastActiveAt: Date | null;
  joinedAt: Date;
  permissions: LinkParticipantPermissions | null;
  anonymousSession: { profile: LinkAnonymousProfile } | null;
}>> {
  return prisma.participant.findMany({
    where: { conversationId, type: 'anonymous', isActive: true },
    orderBy: { joinedAt: 'asc' },
    take: take,
    select: {
      id: true,
      displayName: true,
      avatar: true,
      language: true,
      isOnline: true,
      lastActiveAt: true,
      joinedAt: true,
      permissions: true,
      anonymousSession: { select: { profile: true } }
    }
  });
}

/** Effectifs VRAIS (membres inscrits / participants anonymes actifs) — comptés
 * à part des pages ci-dessus pour que `totalMembers`/`totalAnonymousParticipants`
 * restent exacts même quand l'affichage est tronqué au plafond. */
export async function countLinkParticipantsByType(
  prisma: PrismaClient,
  conversationId: string
): Promise<{ totalMembers: number; totalAnonymousParticipants: number }> {
  const [totalMembers, totalAnonymousParticipants] = await Promise.all([
    prisma.participant.count({ where: { conversationId, type: 'user', isActive: true } }),
    prisma.participant.count({ where: { conversationId, type: 'anonymous', isActive: true } })
  ]);
  return { totalMembers, totalAnonymousParticipants };
}

/** Effectif des participants anonymes actuellement en ligne — appelant
 * uniquement quand `anonymousPresenceVisible` (sinon la route sert `0`, comme
 * avant : la présence hors ADMIN/BIGBOSS n'a jamais été vraie sur cette route). */
export async function countOnlineAnonymousParticipants(
  prisma: PrismaClient,
  conversationId: string
): Promise<number> {
  return prisma.participant.count({
    where: { conversationId, type: 'anonymous', isActive: true, isOnline: true }
  });
}

/**
 * Récupère un lien de partage par différents identifiants
 */
export async function findShareLinkByIdentifier(
  prisma: PrismaClient,
  identifier: string
): Promise<any> {
  const isObjectId = isValidMongoId(identifier);

  if (isObjectId) {
    return prisma.conversationShareLink.findUnique({
      where: { id: identifier },
      include: shareLinkIncludeStructure
    });
  }

  // `mshy_*` peut être un linkId (`mshy_<objId>.<ts>`) OU un identifier custom
  // (`mshy_meeshy-public`). Ne PAS supposer que tout `mshy_*` est un linkId —
  // un identifier custom ne matcherait jamais via findUnique(linkId). Accepter
  // les deux (cohérent avec le fix join `ab22f62ac`).
  return prisma.conversationShareLink.findFirst({
    where: { OR: [{ linkId: identifier }, { identifier: identifier }] },
    include: shareLinkIncludeStructure
  });
}

/**
 * Ce que le LECTEUR a le droit de relire. `historyFloor` est le plancher rendu
 * par `services/historyFloor` pour sa participation ; `null` = tout. Les trois
 * lecteurs de ce module l'appliquent par la même fonction, jamais par une
 * clause écrite à la main.
 */
export type LinkMessageReadOptions = {
  readonly historyFloor?: Date | null;
};

/**
 * Récupère les messages d'une conversation avec pagination
 *
 * Ne charge PAS `statusEntries` : ce chemin les ramenait sans qu'aucun lecteur
 * ne les regarde — `formatMessageWithUnifiedSender`, seul formateur en aval,
 * ne les recopie même pas. Une relation payée à chaque page pour rien.
 */
export async function getConversationMessages(
  prisma: PrismaClient,
  conversationId: string,
  limit: number,
  offset: number,
  options: LinkMessageReadOptions = {}
): Promise<any[]> {
  return prisma.message.findMany({
    where: applyHistoryFloor({ conversationId, deletedAt: null }, options.historyFloor ?? null),
    orderBy: { createdAt: 'desc' },
    take: limit,
    skip: offset,
    include: {
      sender: senderInclude
    }
  });
}

/**
 * Récupère les messages avec toutes les relations pour l'endpoint /messages
 *
 * Ne charge PAS `statusEntries` : `formatLinkMessageWithDetails` les
 * recopiait bien, mais `messageSchema` (`routes/links/types.ts`) ne les déclare
 * pas — `fast-json-stringify` retirait le tableau juste après. Chargé, recopié,
 * jeté, sur CHAQUE page de messages d'un lien partagé et sans opt-in possible.
 *
 * Les rétablir demanderait de déclarer le champ au schéma, donc de publier des
 * accusés NOMINATIFS : à faire alors via le gate `showReadReceipts`
 * (`MessageReadStatusService.filterReadReceiptVisible`), comme le fait déjà
 * `GET /conversations/:id/statuses`.
 *
 * Ne charge pas non plus les pièces jointes ni les réactions du message CITÉ :
 * `formatReplyToMessage` ne rend d'une citation que son texte et son auteur, il
 * ne les a jamais recopiées. C'était une jointure imbriquée par page pour des
 * données qui n'atteignaient même pas le sérialiseur. Les pièces jointes et
 * réactions du message RACINE, elles, sont chargées ET servies.
 */
export async function getConversationMessagesWithDetails(
  prisma: PrismaClient,
  conversationId: string,
  limit: number,
  offset: number,
  options: LinkMessageReadOptions = {}
): Promise<any[]> {
  return prisma.message.findMany({
    where: applyHistoryFloor({ conversationId, deletedAt: null }, options.historyFloor ?? null),
    orderBy: { createdAt: 'desc' },
    take: limit,
    skip: offset,
    include: {
      sender: senderInclude,
      attachments: { select: attachmentMediaSelect },
      replyTo: {
        include: {
          sender: senderInclude
        }
      },
      reactions: {
        select: {
          id: true,
          emoji: true,
          participantId: true,
          createdAt: true
        }
      }
    }
  });
}

/**
 * Compte le nombre total de messages dans une conversation
 */
export async function countConversationMessages(
  prisma: PrismaClient,
  conversationId: string,
  options: LinkMessageReadOptions = {}
): Promise<number> {
  return prisma.message.count({
    where: applyHistoryFloor({ conversationId, deletedAt: null }, options.historyFloor ?? null)
  });
}
