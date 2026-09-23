import { ephemeralDeadline, type EphemeralDeadline } from '@meeshy/shared/utils/ephemeral-deadline';

import type { Message } from '@/lib/api/types';

/**
 * LA RÉCEPTION LOCALE D'UN ÉPHÉMÈRE — l'autre moitié de la règle partagée
 * (`@meeshy/shared/utils/ephemeral-deadline`), celle qui ne peut PAS vivre
 * dans `packages/shared` parce qu'elle est un ÉTAT du client : l'instant où
 * CET appareil a vu le message pour la première fois.
 *
 * ## POURQUOI UN REGISTRE DE MODULE, ET PAS UN ÉTAT REACT
 *
 * Le contrat (#7451, point 2) dit « la PREMIÈRE réception, quel que soit le
 * chemin ». Sur le web, ces chemins sont deux — `message:new` (le direct) et
 * `GET …/messages` (le fil rouvert, la pagination) — et ils n'ont aucun
 * ancêtre React commun : le socket vit hors de l'arbre. Un `useState` porté
 * par le fil se réinitialiserait de surcroît à chaque changement de mode de
 * lecture, et RELANCERAIT le décompte — un message à 30 s resterait affiché
 * indéfiniment à qui bascule de Focal à Bulles toutes les 25 s.
 *
 * ## CE QUE L'OUBLI COÛTE, ET POURQUOI IL NE COÛTE PAS PLUS
 *
 * Ce registre vit en MÉMOIRE : un rechargement de page l'efface, et la
 * réception d'un message déjà reçu se ré-horodate. Cela ne peut qu'ALLONGER
 * l'échéance locale — et c'est précisément ce que la règle partagée retient
 * **jamais** : elle prend la plus PROCHE des deux, donc l'échéance SERVIE
 * (REST, contrat point 3) reprend la main dès qu'elle existe. Un registre
 * persistant achèterait une exactitude que le serveur donne déjà, au prix
 * d'un stockage de plus à purger.
 *
 * BORNÉ (dimension 3) : `Map` garde l'ordre d'insertion, la plus ancienne
 * entrée sort au-delà du plafond. Un fil ouvert des heures ne peut donc pas
 * faire croître ce registre sans fin.
 */

/** De quoi couvrir plusieurs fils ouverts sans jamais croître indéfiniment. */
const REGISTRY_CAPACITY = 1000;

const receptions = new Map<string, number>();
const servedDeadlines = new Map<string, number>();

function remember(registry: Map<string, number>, key: string, value: number): void {
  registry.set(key, value);
  if (registry.size <= REGISTRY_CAPACITY) return;
  const oldest = registry.keys().next();
  if (!oldest.done) registry.delete(oldest.value);
}

/**
 * LA PREMIÈRE VUE GAGNE — idempotent par construction : un `message:new`
 * suivi d'un rechargement du fil ne redate rien. C'est ce qui fait de cette
 * fonction un point d'entrée sûr pour TOUS les chemins de réception.
 */
export function noteEphemeralReception(messageId: string, atMs: number): void {
  if (receptions.has(messageId)) return;
  remember(receptions, messageId, atMs);
}

/**
 * L'ÉCHÉANCE SERVIE par `message:countdown-started` (#7451, point 5). Elle
 * n'écrase JAMAIS une échéance servie plus PROCHE : deux appareils d'un même
 * lecteur peuvent recevoir l'événement dans un ordre quelconque, et la règle
 * partagée retient la plus proche — ce registre applique la même discipline à
 * sa propre source, faute de quoi un événement en retard rallongerait la vie
 * d'un message.
 */
export function noteServedDeadline(messageId: string, expiresAt: string | Date): void {
  const ms = expiresAt instanceof Date ? expiresAt.getTime() : new Date(expiresAt).getTime();
  if (!Number.isFinite(ms)) return;
  const held = servedDeadlines.get(messageId);
  if (held !== undefined && held <= ms) return;
  remember(servedDeadlines, messageId, ms);
}

/** La première réception locale de ce message, ou `null` (#7547 — l'entrée du composeur de la ligne). */
export function receptionOf(messageId: string): number | null {
  return receptions.get(messageId) ?? null;
}

/** L'échéance servie par `message:countdown-started`, ou `null` (#7547). */
export function servedDeadlineOf(messageId: string): number | null {
  return servedDeadlines.get(messageId) ?? null;
}

/** Le message n'existe plus — ni son horodatage de réception, ni son échéance. */
export function forgetEphemeral(messageId: string): void {
  receptions.delete(messageId);
  servedDeadlines.delete(messageId);
}

/** Les témoins repartent d'un registre vide — jamais le produit. */
export function resetEphemeralReception(): void {
  receptions.clear();
  servedDeadlines.clear();
}

export type EphemeralMessageFields = Pick<Message, 'id' | 'expiresAt' | 'ephemeralDuration'>;

/**
 * LA RÈGLE, APPLIQUÉE À CE MESSAGE POUR CE LECTEUR — site UNIQUE d'appel de
 * `ephemeralDeadline()` dans le chantier.
 *
 * **L'HORODATAGE SE POSE ICI, PENDANT LE RENDU, ET C'EST DÉLIBÉRÉ.** La
 * première fois qu'un client PEINT un message est sa réception au sens du
 * contrat, quel que soit le chemin qui l'a apporté — et le poser dans un effet
 * ferait voir « en attente de réception » une image durant, à un destinataire
 * dont le décompte a déjà commencé. L'écriture est idempotente (première vue
 * gagne) : un double rendu, une virtualisation qui remonte la rangée ou un
 * changement de mode rendent tous la MÊME échéance.
 *
 * L'horodatage ne se pose QUE pour un destinataire d'un message à durée :
 * l'expéditeur n'a pas de réception (sa propre horloge dirait « envoi +
 * durée », le calcul que la directive retire), et un message sans durée n'a
 * rien à décompter.
 */
export function resolveEphemeralDeadline(input: {
  readonly message: EphemeralMessageFields;
  readonly isMine: boolean;
  readonly now: number;
}): EphemeralDeadline {
  const { message, isMine, now } = input;
  const duration = message.ephemeralDuration;
  const hasDuration = typeof duration === 'number' && Number.isFinite(duration) && duration > 0;
  if (!isMine && hasDuration) noteEphemeralReception(message.id, now);

  return ephemeralDeadline({
    ...(duration === undefined ? {} : { ephemeralDuration: duration }),
    servedExpiresAt: servedDeadlines.get(message.id) ?? message.expiresAt ?? null,
    receivedAtMs: receptions.get(message.id) ?? null,
    isMine,
  });
}

/**
 * `deadlineReached` A ÉTÉ RETIRÉE AU LOT #7468 — elle répondait « la rangée se
 * peint-elle encore ? » par OUI ou NON, et il y a désormais TROIS réponses :
 * visible, en destruction, partie. La question vit dans `destructionPhaseOf`
 * (`lib/view/ephemeral-destruction.ts`), qui la tranche seule ; garder ici une
 * seconde lecture de l'échéance aurait fait repartir la rangée sans effet au
 * premier appelant qui l'aurait préférée.
 */
