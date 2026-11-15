import type { Attachment } from '@/lib/api/types';

/**
 * CE QU'UNE PASTILLE DE RÉACTIONS DE PIÈCE A À DIRE (#7894) — miroir de
 * `AttachmentReactionBadgeModel.make` (`apps/ios/Meeshy/Features/Main/Views/
 * AttachmentReactionBadge.swift`). `null` ⇒ la pastille n'existe pas (loi 4 :
 * une pastille sans réaction n'est pas une pastille vide).
 *
 * Au plus TROIS émojis, triés pour rester stables d'un rendu à l'autre ; le
 * TOTAL compte toutes les réactions, y compris celles que le plafond laisse
 * dehors. « La mienne » ne tient que si l'un de MES émojis compte encore dans
 * le résumé servi : `attachment:reaction-*` remplace le résumé sans jamais
 * dire à qui appartient chaque réaction.
 */
export const ATTACHMENT_REACTION_BADGE_MAX_EMOJIS = 3;

export type AttachmentReactionBadgeModel = {
  readonly emojis: readonly string[];
  readonly total: number;
  readonly mine: boolean;
};

export function attachmentReactionBadge(
  attachment: Pick<Attachment, 'reactionSummary' | 'currentUserReactions'>,
): AttachmentReactionBadgeModel | null {
  const counted = Object.entries(attachment.reactionSummary ?? {}).filter(([, count]) => count > 0);
  if (counted.length === 0) return null;
  const summary = Object.fromEntries(counted);
  return {
    emojis: counted
      .map(([emoji]) => emoji)
      .sort()
      .slice(0, ATTACHMENT_REACTION_BADGE_MAX_EMOJIS),
    total: counted.reduce((sum, [, count]) => sum + count, 0),
    mine: (attachment.currentUserReactions ?? []).some((emoji) => (summary[emoji] ?? 0) > 0),
  };
}
