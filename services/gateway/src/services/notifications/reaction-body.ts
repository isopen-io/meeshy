/**
 * Le corps d'une notification de RÉACTION à un message — extrait de
 * `NotificationService.ts` (#14309). Fonction PURE.
 *
 * Le corps porte l'action ET le message visé : le sous-titre d'une notification
 * de conversation est déjà pris par le nom du groupe, et le destinataire doit
 * pouvoir dire À QUEL message on a réagi quand il en a écrit plusieurs.
 *
 * #14309 — le message visé se dit par sa SYNTHÈSE (« Message texte », « Image
 * haute définition »), jamais par son texte.
 *
 * Cycle 123 bis — un message PROTÉGÉ (éphémère / vue unique / flouté /
 * chiffré) ne se décrit pas du tout, et le corps se réduit à l'action : la
 * protection ne parle pas de qui SAIT (l'auteur connaît son texte), elle parle
 * de ce qui S'AFFICHE. Pas de `notificationLocKey` ici : les clients s'en
 * servent pour REMPLACER le corps, ce qui effacerait « a réagi 🔥 ».
 */

import { notificationString } from '@meeshy/shared/utils/notification-strings';

import { contentSynthesis, type SynthesisAttachment } from './content-synthesis';
import { protectedPreview } from './notification-preview';

export type ReactedMessage = {
  readonly content?: string | null;
  readonly messageType?: string | null;
  readonly isEncrypted?: boolean | null;
  readonly isViewOnce?: boolean | null;
  readonly isBlurred?: boolean | null;
  readonly effectFlags?: number | null;
  readonly expiresAt?: Date | null;
  readonly attachments?: ReadonlyArray<SynthesisAttachment> | null;
};

/** La synthèse du message réagi, ou `''` quand il est protégé ou vide. */
export function reactedMessageSynthesis(lang: string, message: ReactedMessage | null): string {
  if (!message) return '';
  const isProtected = protectedPreview({ ...message, messageType: message.messageType ?? null, expiresAt: message.expiresAt ?? null }) !== null;
  if (isProtected) return '';
  return contentSynthesis(lang, { text: message.content, attachments: message.attachments ?? [] });
}

export function reactionBody(lang: string, emoji: string, synthesis: string): string {
  const action = notificationString(lang, 'reaction.message', { emoji });
  return synthesis ? `${action} · ${synthesis}` : action;
}
