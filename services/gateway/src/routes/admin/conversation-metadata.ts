/**
 * Les MÉTADONNÉES d'une conversation telles que l'administration les sert
 * (#7999) — partagées par `GET /admin/users/:userId/conversations` (la liste de
 * la fiche d'un membre) et `PATCH /admin/conversations/:id`
 * (`conversation-settings-sovereign.ts`), qui rend la même forme après
 * écriture : l'écran qui vient de configurer relit la ligne qu'il affiche.
 *
 * Des métadonnées, jamais un contenu : lire ce qui s'y dit est un geste
 * souverain à part (`conversation-messages-sovereign.ts`, motif et trace).
 */
import type { Prisma } from '@meeshy/shared/prisma/client';
import { conversationActiveMemberCountSelect } from '../conversations/utils/active-member-count';

export const CONVERSATION_METADATA_SELECT = {
  id: true,
  identifier: true,
  title: true,
  description: true,
  type: true,
  avatar: true,
  banner: true,
  isActive: true,
  closedAt: true,
  communityId: true,
  createdAt: true,
  updatedAt: true,
  lastMessageAt: true,
  defaultWriteRole: true,
  isAnnouncementChannel: true,
  slowModeSeconds: true,
  autoTranslateEnabled: true,
  encryptionMode: true,
  // Même règle que `GET /conversations` : la colonne `memberCount` n'est écrite
  // par personne. Le compte vient de la base.
  _count: { select: conversationActiveMemberCountSelect },
  conversationMessageStats: { select: { totalMessages: true } },
} as const satisfies Prisma.ConversationSelect;

export type ConversationMetadataRow = Prisma.ConversationGetPayload<{ select: typeof CONVERSATION_METADATA_SELECT }>;

/**
 * La ligne servie : les réglages regroupés sous `settings`, l'effectif et le
 * nombre de messages aplatis — `messageCount` vaut `null` quand la ligne de
 * statistiques n'existe pas, jamais `0` (ce serait affirmer un fil vide).
 */
export function serveConversationMetadata(conv: ConversationMetadataRow) {
  const {
    _count,
    conversationMessageStats,
    defaultWriteRole,
    isAnnouncementChannel,
    slowModeSeconds,
    autoTranslateEnabled,
    encryptionMode,
    ...metadonnees
  } = conv;
  return {
    ...metadonnees,
    memberCount: _count?.participants ?? 0,
    messageCount: conversationMessageStats?.totalMessages ?? null,
    settings: { defaultWriteRole, isAnnouncementChannel, slowModeSeconds, autoTranslateEnabled, encryptionMode },
  };
}
