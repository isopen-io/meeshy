/**
 * LE CONTRAT « PAIR EXTERNE » (#17115, chantier #17007) : la seule porte par
 * laquelle la passerelle parle à un réseau de messagerie tiers (WhatsApp au titre
 * de l'article 7 du règlement (UE) 2022/1925).
 *
 * Design : `docs/superpowers/specs/2026-11-08-dma-whatsapp-interop-design.md`
 * § 2 et § 6. Décision :
 * `services/gateway/decisions/2026-11-09-la-passerelle-parle-a-un-pair-externe-par-une-interface-unique.md`.
 * Fidélité à l'offre publique de Meta, champ par champ :
 * `services/gateway/docs/pair-externe-fidelite-offre-meta.md`.
 *
 * La passerelle n'y est qu'un RELAIS AVEUGLE : tout ce qui voyage est PUBLIC
 * (clés publiques, signatures XEdDSA) ou OPAQUE (messages libsignal sérialisés,
 * pièces chiffrées sur l'appareil). Aucun schéma n'accepte un champ de contenu :
 * chaque objet est STRICT, un champ inconnu (`text`, `plaintext`, `fileName`,
 * `duration`…) fait refuser l'appel entier au lieu d'être retiré en silence, et
 * un nom de clé privée est refusé à toute profondeur (`containsPrivateKeyField`).
 *
 * Deux implémentations : le FAUX WhatsApp (`fake-whatsapp-peer.ts`, staging) et,
 * après signature avec Meta, l'adaptateur réel — hors de portée du chantier tant
 * que l'accord n'existe pas.
 */
import { z } from 'zod';
import {
  E2EE_ENVELOPE_BOUNDS,
  E2EE_ONE_TIME_PREKEY_BATCH_MAX,
  e2eeDeviceIdSchema,
  e2eeOneTimePreKeySchema,
  e2eeRegistrationIdSchema,
  e2eeSignedPreKeySchema,
} from '@meeshy/shared/types/e2ee-directory';

/** Les réseaux tiers que la porte sait nommer. Messenger viendra plus tard (design § 2). */
export const externalNetworkSchema = z.enum(['whatsapp']);
export type ExternalNetwork = z.infer<typeof externalNetworkSchema>;

/** Les codes stables que la porte rend ; un appelant HTTP les pose en `code` à côté d'`error`. */
export const EXTERNAL_PEER_ERROR_CODES = {
  /** Le corps soumis n'est pas un message libsignal sérialisé : un clair ne franchit jamais la porte. */
  PLAINTEXT_REFUSED: 'EXTERNAL_PEER_PLAINTEXT_REFUSED',
  /** L'appel ne respecte pas le contrat (champ inconnu, borne, forme). */
  INVALID: 'EXTERNAL_PEER_INVALID',
  /** Une clé privée a été soumise : refusée, jamais journalisée. */
  KEYS_FORBIDDEN: 'EXTERNAL_PEER_KEYS_FORBIDDEN',
  /** Le pair visé n'a publié aucun bundle. */
  PEER_UNKNOWN: 'EXTERNAL_PEER_UNKNOWN',
  /** L'empreinte déclarée d'une pièce ne correspond pas à ses octets. */
  DIGEST_MISMATCH: 'EXTERNAL_PEER_DIGEST_MISMATCH',
  /** La pièce demandée n'existe pas (ou plus). */
  ATTACHMENT_UNKNOWN: 'EXTERNAL_PEER_ATTACHMENT_UNKNOWN',
} as const;

export type ExternalPeerErrorCode = (typeof EXTERNAL_PEER_ERROR_CODES)[keyof typeof EXTERNAL_PEER_ERROR_CODES];

/** L'erreur unique de la porte. Son message ne recopie JAMAIS ce qui a été soumis. */
export class ExternalPeerError extends Error {
  constructor(readonly code: ExternalPeerErrorCode) {
    super(code);
    this.name = 'ExternalPeerError';
  }
}

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
const base64 = (maxChars: number) => z.string().min(4).max(maxChars).regex(BASE64, 'base64 attendu');

