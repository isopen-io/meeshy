/**
 * Carte de visite partagée (#8101) — le contrat partagé web / iOS / gateway.
 *
 * REPRÉSENTATION : un contact partagé est une PIÈCE JOINTE vCard
 * (`text/vcard`, extension `.vcf`). Le client émetteur écrit une vCard 3.0 ;
 * tout lecteur accepte 2.1, 3.0 et 4.0 (`parseVCard`,
 * `packages/shared/utils/vcard.ts`). Le nom affiché est celui que porte la
 * vCard, c'est-à-dire le nommage du CARNET DE L'AUTEUR — jamais le nom du
 * compte Meeshy associé.
 *
 * RÉSOLUTION : `POST /api/v1/contacts/resolve` rapproche les numéros et
 * e-mails de la vCard des comptes Meeshy et rend au plus
 * {@link CONTACT_RESOLVE_MAX_ACCOUNTS} profils PUBLICS. La réponse ne dit
 * JAMAIS lequel des identifiants a matché, ni l'e-mail / le téléphone du
 * compte, ni sa présence, ni son rôle, ni ses dates : le lecteur connaît déjà
 * les identifiants de la vCard, il n'apprend que « ce compte existe et voici
 * son profil public ».
 */

/** Type MIME canonique d'une carte de visite — le seul qu'un émetteur écrit. */
export const CONTACT_CARD_MIME_TYPE = 'text/vcard' as const;

/** Extension canonique d'une carte de visite. */
export const CONTACT_CARD_EXTENSION = '.vcf' as const;

/** Borne de chaque liste d'identifiants envoyée à la résolution. */
export const CONTACT_RESOLVE_MAX_IDENTIFIERS = 10;

/** Nombre maximal de comptes rendus par une résolution. */
export const CONTACT_RESOLVE_MAX_ACCOUNTS = 3;

/**
 * Un champ étiqueté de la vCard. `label` est une clé normalisée quand la
 * vCard porte un type connu (`mobile`, `home`, `work`, `main`, `iphone`,
 * `fax`, `pager`, `other`) — le client la localise — ou le libellé libre de
 * l'auteur (`X-ABLabel`) sinon, affiché tel quel. `null` = aucun libellé.
 */
export type VCardLabeledValue = {
  readonly label: string | null;
  readonly value: string;
};

/** Clés de libellé normalisées qu'un client localise. */
export const VCARD_KNOWN_LABELS = [
  'mobile',
  'home',
  'work',
  'main',
  'iphone',
  'fax',
  'pager',
  'other',
] as const;

export type VCardKnownLabel = (typeof VCARD_KNOWN_LABELS)[number];

/** Le contenu lisible d'une vCard, tel que `parseVCard` le rend. */
export type ParsedVCard = {
  /** Nom tel que dans le carnet de l'auteur (FN, sinon N composé, sinon ORG). */
  readonly formattedName: string;
  readonly givenName?: string;
  readonly familyName?: string;
  readonly organization?: string;
  readonly title?: string;
  readonly phones: readonly VCardLabeledValue[];
  readonly emails: readonly VCardLabeledValue[];
  readonly urls: readonly string[];
  /** Adresses postales, composantes non vides jointes par « , ». */
  readonly addresses: readonly VCardLabeledValue[];
  /** `AAAA-MM-JJ`, ou `--MM-JJ` quand l'année est absente. */
  readonly birthday?: string;
  readonly note?: string;
};

/** Relation du LECTEUR au compte résolu. */
export type ContactRelation = 'self' | 'friend' | 'request-sent' | 'request-received' | 'none';

export const CONTACT_RELATIONS: readonly ContactRelation[] = [
  'self',
  'friend',
  'request-sent',
  'request-received',
  'none',
];

/**
 * Le profil PUBLIC d'un compte associé à une carte de visite. Liste FERMÉE :
 * tout champ ajouté ici part vers un lecteur qui n'a d'autre lien avec ce
 * compte que d'avoir reçu une vCard.
 */
export type PublicContactAccount = {
  readonly userId: string;
  readonly displayName: string;
  readonly username: string;
  readonly avatarUrl: string | null;
  readonly bannerUrl: string | null;
  readonly bio: string | null;
  readonly relation: ContactRelation;
};

export type ResolveContactsRequest = {
  readonly phones: readonly string[];
  readonly emails: readonly string[];
  /**
   * Pays ISO 3166-1 (« FR », « SN ») pour lire un numéro LOCAL de la vCard.
   * Optionnel : absent, le serveur prend le pays du numéro du lecteur.
   */
  readonly defaultCountry?: string;
};

export type ResolveContactsResponse = {
  readonly accounts: readonly PublicContactAccount[];
};

/** Schéma JSON (Fastify) d'un {@link PublicContactAccount} — fermé. */
export const publicContactAccountSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['userId', 'displayName', 'username', 'avatarUrl', 'bannerUrl', 'bio', 'relation'],
  properties: {
    userId: { type: 'string' },
    displayName: { type: 'string' },
    username: { type: 'string' },
    avatarUrl: { type: 'string', nullable: true },
    bannerUrl: { type: 'string', nullable: true },
    bio: { type: 'string', nullable: true },
    relation: { type: 'string', enum: [...CONTACT_RELATIONS] },
  },
} as const;

/** Schéma JSON (Fastify) du corps de `POST /contacts/resolve`. */
export const resolveContactsBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['phones', 'emails'],
  properties: {
    phones: {
      type: 'array',
      maxItems: CONTACT_RESOLVE_MAX_IDENTIFIERS,
      items: { type: 'string', maxLength: 64 },
    },
    emails: {
      type: 'array',
      maxItems: CONTACT_RESOLVE_MAX_IDENTIFIERS,
      items: { type: 'string', maxLength: 254 },
    },
    defaultCountry: { type: 'string', maxLength: 3 },
  },
} as const;

/** Schéma JSON (Fastify) de la réponse 200 de `POST /contacts/resolve`. */
export const resolveContactsResponseSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    data: {
      type: 'object',
      additionalProperties: false,
      required: ['accounts'],
      properties: {
        accounts: {
          type: 'array',
          maxItems: CONTACT_RESOLVE_MAX_ACCOUNTS,
          items: publicContactAccountSchema,
        },
      },
    },
  },
} as const;
