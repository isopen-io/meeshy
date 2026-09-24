import { viewOnceOpenedByMe, viewOnceSpent } from '@/lib/reading-mode/protection';

import type { Message } from './types';

/**
 * **LE CONTENU D'UNE VUE UNIQUE OUVERTE EST PURGÉ** (#7580, précision porteur
 * du 2026-09-23 : « Seul reste l'état déjà ouvert — identifiant, auteur,
 * heure, type »).
 *
 * Texte, traductions et pièces jointes (URL, vignette, transcription) sortent
 * de la rangée ; `consumedByMe` y entre. Le cache du fil étant PERSISTÉ, c'est
 * aussi ce qui les retire de l'IndexedDB. UN seul site de la purge, servi à
 * trois chemins : l'ouverture locale (`consumeViewOnceOptimistic`),
 * l'ouverture sur un autre de mes appareils (`message:consumed` de MOI), la
 * destruction serveur (`message:expired` d'une vue unique non éphémère), et le
 * chargement d'une page qui arrive déjà ouverte (`loadMessages`).
 */
export function sealViewOnce(message: Message): Message {
  return {
    ...message,
    consumedByMe: true,
    content: '',
    translations: [],
    attachments: [],
  };
}

/** La purge appliquée à LA rangée visée — les autres gardent leur référence. */
export function sealViewOnceIn(messages: readonly Message[], messageId: string): readonly Message[] {
  return messages.some((m) => m.id === messageId && m.isViewOnce)
    ? messages.map((m) => (m.id === messageId ? sealViewOnce(m) : m))
    : messages;
}

/**
 * **LA PURGE SERVEUR** (`message:view-once-purged`, #7578 § 3, #7644) : le
 * contenu part, la bulle reste. Elle ne dit PAS que je l'ai ouverte —
 * `consumedByMe` garde sa valeur — mais `isFullyConsumed` la fait lire
 * « déjà ouverte » (`viewOnceSpent`), puisqu'il n'y a plus rien à ouvrir.
 */
function purgeViewOnce(message: Message): Message {
  return {
    ...message,
    isFullyConsumed: true,
    content: '',
    translations: [],
    attachments: [],
  };
}

export function purgeViewOnceIn(messages: readonly Message[], messageId: string): readonly Message[] {
  return messages.some((m) => m.id === messageId && m.isViewOnce)
    ? messages.map((m) => (m.id === messageId ? purgeViewOnce(m) : m))
    : messages;
}

/** Une charge qui arrive DÉJÀ ouverte par moi, ou déjà purgée, ne garde rien de ce qu'elle porte. */
export function sealedIfOpened(message: Message): Message {
  if (viewOnceOpenedByMe(message)) return sealViewOnce(message);
  return viewOnceSpent(message) ? purgeViewOnce(message) : message;
}