const objectId = z.string().regex(/^[a-f0-9]{24}$/, 'identifiant attendu');

/**
 * Un numéro E.164 (UIT-T E.164 : « + », indicatif, au plus 15 chiffres). C'est
 * l'identifiant d'un utilisateur WhatsApp ; il voyage à côté du contenu et se
 * garde comme lui : aucune journalisation, aucune trace dans un message d'erreur.
 */
export const e164Schema = z.string().regex(/^\+[1-9][0-9]{6,14}$/, 'numéro E.164 attendu');

/** Un appareil Meeshy : l'identité libsignal PAR APPAREIL déjà posée (#14591, ADR-030), sans identité dédiée. */
export const meeshyPartySchema = z
  .object({ side: z.literal('meeshy'), userId: objectId, deviceId: e2eeDeviceIdSchema })
  .strict();

/** Un appareil d'un utilisateur du réseau tiers, désigné par son numéro. */
export const externalPartySchema = z
  .object({ side: z.literal('external'), network: externalNetworkSchema, handle: e164Schema, deviceId: e2eeDeviceIdSchema })
  .strict();

export const peerPartySchema = z.discriminatedUnion('side', [meeshyPartySchema, externalPartySchema]);
export type MeeshyParty = z.infer<typeof meeshyPartySchema>;
export type ExternalParty = z.infer<typeof externalPartySchema>;
export type PeerParty = z.infer<typeof peerPartySchema>;

/** Un utilisateur (tous ses appareils) : ce que l'on vise quand on demande ses bundles. */
export const peerUserSchema = z.discriminatedUnion('side', [
  z.object({ side: z.literal('meeshy'), userId: objectId }).strict(),
  z.object({ side: z.literal('external'), network: externalNetworkSchema, handle: e164Schema }).strict(),
]);
export type PeerUser = z.infer<typeof peerUserSchema>;

const strictSignedPreKey = e2eeSignedPreKeySchema.strict();
const strictOneTimePreKey = e2eeOneTimePreKeySchema.strict();

/**
 * La publication du bundle d'UN appareil (PQXDH, Signal, rév. 3, § 3.2) : clé
 * d'identité, pré-clé signée, pré-clé Kyber de dernier recours, lots de pré-clés
 * uniques EC et Kyber. Les mêmes formes que l'annuaire Meeshy (`e2ee-directory`).
 */
export const preKeyBundlePublicationSchema = z
  .object({
    party: peerPartySchema,
    registrationId: e2eeRegistrationIdSchema,
    identityKey: base64(4096),
    signedPreKey: strictSignedPreKey,
    kyberLastResort: strictSignedPreKey,
    oneTimePreKeys: z.array(strictOneTimePreKey).max(E2EE_ONE_TIME_PREKEY_BATCH_MAX).default([]),
    kyberPreKeys: z.array(strictSignedPreKey).max(E2EE_ONE_TIME_PREKEY_BATCH_MAX).default([]),
  })
  .strict();
export type PreKeyBundlePublication = z.input<typeof preKeyBundlePublicationSchema>;

/** Un bundle servi pour UN appareil : une pré-clé unique EC au plus, une Kyber toujours (PQXDH § 2.4). */
export type PeerDeviceBundle = {
  readonly deviceId: number;
  readonly registrationId: number;
  readonly identityKey: string;
  readonly signedPreKey: z.infer<typeof e2eeSignedPreKeySchema>;
  readonly kyberPreKey: z.infer<typeof e2eeSignedPreKeySchema> & { readonly lastResort: boolean };
  readonly preKey: z.infer<typeof e2eeOneTimePreKeySchema> | null;
};

