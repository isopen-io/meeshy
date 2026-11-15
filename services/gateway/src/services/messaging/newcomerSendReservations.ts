/**
 * La RÉSERVATION atomique de la fenêtre du mode lent des nouveaux comptes
 * (règle 4 de `conversationWriteAdmission`, #7740).
 *
 * Lire « ce compte a-t-il écrit dans les 30 dernières secondes ? » ne suffit
 * pas : la ligne `Message` n'existe qu'après `MessageProcessor.saveMessage`,
 * bien après l'admission (la détection de langue peut coûter un aller-retour
 * HTTP entre les deux). Rien ne sérialisait les envois d'un même expéditeur :
 * dix `message:send` dans le même tick lisaient tous « rien » et passaient
 * tous. La fenêtre se PREND donc au moment de l'admission, par un `SET NX` —
 * un seul des envois simultanés l'obtient, les autres lisent son âge.
 *
 * `CacheStore.setnx` porte l'atomicité : `SET … EX … NX` sur Redis, une `Map`
 * du processus quand Redis manque ou tombe. La lecture de la base reste devant
 * (`secondsUntilNextSend`) : elle couvre ce que le cache aurait perdu
 * (redémarrage, bascule mémoire sur plusieurs instances).
 */

import { getCacheStore } from '../CacheStore';

/** Ce que la réservation emploie du cache partagé. */
export type ReservationCache = {
  setnx(key: string, value: string, ttlSeconds?: number): Promise<boolean>;
  get(key: string): Promise<string | null>;
  del(key: string): Promise<void>;
};

export type SendReservationOutcome =
  | {
      readonly reserved: true;
      /**
       * Rend la fenêtre — à appeler quand l'envoi admis n'est finalement PAS
       * écrit (refus plus loin, panne de `saveMessage`) : sans quoi un envoi
       * échoué coûterait 30 s d'attente pour un message que personne n'a reçu.
       */
      readonly release: () => Promise<void>;
    }
  | { readonly reserved: false; readonly retryAfterMs: number };

export type SendReservationRefused = Extract<SendReservationOutcome, { reserved: false }>;

/**
 * Le gateway compile en `strict: false`, où un discriminant booléen ne
 * rétrécit pas l'union — même prédicat explicite que `isConversationWriteRefused`.
 */
export const isSendReservationRefused = (outcome: SendReservationOutcome): outcome is SendReservationRefused =>
  outcome.reserved === false;

export type SendReservationStore = {
  reserve(params: {
    readonly key: string;
    /**
     * Qui prend la fenêtre. Le `clientMessageId` de l'envoi quand il en porte
     * un : son REJEU concurrent (même identifiant) passe, et c'est la
     * déduplication de `saveMessage` qui le ramène au message d'origine —
     * le refuser ferait marquer « échoué » un message pourtant délivré.
     */
    readonly holder: string;
    readonly windowMs: number;
    readonly now: number;
  }): Promise<SendReservationOutcome>;
};

export const newcomerSendReservationKey = (conversationId: string, senderParticipantId: string): string =>
  `newcomer-slow:${conversationId}:${senderParticipantId}`;

type Reservation = { readonly at: number; readonly holder: string };

const encode = (reservation: Reservation): string => `${reservation.at}|${reservation.holder}`;

const decode = (raw: string | null): Reservation | null => {
  if (raw == null) return null;
  const separator = raw.indexOf('|');
  if (separator < 0) return null;
  const at = Number(raw.slice(0, separator));
  return Number.isFinite(at) ? { at, holder: raw.slice(separator + 1) } : null;
};

/**
 * La réservation sur le cache partagé. `cacheOf` est résolu à CHAQUE appel :
 * construire un `MessagingService` n'ouvre aucune connexion, seul un nouveau
 * compte qui écrit dans le salon global la sollicite.
 */
export function cacheSendReservations(cacheOf: () => ReservationCache): SendReservationStore {
  return {
    async reserve({ key, holder, windowMs, now }) {
      const cache = cacheOf();
      const value = encode({ at: now, holder });
      const ttlSeconds = Math.max(1, Math.ceil(windowMs / 1000));
      const held: SendReservationOutcome = {
        reserved: true,
        release: async () => {
          // Ne libère que SA réservation : expirée puis reprise par un envoi
          // suivant, la clé ne lui appartient plus.
          if ((await cache.get(key)) === value) await cache.del(key);
        }
      };

      if (await cache.setnx(key, value, ttlSeconds)) return held;

      const current = decode(await cache.get(key));
      if (current === null) {
        // Expirée entre les deux lectures (ou illisible) : un seul nouvel essai.
        return (await cache.setnx(key, value, ttlSeconds)) ? held : { reserved: false, retryAfterMs: windowMs };
      }
      if (current.holder === holder) {
        // Le rejeu du même envoi : la réservation appartient à l'original, qui
        // seul la libère.
        return { reserved: true, release: async () => undefined };
      }
      return { reserved: false, retryAfterMs: current.at + windowMs - now };
    }
  };
}

/** La réservation de production, sur le `CacheStore` du processus. */
export const sharedSendReservations: SendReservationStore = cacheSendReservations(getCacheStore);
