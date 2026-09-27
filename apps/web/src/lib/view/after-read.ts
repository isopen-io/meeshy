import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';

import type { Message } from '@/lib/api/types';

/**
 * LA FLAMME-ŒIL (#8304, contrat #8302) — `EPHEMERAL | EPHEMERAL_AFTER_READ`,
 * sans `ephemeralDuration` : le message disparaît chez chaque lecteur quand il
 * l'a VU puis a QUITTÉ la conversation. Le BIT fait foi, jamais l'absence de
 * durée (un éphémère ancien peut en manquer) : c'est lui que la passerelle
 * recompose (`MessageProcessor.saveMessage`) et que ce module lit.
 */
export function isAfterReadMessage(message: Pick<Message, 'effectFlags'>): boolean {
  return ((message.effectFlags ?? 0) & MESSAGE_EFFECT_FLAGS.EPHEMERAL_AFTER_READ) !== 0;
}

/**
 * CE QUE LE LECTEUR A VU — la détection de lecture existante
 * (`use-read-tracking.ts`) avance une FRONTIÈRE quand le bas du fil entre
 * dans le cadre, fenêtre visible et sans couche par-dessus : tout ce qui la
 * précède a été montré. Ce module n'invente pas une seconde détection ; il
 * relit cette frontière, et ne retient que les flammes-œil REÇUES encore
 * présentes (jamais les siennes : l'expéditeur garde son message jusqu'à
 * l'expiration serveur, jamais une supprimée : il n'y a plus rien à retirer).
 */
export function afterReadSeenUpTo(input: {
  readonly messages: readonly Message[];
  readonly boundaryId: string;
  readonly viewerId: string;
}): readonly string[] {
  const { messages, boundaryId, viewerId } = input;
  const end = messages.findIndex((m) => m.id === boundaryId);
  if (end < 0) return [];
  return messages
    .slice(0, end + 1)
    .filter((m) => isAfterReadMessage(m) && m.senderId !== viewerId && m.deletedAt == null)
    .map((m) => m.id);
}
