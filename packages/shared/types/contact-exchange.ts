/**
 * LE PARTAGE SANS CONTACT (#19205) — deux téléphones se rapprochent (NFC, QR en repli) et
 * chacun donne ce qu'il a choisi : sa vitrine (ce que voit le Public), une demande d'ami, ou les
 * deux. « Rien ne part tant que tu n'as pas choisi. »
 *
 * - `POST /me/contact-exchange` `{ offers }` émet un JETON bref (`CONTACT_EXCHANGE_TTL_SECONDS`),
 *   signé, à usage unique, qui encode les offres et rien d'autre : ni identifiant, ni nom, ni
 *   numéro en clair. Il se transporte tel quel dans la charge NFC ou le QR ;
 * - `POST /contact-exchange/:token/accept` (compte inscrit) rend ce qui était donné, et l'émetteur
 *   reçoit `contact-exchange:received` : « X a reçu ta vitrine » ;
 * - le NUMÉRO n'est jamais une offre : `CONTACT_EXCHANGE_LOCKED` dit au client de le montrer
 *   verrouillé (« Proches seulement ») tant qu'aucune loi d'accès ne l'ouvre dans la paire ;
 * - jeton expiré, rejoué, contrefait, émis par un compte qui bloque le lecteur ou parti : UN refus,
 *   `CONTACT_EXCHANGE_UNAVAILABLE`, qui ne dit jamais lequel.
 */
import { z } from 'zod';

export const CONTACT_EXCHANGE_TTL_SECONDS = 120;

export const CONTACT_EXCHANGE_OFFERS = ['vitrine', 'friendRequest'] as const;
export type ContactExchangeOffer = (typeof CONTACT_EXCHANGE_OFFERS)[number];

/** Ce que le client montre verrouillé à côté des offres : aucune loi ne l'ouvre par ce canal. */
export const CONTACT_EXCHANGE_LOCKED = ['phone'] as const;
export type ContactExchangeLocked = (typeof CONTACT_EXCHANGE_LOCKED)[number];

/** `ce1.<aléa>.<offres>.<échéance>.<signature>` — quelques dizaines de caractères ASCII sûrs pour une URL. */
export const CONTACT_EXCHANGE_TOKEN_PATTERN = /^ce1\.[A-Za-z0-9_-]{22}\.[1-3]\.\d{10}\.[A-Za-z0-9_-]{22}$/;

export const CONTACT_EXCHANGE_ERROR_CODES = {
  /** Charge illisible : aucune offre, une offre inconnue. */
  INVALID: 'CONTACT_EXCHANGE_INVALID',
  /** Le refus GÉNÉRIQUE de l'acceptation : expiré, rejoué, contrefait, bloqué, parti — jamais lequel. */
  UNAVAILABLE: 'CONTACT_EXCHANGE_UNAVAILABLE',
} as const;
export type ContactExchangeErrorCode = (typeof CONTACT_EXCHANGE_ERROR_CODES)[keyof typeof CONTACT_EXCHANGE_ERROR_CODES];

/** Les offres, dédoublonnées et rangées dans l'ordre du contrat : une au moins. */
export const contactExchangeIssuePayloadSchema = z.object({
  offers: z
    .array(z.enum(CONTACT_EXCHANGE_OFFERS))
    .min(1)
    .max(CONTACT_EXCHANGE_OFFERS.length * 2)
    .transform((offers) => CONTACT_EXCHANGE_OFFERS.filter((offer) => offers.includes(offer))),
});
export type ContactExchangeIssuePayload = z.infer<typeof contactExchangeIssuePayloadSchema>;

export type ContactExchangeIssued = {
  readonly token: string;
  readonly expiresAt: string;
  readonly offers: readonly ContactExchangeOffer[];
  readonly locked: readonly ContactExchangeLocked[];
};

/** L'identité nécessaire pour dire « Sofia Benali » — ce que tout compte inscrit lit déjà. */
export type ContactExchangePerson = {
  readonly id: string;
  readonly username: string;
  readonly displayName: string | null;
  readonly avatar: string | null;
};

/** `sent` : la demande est partie ; `not-sent` : elle n'a pas pu partir (lien, demande existante, préférence), sans dire pourquoi. */
export type ContactExchangeFriendRequestOutcome = 'sent' | 'not-sent';

export type ContactExchangeAccepted = {
  readonly issuer: ContactExchangePerson;
  readonly offers: readonly ContactExchangeOffer[];
  /** La vitrine telle que la fiche publique la sert à ce lecteur ; absente si elle n'était pas offerte. */
  readonly profile?: Record<string, unknown>;
  /** Absent si la demande d'ami n'était pas offerte. */
  readonly friendRequest?: ContactExchangeFriendRequestOutcome;
  readonly locked: readonly ContactExchangeLocked[];
};

/** `contact-exchange:received`, à l'émetteur seul : qui a reçu, quoi, quand. */
export type ContactExchangeReceivedEventData = {
  readonly reader: ContactExchangePerson;
  readonly received: readonly ContactExchangeOffer[];
  readonly receivedAt: string;
};
