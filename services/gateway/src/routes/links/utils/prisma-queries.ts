import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { isValidMongoId } from '@meeshy/shared/utils/conversation-helpers';
import { attachmentMediaSelect } from '../../../services/attachments/attachmentIncludes';
import { applyHistoryFloor } from '../../../services/historyFloor';

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
      createdAt: true,
      participants: {
        where: { isActive: true },
        select: {
          id: true,
          type: true,
          displayName: true,
          avatar: true,
          language: true,
          isOnline: true,
          lastActiveAt: true,
          isActive: true,
          role: true,
          joinedAt: true,
          userId: true,
          permissions: true,
          // Ce qui décide du PLANCHER d'historique du lecteur (`historyFloorFor`)
          // — la ligne du lien est le seul endroit où `retrieval.ts` lit sa
          // participation, donc elle doit porter toute la règle.
          shareLinkId: true,
          historyVisibleFrom: true,
          // `profile` et `rights` UNIQUEMENT : `anonymousSession.session` porte
          // le hash du jeton, l'IP et l'empreinte appareil — jamais exposables
          // sur une route consultable sans authentification.
          anonymousSession: { select: { profile: true, rights: true } },
          user: {
            select: {
              id: true,
              username: true,
              firstName: true,
              lastName: true,
              displayName: true,
              avatar: true,
              systemLanguage: true,
              isOnline: true,
              lastActiveAt: true
            }
          }
        }
      }
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
