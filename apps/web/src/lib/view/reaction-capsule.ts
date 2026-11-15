import type { Message } from '@/lib/api/types';
import { TEXT_INDENT } from '@/lib/reading-mode/metrics';

import { isMineOf } from './message';
import { isSystemMessage } from './message-badges';

/**
 * SOUS QUEL MESSAGE SE POSE LA CAPSULE « + » (#10583) — le DERNIER message
 * REÇU du fil : ni un envoi du lecteur, ni une rangée système. Miroir
 * `ConversationViewModel.lastReceivedMessageId` (iOS), que
 * `BubbleReactionsOverlay` lit par `!isMe && isLastReceivedMessage`.
 *
 * Un envoi du lecteur APRÈS ce message ne déplace pas la capsule : elle reste
 * sous ce qu'on lui a dit en dernier. `null` : rien n'a été reçu.
 */
export function reactionCapsuleTargetId(input: { readonly messages: readonly Message[]; readonly viewerId: string }): string | null {
  return input.messages.findLast((message) => !isSystemMessage(message) && !isMineOf(message, input.viewerId))?.id ?? null;
}

/** Le rembourrage horizontal d'une bulle (`bubble.tsx`, `px-3.5`). */
const BUBBLE_TEXT_INSET = 14;

/**
 * OÙ COMMENCE LA CAPSULE — à la colonne du TEXTE du message qu'elle suit : la
 * colonne du nom en rangée plate (`TEXT_INDENT`), le bord intérieur de la bulle
 * sinon. Un message reçu commence toujours du côté du début de ligne.
 */
export function reactionCapsuleInset(input: { readonly flat: boolean }): number {
  return input.flat ? TEXT_INDENT : BUBBLE_TEXT_INSET;
}
