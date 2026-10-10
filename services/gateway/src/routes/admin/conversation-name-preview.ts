/**
 * De quoi NOMMER une conversation sans titre (#8876, règle R1).
 *
 * Une conversation directe n'a pas de titre : ce sont ses membres qui la nomment — « Awa
 * et Jean », « Awa, Jean et 3 autres ». Une console qui écrit « Conversation privée » à la
 * place oblige à ouvrir chaque ligne pour savoir de qui il s'agit.
 *
 * ## Qui peut lire ce nom
 *
 * Qui parle à qui EST l'inventaire des conversations, et l'inventaire est réservé au rang
 * d'administration (BIGBOSS, ADMIN — directive 2026-09-16). Les trois surfaces qui nomment
 * une conversation en passant (classement, signalement, journal d'audit) servent donc cet
 * aperçu à ce rang seulement : `allowed` est LA question, posée par l'appelant avec
 * `adminViewer(request).hasAdminRank`. Pour tout autre rôle la carte est VIDE — jamais
 * une liste de membres masquée plus loin.
 *
 * ## Ce qui part
 *
 * Trois membres actifs au plus (nom affiché, pseudo) et l'effectif actif : de quoi composer
 * le nom, rien d'autre — ni identifiant, ni avatar, ni présence, ni rôle. Une requête pour
 * toute la page, aucune pour une conversation qui a un titre.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { conversationActiveMemberCountSelect } from '../conversations/utils/active-member-count';
import { distinctObjectIds } from './oversight-people';

export const NAME_PREVIEW_MEMBERS = 3;

export type ConversationNamePreview = {
  readonly participants: ReadonlyArray<{ readonly displayName: string | null; readonly username: string | null }>;
  readonly total: number;
};

type TitledConversation = { readonly id: string; readonly title: string | null | undefined };

const isUntitled = (conversation: TitledConversation): boolean => !conversation.title?.trim();

export async function loadConversationNamePreviews(
  prisma: PrismaClient,
  conversations: ReadonlyArray<TitledConversation>,
  options: { readonly allowed: boolean }
): Promise<ReadonlyMap<string, ConversationNamePreview>> {
  if (!options.allowed) return new Map();
  const ids = distinctObjectIds(conversations.filter(isUntitled).map((conversation) => conversation.id));
  if (ids.length === 0) return new Map();

  const rows = await prisma.conversation.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      _count: { select: conversationActiveMemberCountSelect },
      participants: {
        where: { isActive: true },
        take: NAME_PREVIEW_MEMBERS,
        orderBy: { joinedAt: 'asc' },
        select: { displayName: true, user: { select: { username: true, displayName: true } } },
      },
    },
    take: ids.length,
  });

  return new Map(
    rows.map((row) => [
      row.id,
      {
        participants: row.participants.map((participant) => ({
          displayName: participant.user?.displayName?.trim() || participant.displayName?.trim() || null,
          username: participant.user?.username ?? null,
        })),
        total: row._count.participants,
      },
    ])
  );
}

/** Les deux clés servies à côté d'un nom — absentes (jamais vides) quand l'aperçu n'existe pas. */
export const servedNamePreview = (preview: ConversationNamePreview | undefined) =>
  preview === undefined ? {} : { participants: preview.participants, total: preview.total };

export const namePreviewSchema = {
  participants: {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        displayName: { type: 'string', nullable: true },
        username: { type: 'string', nullable: true },
      },
    },
  },
  total: { type: 'number' },
} as const;
