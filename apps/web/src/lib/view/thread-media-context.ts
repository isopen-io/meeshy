import { createContext, useMemo } from 'react';

import type { Conversation } from '@/lib/api/types';
import { avatarOf, titleOf } from './conversation';

/**
 * CE QUE LE FIL PRÊTE À SES PIÈCES JOINTES (#6303) — une tuile touchée DANS
 * LE FIL ouvre la visionneuse conversation-entière et sait y répondre en
 * citant la pièce. Un contexte plutôt qu'une propriété : les rangées du fil
 * (`Bubble`, `FocalRow`) sont mémoïsées, et deux champs de plus à relayer à
 * travers elles seraient deux occasions de casser leur égalité. Hors du fil
 * (écran des médias, flux, admin), aucun fournisseur : `Attachments` garde sa
 * pellicule du message, et aucune action n'est offerte qu'il ne saurait tenir.
 *
 * La valeur doit être STABLE (`useMemo` chez l'hôte) : elle est lue par chaque
 * grille de médias du fil.
 */
export type ThreadMediaContextValue = {
  readonly viewerId: string;
  readonly onReplyToMedia: (messageId: string, attachmentId: string) => void;
  /** Le nom et l'avatar de la conversation, que la carte de lecture de la coque montre (#10624). */
  readonly conversationTitle?: string | undefined;
  readonly conversationAvatarUrl?: string | undefined;
  /** Le régime de chiffrement de la conversation (#10700) — « Transcrire » ne s'offre pas quand le serveur ne la lit pas. */
  readonly conversationEncryptionMode?: string | null | undefined;
};

export const ThreadMediaContext = createContext<ThreadMediaContextValue | null>(null);

/** La valeur STABLE que le fil prête à ses pièces, avec le nom et l'avatar de la conversation (#10624). */
export function useThreadMediaValue(params: {
  readonly viewerId: string;
  readonly onReplyToMedia: ThreadMediaContextValue['onReplyToMedia'];
  readonly conversation: Conversation | undefined;
}): ThreadMediaContextValue {
  const { viewerId, onReplyToMedia, conversation } = params;
  const conversationTitle = conversation !== undefined ? titleOf(conversation, viewerId) : undefined;
  const conversationAvatarUrl = conversation !== undefined ? avatarOf(conversation, viewerId) : undefined;
  const conversationEncryptionMode = conversation?.encryptionMode ?? null;
  return useMemo(
    () => ({ viewerId, onReplyToMedia, conversationTitle, conversationAvatarUrl, conversationEncryptionMode }),
    [viewerId, onReplyToMedia, conversationTitle, conversationAvatarUrl, conversationEncryptionMode],
  );
}
