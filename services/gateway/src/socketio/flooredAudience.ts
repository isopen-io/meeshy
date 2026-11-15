import { ROOMS } from '@meeshy/shared/types/socketio-events';

import { blockedReaderKeys, messageReadership, type MessageReadership } from './editedAudience';
import type { EditAudiencePrisma } from './editedAudience';

/**
 * **La room de conversation, MOINS les lecteurs sous plancher** — pour les
 * émissions directes qui portent le texte d'un message sans passer par la
 * diffusion chaînée.
 *
 * ─── Pourquoi un module, et pas deux `if` sur place ──────────────────────────
 *
 * `message:attachment-updated` a reçu le plancher en #17025. Deux canaux
 * FRÈRES, **dans la même fonction et sept lignes plus haut**, partaient nus
 * (#18623) :
 *
 * | site | ce qui partait |
 * |---|---|
 * | `transcription:ready` | `transcription.text`, `segments`, `speakerAnalysis` |
 * | `audio-translation:*` | le texte traduit, `segments`, et l'URL de la piste TTS |
 *
 * L'invité entré par un lien qui refuse l'historique est dans
 * `conversation:<id>` dès le handshake (`join-user-conversations.ts`, sous
 * `PARTICIPATION_VIVANTE` seul) : il recevait donc le texte intégral **une
 * milliseconde avant** la garde du site voisin.
 *
 * **La règle qui doit être retapée à chaque site est celle qu'un site finira
 * par ne pas avoir** — c'est déjà pourquoi `editedAudience` existe. Ce module
 * est la même raison, pour la forme « room directe ».
 *
 * ─── Ce que la forme « room directe » exige de plus ──────────────────────────
 *
 * `emitToConversationParticipants` ne convient PAS ici : il chaîne la room de
 * conversation AVEC la room personnelle de chaque participant, ce qui
 * ÉLARGIRAIT l'audience de ces deux événements. On veut l'audience
 * d'aujourd'hui, moins les exclus — jamais plus.
 *
 * D'où `except`, qui retire une socket de la diffusion ENTIÈRE (et non d'une
 * chaîne) : un lecteur sous plancher assis dans `conversation:<id>` en sort.
 *
 * ─── Le troisième état, et il n'est pas décoratif ────────────────────────────
 *
 * `'unknown'` — la loi n'a pas conclu — se tait, comme sur les chemins
 * d'édition et d'enrichissement. On ne sait NI qui est bloqué, NI qui est
 * autorisé ; diffuser à la room servirait le texte à un lecteur peut-être sans
 * droit. Ce qui se perd est une transcription que la relecture du fil sert de
 * toute façon, le message restant en base.
 */
export type FlooredAudience =
  | { readonly kind: 'unknown' }
  | { readonly kind: 'ok'; readonly exceptRooms: readonly string[] };

export async function flooredAudience(
  prisma: EditAudiencePrisma,
  conversationId: string,
  messageId: string,
  onError?: (error: unknown) => void,
): Promise<FlooredAudience> {
  const readership: MessageReadership = await messageReadership(prisma, conversationId, messageId, onError);
  if (readership.kind === 'unknown') return { kind: 'unknown' };
  return { kind: 'ok', exceptRooms: [...blockedReaderKeys(readership)].map((key) => ROOMS.user(key)) };
}

/** Ce qu'une cible de diffusion doit savoir faire pour qu'on puisse en RETIRER quelqu'un. */
export type ExcludingTarget<T> = T & { except(room: string): T };

const canExcept = <T extends object>(target: T): target is ExcludingTarget<T> =>
  typeof (target as { except?: unknown }).except === 'function';

/**
 * La cible d'émission, amputée des rooms exclues.
 *
 * **`null` quand la cible ne sait pas exclure alors qu'il y a quelqu'un à
 * exclure** : la porte échoue en montrant MOINS, jamais plus — la même
 * discipline que `emitEditedToReaders`. Sans exclusion à faire, la cible
 * traverse intacte, donc aucun appelant ne paie pour un cas qui ne le concerne
 * pas.
 */
export function targetWithout<T extends object>(target: T, exceptRooms: readonly string[]): T | null {
  if (exceptRooms.length === 0) return target;
  if (!canExcept(target)) return null;
  return exceptRooms.reduce<T>((acc, room) => (canExcept(acc) ? acc.except(room) : acc), target);
}
