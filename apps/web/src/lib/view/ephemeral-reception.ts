import { EPHEMERAL_UNRECEIVED_RETENTION_MS } from '@meeshy/shared/utils/ephemeral-countdown';
import { ephemeralDeadline, type EphemeralDeadline } from '@meeshy/shared/utils/ephemeral-deadline';

import type { Message } from '@/lib/api/types';

import { isAfterReadMessage } from './after-read';

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
 * ## LA RÉCEPTION SURVIT AU RECHARGEMENT (#8900)
 *
 * Ce registre a longtemps vécu en MÉMOIRE seule, avec un raisonnement faux :
 * « l'échéance SERVIE reprend la main dès qu'elle existe ». Pour un éphémère
 * reçu par `message:new`, elle n'existe PAS — la diffusion en room ne porte
 * aucun `expiresAt` (voulu, `messageNewPayload.ts`) — et le cache persisté
 * le rend tel quel au rechargement. Chaque rechargement ré-horodatait donc la
 * réception, et le message revivait une durée ENTIÈRE. Les réceptions sont
 * désormais écrites dans le stockage local (`localStorage`, identifiants et
 * instants seulement — jamais un contenu), relues au premier accès et PURGÉES
 * au-delà de la rétention d'un éphémère. Un stockage refusé (navigation
 * privée, quota) laisse le registre tenir en mémoire, sans erreur.
 *
 * Les échéances servies par `message:countdown-started` restent en mémoire :
 * la passerelle les ressert par REST à chaque relecture du fil.
 *
 * BORNÉ (dimension 3) : `Map` garde l'ordre d'insertion, la plus ancienne
 * entrée sort au-delà du plafond. Un fil ouvert des heures ne peut donc pas
 * faire croître ce registre sans fin.
 */

/** De quoi couvrir plusieurs fils ouverts sans jamais croître indéfiniment. */
const REGISTRY_CAPACITY = 1000;

const RECEPTIONS_KEY = 'meeshy.ephemeral-receptions';

/** Au-delà, aucun éphémère reçu n'est plus servi ni affiché — la réception ne sert plus rien. */
const RECEPTION_RETENTION_MS = EPHEMERAL_UNRECEIVED_RETENTION_MS;

export type ReceptionStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

const receptions = new Map<string, number>();
const servedDeadlines = new Map<string, number>();

function browserReceptionStorage(): ReceptionStorage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

let storage: ReceptionStorage | null = null;
let loaded = false;

