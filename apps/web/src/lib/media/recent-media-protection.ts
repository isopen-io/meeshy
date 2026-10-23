import { maskedAttachment, type AttachmentProtectionFlags } from '@meeshy/shared/utils/attachment-protection';
import { resolveLastMessageSummaryKind } from '@meeshy/shared/utils/last-message-protection';

import type { Message } from '@/lib/api/types';
import { protectionOf } from '@/lib/reading-mode/protection';

import type { RecentMediaProtection } from './recent-media-policy';

/**
 * CE QU'UN MESSAGE PERMET DE GARDER HORS LIGNE (#12052) — PURE. Le seau
 * « récents » (#11326) garde trois jours le fichier ENTIER d'un média vu : il
 * survivrait à l'échéance d'un éphémère, à l'ouverture d'une vue unique, au
 * voile d'un flouté, au régime d'un chiffré. Seul un message STANDARD, en
 * clair, sur une pièce sans masque, rend `none`.
 *
 * Deux lois, parce qu'aucune ne suffit seule : `protectionOf` (la bulle) dit
 * « standard » un éphémère tant que son échéance n'est pas passée ;
 * `resolveLastMessageSummaryKind` (l'aperçu) le dit `ephemeralActive`. La
 * protection de la PIÈCE (`maskedAttachment`) se lit sur la pièce SERVIE,
 * jamais sur sa copie révélée par la visionneuse.
 */
export function recentMediaProtectionOf({
  message,
  attachment,
  conversationEncrypted,
  now,
}: {
  readonly message: Message | undefined;
  readonly attachment: AttachmentProtectionFlags | undefined;
  readonly conversationEncrypted: boolean;
  readonly now: number;
}): RecentMediaProtection {
  if (message === undefined || attachment === undefined || conversationEncrypted) return 'protected';
  if (message.isEncrypted || message.encryptionMode != null) return 'protected';
  if (protectionOf(message, now) !== 'standard') return 'protected';
  if (resolveLastMessageSummaryKind(message, new Date(now)) !== 'standard') return 'protected';
  return maskedAttachment(attachment) ? 'protected' : 'none';
}
