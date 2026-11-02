/**
 * LES CONSTANTES DU PROTOCOLE E2EE, SANS VALIDATEUR (#3706, #14592).
 *
 * Ce que l'annuaire (`e2ee-directory.ts`) et les signaux (`e2ee-signals.ts`)
 * déclarent et que les CLIENTS consomment comme valeurs : protocole, bornes,
 * codes d'erreur stables, message de liaison, remplissage. Rangées ici, hors de
 * tout module qui construit un schéma `zod`, pour qu'un client qui n'a besoin
 * que d'une constante ne télécharge pas le validateur classique (le navigateur
 * charge `zod/mini`, `apps/web/budgets.json › on_demand_chunks.zod`). Les deux
 * modules d'origine les réexportent : aucun importeur ne change.
 */
/** Le protocole déclaré par un envoi libsignal (§ 4.3). */
export const LIBSIGNAL_PROTOCOL = 'libsignal-v1' as const;

/** Plage des `deviceId` acceptée par `ProtocolAddress` de libsignal. */
export const E2EE_DEVICE_ID_MIN = 1;
export const E2EE_DEVICE_ID_MAX = 127;

/** Bornes d'un envoi (§ 4.3). */
export const E2EE_ENVELOPE_BOUNDS = {
  maxEnvelopes: 32,
  maxBodyBase64Chars: Math.ceil((64 * 1024) / 3) * 4,
  maxTotalBase64Chars: Math.ceil((512 * 1024) / 3) * 4,
} as const;

/**
 * Le nombre d'appareils chiffrés ACTIFS d'un compte (#12543). Sesame exige une
 * enveloppe par appareil actif : un envoi en tête-à-tête vise les appareils du
 * destinataire ET les autres appareils de l'émetteur, soit au plus
 * 2 × borne − 1 enveloppes, qui doivent tenir dans `maxEnvelopes`. Au-delà, le
 * compte deviendrait injoignable. Les numéros 1…borne sont les seules places :
 * un appareil retiré rend la sienne.
 */
export const E2EE_MAX_ACTIVE_DEVICES = Math.floor((E2EE_ENVELOPE_BOUNDS.maxEnvelopes + 1) / 2);

/** Un lot de pré-clés uniques (§ 3.2) : 100 au plus par publication. */
export const E2EE_ONE_TIME_PREKEY_BATCH_MAX = 100;

/** Le stock de pré-clés uniques NON consommées d'un appareil, par nature (EC, Kyber). */
export const E2EE_ONE_TIME_PREKEY_STOCK_MAX = 200;

/** L'écart toléré entre l'horloge de l'appareil et celle de la passerelle pour la preuve de liaison. */
export const E2EE_DEVICE_BINDING_MAX_SKEW_MS = 10 * 60 * 1000;

/**
 * Le message que l'appareil signe (XEdDSA, sa clé d'identité) pour PROUVER
 * qu'il détient la clé privée de l'identité qu'il enrôle, au nom de CE compte.
 * Sans cette preuve, quiconque tient un jeton du compte pourrait réenrôler une
 * identité PUBLIQUE (servie dans chaque bundle, avec ses signatures) et lier
 * l'appareil à sa propre session : il lirait puis effacerait ses enveloppes.
 * Les clients construisent ce message par cette fonction, à l'octet près.
 */
export const deviceBindingMessage = (binding: {
  readonly userId: string;
  readonly registrationId: number;
  readonly identityKey: string;
  readonly timestamp: number;
}): string =>
  `meeshy-e2ee-device-binding:v1:${binding.userId}:${binding.registrationId}:${binding.identityKey}:${binding.timestamp}`;

/** Une enveloppe vit au plus 30 jours sans accusé de réception (§ 4.3). */
export const E2EE_ENVELOPE_RETENTION_DAYS = 30;