function readStored(from: ReceptionStorage, now: number): readonly (readonly [string, number])[] {
  try {
    const raw = from.getItem(RECEPTIONS_KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return [];
    return Object.entries(parsed as Record<string, unknown>)
      .filter((entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isFinite(entry[1]))
      .filter(([, at]) => now - at < RECEPTION_RETENTION_MS)
      .sort((a, b) => a[1] - b[1])
      .slice(-REGISTRY_CAPACITY);
  } catch {
    return [];
  }
}

function writeReceptions(): void {
  if (storage === null) return;
  try {
    if (receptions.size === 0) storage.removeItem(RECEPTIONS_KEY);
    else storage.setItem(RECEPTIONS_KEY, JSON.stringify(Object.fromEntries(receptions)));
  } catch {
    /* Stockage refusé : le registre tient pour l'onglet, sans se souvenir. */
  }
}

function loadFrom(from: ReceptionStorage | null, now: number): void {
  storage = from;
  loaded = true;
  receptions.clear();
  if (from === null) return;
  const kept = readStored(from, now);
  for (const [id, at] of kept) receptions.set(id, at);
  writeReceptions();
}

function ensureLoaded(): void {
  if (!loaded) loadFrom(browserReceptionStorage(), Date.now());
}

/**
 * LE STOCKAGE DU REGISTRE — relu SUR-LE-CHAMP, comme un rechargement de page :
 * la mémoire est vidée puis reconstruite depuis `from`, purgée de ce qui a
 * passé la rétention à `now`. `null` ⇒ mémoire seule. Sans appel, le premier
 * accès lit `localStorage`.
 */
export function configureEphemeralReceptionStorage(from: ReceptionStorage | null, now: number): void {
  loadFrom(from, now);
}

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
  ensureLoaded();
  if (receptions.has(messageId)) return;
  remember(receptions, messageId, atMs);
  writeReceptions();
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

/** Une échéance servie en millisecondes ; `NaN` quand il n'y en a pas — aucune comparaison ne la tient pour passée. */
function timeOfServed(value: number | string | Date | null | undefined): number {
  if (value === null || value === undefined) return Number.NaN;
  if (typeof value === 'number') return value;
  return (value instanceof Date ? value : new Date(value)).getTime();
}

/** La première réception locale de ce message, ou `null` (#7547 — l'entrée du composeur de la ligne). */
export function receptionOf(messageId: string): number | null {
  ensureLoaded();
  return receptions.get(messageId) ?? null;
}

/** L'échéance servie par `message:countdown-started`, ou `null` (#7547). */
export function servedDeadlineOf(messageId: string): number | null {
  return servedDeadlines.get(messageId) ?? null;
}

/** Le message n'existe plus — ni son horodatage de réception, ni son échéance. */
export function forgetEphemeral(messageId: string): void {
  ensureLoaded();
  const held = receptions.delete(messageId);
  servedDeadlines.delete(messageId);
  if (held) writeReceptions();
}

/** Les témoins repartent d'un registre vide — jamais le produit. */
export function resetEphemeralReception(): void {
  ensureLoaded();
  receptions.clear();
  servedDeadlines.clear();
  writeReceptions();
}

export type EphemeralMessageFields = Pick<Message, 'id' | 'expiresAt' | 'ephemeralDuration'> & {
  readonly isViewOnce?: boolean;
  readonly effectFlags?: number;
};

const hasDurationOf = (message: EphemeralMessageFields): boolean => {
  const duration = message.ephemeralDuration;
  return typeof duration === 'number' && Number.isFinite(duration) && duration > 0;
};

const isViewOnceWithoutDuration = (message: EphemeralMessageFields): boolean =>
  message.isViewOnce === true && !hasDurationOf(message);

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
  if (!isMine && hasDurationOf(message) && !isAfterReadMessage(message)) {
    noteEphemeralReception(message.id, now);
  }
  return peekEphemeralDeadline(input);
}

/**
 * LA MÊME RÈGLE, EN LECTURE SEULE (#8900) — elle ne pose AUCUNE réception.
 * C'est ce que lisent les sites qui trient un fil ou un cache entier (le
 * retrait des rangées parties, la persistance) : un message qu'aucune rangée
 * n'a encore peint n'est pas « reçu » au sens du contrat, et le lire pour le
 * trier ne doit pas lancer son décompte.
 */
export function peekEphemeralDeadline(input: {
  readonly message: EphemeralMessageFields;
  readonly isMine: boolean;
  readonly now: number;
}): EphemeralDeadline {
  const { message, isMine, now } = input;
  const duration = message.ephemeralDuration;
  /* UNE VUE UNIQUE SANS DURÉE N'A PAS D'ÉCHÉANCE À MONTRER (#7580) : son
     `expiresAt` est la destruction SERVEUR programmée quand tous les
     destinataires l'ont ouverte (#7578), jamais un décompte pour le lecteur. */
  if (isViewOnceWithoutDuration(message)) return { state: 'none' };
  /* LA FLAMME-ŒIL NE DÉCOMPTE RIEN (#8304) : ni pastille ni chrono, chez
     l'expéditeur comme chez le lecteur — c'est la SORTIE de la conversation
     qui la retire, et son filigrane la désigne. Une échéance servie (la
     rétention d'un message jamais lu, #8302) ne se montre pas non plus.
     SAUF l'échéance PASSÉE d'un destinataire : c'est SA consommation, que la
     passerelle ressert une heure (#8556) — la rangée est partie, jumelle
     d'`ExpiredEphemeralRow.isGone` (iOS, #8352).
     #8630 — l'AUTEUR aussi : la passerelle ne lui sert d'échéance que quand
     ce que sa réponse cite est mort pour lui, et la réponse part avec. */
  if (isAfterReadMessage(message)) {
    const consumedAtMs = timeOfServed(servedDeadlines.get(message.id) ?? message.expiresAt);
    return consumedAtMs <= now ? { state: 'scheduled', expiresAtMs: consumedAtMs } : { state: 'none' };
  }

  return ephemeralDeadline({
    ...(duration === undefined ? {} : { ephemeralDuration: duration }),
    servedExpiresAt: servedDeadlines.get(message.id) ?? message.expiresAt ?? null,
    receivedAtMs: receptionOf(message.id),
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
