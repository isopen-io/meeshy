/**
 * LE RELAIS DES SIGNAUX CHIFFRÉS D'UNE CONVERSATION E2EE (#13142, #13060).
 *
 * Dans une conversation `e2ee`, tout ce qui se passe entre deux clients — une
 * réaction, la frappe, un accusé de réception ou de lecture, la progression de
 * lecture d'un média, une modification, une suppression pour tous, une vue
 * unique consommée, un épinglage — voyage comme un MESSAGE DE CONTRÔLE libsignal
 * (Signal, « Sealed sender » mis à part : `SyncMessage`, `ReactionMessage`,
 * `DeleteForEveryone`, `TypingMessage`, `ReceiptMessage` sont des contenus
 * chiffrés de bout en bout, jamais des appels d'API lisibles).
 *
 * La passerelle ne voit qu'une enveloppe OPAQUE par appareil destinataire :
 * UNE route (`POST /e2ee/conversations/:conversationId/signals`) et UN événement
 * socket (`e2ee:send-signal`), quel que soit le signal. Le type du signal, sa
 * cible et sa valeur sont DANS le chiffré. Les enveloppes repartent par le même
 * chemin que celles des messages (`e2ee:envelope`, `GET /e2ee/envelopes`).
 *
 * Ce que la passerelle voit encore (et que la décision du 2026-10-26 documente) :
 * qui écrit à qui, quand, combien d'enveloppes, leur taille (remplie par paliers
 * côté client), et l'indicateur `wake` que l'expéditeur pose pour demander un
 * réveil. Elle distingue aussi un MESSAGE (qui crée une ligne `Message` indexée
 * par `POST /conversations/:id/messages`) d'un SIGNAL (qui n'en crée aucune).
 */
import { z } from 'zod';
import { E2EE_SEND_SHAPE, LIBSIGNAL_PROTOCOL, e2eeDeviceIdSchema, type E2EEDevicesMismatch } from './e2ee-directory.js';

/** La route unique des signaux, sous `/api/v1`. */
export const E2EE_SIGNAL_ROUTE = '/e2ee/conversations/:conversationId/signals' as const;

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

/**
 * Un envoi de signal : les enveloppes libsignal, l'appareil émetteur, ceux de
 * mes appareils que je n'ai pas approuvés (Sesame), et l'indicateur de réveil.
 */
export const e2eeSignalRelayRequestSchema = z.object({
  protocol: z.literal(LIBSIGNAL_PROTOCOL),
  senderDeviceId: e2eeDeviceIdSchema,
  envelopes: E2EE_SEND_SHAPE.envelopes.unwrap(),
  unapprovedOwnDevices: E2EE_SEND_SHAPE.unapprovedOwnDevices.default([]),
  /** L'expéditeur demande un réveil des appareils destinataires ; jamais le type du signal. */
  wake: z.boolean().default(false),
});

export type E2EESignalRelayRequest = z.infer<typeof e2eeSignalRelayRequestSchema>;

/** L'événement socket unique : la même charge, plus la conversation. */
export const e2eeSignalSocketPayloadSchema = e2eeSignalRelayRequestSchema.extend({
  conversationId: z.string().regex(/^[a-f0-9]{24}$/, 'identifiant attendu'),
});

export type E2EESignalSocketPayload = z.infer<typeof e2eeSignalSocketPayloadSchema>;

/** Ce que la route et l'accusé socket rendent : l'identifiant opaque du signal. */
export type E2EESignalRelayResponse = {
  readonly signalId: string;
  readonly envelopes: number;
};

/**
 * L'accusé de l'événement socket : comme celui de `message:send`, un refus Sesame
 * porte à plat l'écart à résoudre (`missing`, `extra`, `stale`).
 */
export type E2EESignalAck = {
  readonly success: boolean;
  readonly data?: E2EESignalRelayResponse;
  readonly error?: string;
  readonly code?: string;
} & Partial<E2EEDevicesMismatch>;