/** Les codes stables que la passerelle pose en `code` à côté d'`error`. */
export const E2EE_ERROR_CODES = {
  DEVICES_MISMATCH: 'E2EE_DEVICES_MISMATCH',
  CLIENT_OUTDATED: 'E2EE_CLIENT_OUTDATED',
  SIGNATURE_INVALID: 'E2EE_SIGNATURE_INVALID',
  SIGNATURE_UNVERIFIABLE: 'E2EE_SIGNATURE_UNVERIFIABLE',
  DEVICE_NOT_BOUND: 'E2EE_DEVICE_NOT_BOUND',
  /** Le retrait nommait une génération (`registrationId`) que la place ne porte plus : un autre appareil l'a reprise (#13014). */
  DEVICE_CHANGED: 'E2EE_DEVICE_CHANGED',
  DEVICE_LIMIT_REACHED: 'E2EE_DEVICE_LIMIT_REACHED',
  ENVELOPES_INVALID: 'E2EE_ENVELOPES_INVALID',
  KEYS_FORBIDDEN: 'E2EE_KEYS_FORBIDDEN',
  REGIME_CHANGED: 'E2EE_REGIME_CHANGED',
  /** Une conversation chiffrée de bout en bout ne repasse jamais en clair (#12949). */
  IRREVERSIBLE: 'E2EE_IRREVERSIBLE',
  /** Une paire de personnes a au plus UN tête-à-tête chiffré de bout en bout (#12966). */
  DIRECT_ALREADY_END_TO_END: 'E2EE_DIRECT_ALREADY_END_TO_END',
  /** Un tête-à-tête ne se chiffre de bout en bout qu'entre exactement deux membres actifs (#12966). */
  DIRECT_NOT_A_PAIR: 'E2EE_DIRECT_NOT_A_PAIR',
  BINDING_INVALID: 'E2EE_DEVICE_BINDING_INVALID',
  PREKEY_STOCK_FULL: 'E2EE_PREKEY_STOCK_FULL',
  IDENTITY_REVOKED: 'E2EE_IDENTITY_REVOKED',
  /** Retirer un appareil depuis une autre session ferme la sienne ; si elle ne se ferme pas, rien n'est retiré (#13013). */
  DEVICE_SESSION_NOT_CLOSED: 'E2EE_DEVICE_SESSION_NOT_CLOSED',
  /** Une session dont l'appareil a été retiré n'enrôle plus rien : il faut une nouvelle connexion (#13013). */
  SESSION_RETIRED: 'E2EE_SESSION_RETIRED',
  IDENTITY_KEY_INVALID: 'E2EE_IDENTITY_KEY_INVALID',
  /** Un signal chiffré n'est relayé que pour un membre actif de la conversation (#13142). */
  SIGNAL_FORBIDDEN: 'E2EE_SIGNAL_FORBIDDEN',
  /**
   * Dans une conversation e2ee, une réaction, la frappe, un accusé, une modification, une
   * suppression pour tous, une vue unique ou un épinglage ne passe plus par sa route en clair :
   * seulement par le relais des signaux chiffrés (#13142, #13060).
   */
  SIGNAL_CHANNEL_REQUIRED: 'E2EE_SIGNAL_CHANNEL_REQUIRED',
} as const;

export type E2EEErrorCode = (typeof E2EE_ERROR_CODES)[keyof typeof E2EE_ERROR_CODES];

/**
 * Les paliers de remplissage du clair d'une enveloppe (octets), communs aux
 * messages et aux signaux : une réaction ne se distingue pas d'un message court.
 * Au-delà du dernier palier, le clair se remplit au multiple suivant de
 * `E2EE_PADDING_STEP` : sa taille exacte ne se lit jamais. Chaque palier est
 * borné par le budget des enveloppes (`E2EE_ENVELOPE_BOUNDS` : 64 Kio par
 * enveloppe, 512 Kio au total, divisé par le nombre d'enveloppes), moins la
 * marge de chiffrement `E2EE_PADDING_CIPHER_OVERHEAD`. Miroir : `E2EEPadding`
 * (MeeshyE2EE).
 */
export const E2EE_PADDING_TIERS = [256, 1024, 4096, 16384] as const;
export const E2EE_PADDING_STEP = 16384;
/**
 * Ce que libsignal ajoute au clair, majoré : un premier message (PreKey, PQXDH
 * avec Kyber1024) ajoute 1 761 à 1 763 octets (mesuré, libsignal 0.105), un
 * message ordinaire 107.
 */
export const E2EE_PADDING_CIPHER_OVERHEAD = 2048;

const PADDING_ENVELOPE_BYTES = 64 * 1024;
const PADDING_TOTAL_BYTES = 512 * 1024;

/** Le plus grand clair que `recipients` enveloppes portent sous les deux plafonds. */
export const e2eePaddingCeiling = (recipients: number): number =>
  Math.min(PADDING_ENVELOPE_BYTES, Math.floor(PADDING_TOTAL_BYTES / Math.max(recipients, 1))) - E2EE_PADDING_CIPHER_OVERHEAD;

/** La taille d'un clair une fois rempli pour `recipients` enveloppes. Miroir : `E2EEPadding.paddedLength`. */
export const e2eePaddedLength = (length: number, recipients: number): number => {
  const ceiling = e2eePaddingCeiling(recipients);
  if (length > ceiling) return length;
  const bucket = E2EE_PADDING_TIERS.find((tier) => tier >= length) ?? Math.ceil(length / E2EE_PADDING_STEP) * E2EE_PADDING_STEP;
  return Math.min(bucket, ceiling);
};