/** Les deux formes sérialisées d'un `CiphertextMessage` libsignal : `SignalMessage` (2) et `PreKeySignalMessage` (3). */
export const ciphertextTypeSchema = z.union([z.literal(2), z.literal(3)]);
export type CiphertextType = z.infer<typeof ciphertextTypeSchema>;

/** Une enveloppe libsignal OPAQUE d'un appareil à un autre. Rien d'autre ne voyage avec elle. */
export const outboundEnvelopeSchema = z
  .object({
    from: peerPartySchema,
    to: peerPartySchema,
    type: ciphertextTypeSchema,
    body: base64(E2EE_ENVELOPE_BOUNDS.maxBodyBase64Chars),
  })
  .strict()
  .refine((envelope) => envelope.from.side !== envelope.to.side, { message: 'une enveloppe traverse la frontière' });
export type OutboundEnvelope = z.infer<typeof outboundEnvelopeSchema>;

/** Le reçu de la porte : l'enveloppe est prise en charge, pas encore lue. */
export type EnvelopeReceipt = { readonly envelopeId: string; readonly acceptedAt: string };

/** Une enveloppe servie à SON appareil destinataire. */
export type InboundEnvelope = {
  readonly envelopeId: string;
  readonly from: PeerParty;
  readonly type: CiphertextType;
  readonly body: string;
  readonly acceptedAt: string;
};

/** L'accusé de l'appareil destinataire : les enveloppes reçues sont effacées du relais. */
export const acknowledgementSchema = z
  .object({
    recipient: peerPartySchema,
    envelopeIds: z.array(z.string().uuid()).min(1).max(E2EE_ENVELOPE_BOUNDS.maxEnvelopes),
  })
  .strict();
export type Acknowledgement = z.infer<typeof acknowledgementSchema>;

/** La plus grande pièce opaque qu'accepte la porte (borne du faux ; celle de Meta est à confirmer après signature). */
export const EXTERNAL_ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;

/**
 * Une pièce chiffrée SUR L'APPAREIL (décision 2026-10-25 « la passerelle garde
 * une pièce e2ee comme un blob opaque ») : ses octets et leur SHA-256, rien
 * d'autre — ni nom, ni type, ni durée, ni vignette, ni transcription.
 */
export const opaqueAttachmentSchema = z
  .object({
    uploader: peerPartySchema,
    digest: z.string().regex(/^[A-Za-z0-9+/]{43}=$/, 'SHA-256 base64 attendu'),
    bytes: base64(Math.ceil(EXTERNAL_ATTACHMENT_MAX_BYTES / 3) * 4),
  })
  .strict();
export type OpaqueAttachment = z.infer<typeof opaqueAttachmentSchema>;

export type AttachmentRef = { readonly attachmentId: string; readonly digest: string };
export type StoredAttachment = { readonly digest: string; readonly bytes: string };

/**
 * La porte elle-même. Chaque méthode reçoit des données NON fiables : une
 * implémentation est toujours enveloppée par `admitExternalPeer`, qui valide le
 * contrat et refuse un clair AVANT de déléguer.
 */
export interface ExternalPeer {
  readonly network: ExternalNetwork;
  publishPreKeyBundle(publication: PreKeyBundlePublication): Promise<void>;
  /** Réserve ATOMIQUEMENT une pré-clé unique EC par appareil : deux demandes ne reçoivent jamais la même. */
  fetchPreKeyBundles(user: PeerUser): Promise<readonly PeerDeviceBundle[]>;
  deliverEnvelope(envelope: OutboundEnvelope): Promise<EnvelopeReceipt>;
  receiveEnvelopes(recipient: PeerParty): Promise<readonly InboundEnvelope[]>;
  acknowledge(acknowledgement: Acknowledgement): Promise<number>;
  deliverAttachment(attachment: OpaqueAttachment): Promise<AttachmentRef>;
  fetchAttachment(attachmentId: string): Promise<StoredAttachment>;
}
