/**
 * L'ADMISSION de la porte « pair externe » (#17115) : le site UNIQUE où un appel
 * vers un réseau tiers est validé, quelle que soit l'implémentation (faux
 * WhatsApp aujourd'hui, adaptateur Meta après signature). Rien n'atteint une
 * implémentation sans être passé par ici.
 *
 * Elle échoue FERMÉE :
 * - une clé privée, à toute profondeur, est refusée (`KEYS_FORBIDDEN`) ;
 * - un champ hors contrat est refusé, jamais retiré en silence (`INVALID`) ;
 * - un corps d'enveloppe que libsignal ne sait pas lire comme le type déclaré
 *   (`SignalMessage.deserialize` pour 2, `PreKeySignalMessage.deserialize` pour 3)
 *   est refusé (`PLAINTEXT_REFUSED`) — la lecture est celle de libsignal, jamais
 *   un analyseur maison ; une bibliothèque introuvable fait échouer l'appel ;
 * - le journal ne reçoit que la méthode, le code et le réseau : ni le corps, ni
 *   le numéro, ni l'empreinte, ni le message d'erreur de Zod (qui recopie des
 *   valeurs soumises).
 *
 * Limite ASSUMÉE (hors du modèle de menace de la porte) : un client malveillant
 * peut toujours emballer un clair dans un message libsignal bien formé. La porte
 * attrape le clair ACCIDENTEL (ancien client, bogue) ; la confidentialité, elle,
 * vient du chiffrement sur l'appareil.
 */
import { z, type ZodType } from 'zod';
import { containsPrivateKeyField } from '@meeshy/shared/types/e2ee-directory';
import {
  EXTERNAL_PEER_ERROR_CODES,
  ExternalPeerError,
  acknowledgementSchema,
  opaqueAttachmentSchema,
  outboundEnvelopeSchema,
  peerPartySchema,
  peerUserSchema,
  preKeyBundlePublicationSchema,
  type CiphertextType,
  type ExternalPeer,
  type ExternalPeerErrorCode,
  type PeerParty,
} from './external-peer-contract';

/** La seule surface de libsignal dont l'admission a besoin : la lecture des messages sérialisés. */
export type LibsignalMessagesApi = {
  readonly SignalMessage: { deserialize(bytes: Uint8Array): unknown };
  readonly PreKeySignalMessage: { deserialize(bytes: Uint8Array): unknown };
};

export type ExternalPeerLogger = {
  warn(message: string, context: Readonly<Record<string, string>>): void;
};

export type ExternalPeerAdmission = {
  readonly libsignal: () => LibsignalMessagesApi;
  readonly logger: ExternalPeerLogger;
};

const bytesOf = (base64: string): Uint8Array => new Uint8Array(Buffer.from(base64, 'base64'));

function isLibsignalCiphertext(api: LibsignalMessagesApi, type: CiphertextType, body: string): boolean {
  const reader = type === 3 ? api.PreKeySignalMessage : api.SignalMessage;
  if (typeof reader?.deserialize !== 'function') throw new Error('libsignal indisponible');
  try {
    reader.deserialize(bytesOf(body));
    return true;
  } catch {
    return false;
  }
}

const attachmentIdSchema = z.string().uuid();

/** Enveloppe une implémentation : chaque appel est admis, ou refusé sans rien en dire. */
export function admitExternalPeer(peer: ExternalPeer, { libsignal, logger }: ExternalPeerAdmission): ExternalPeer {
  const refuse = (method: string, code: ExternalPeerErrorCode): never => {
    logger.warn('pair externe : appel refusé', { method, code, network: peer.network });
    throw new ExternalPeerError(code);
  };

  const admit = <T>(method: string, schema: ZodType<T>, input: unknown): T => {
    if (containsPrivateKeyField(input)) return refuse(method, EXTERNAL_PEER_ERROR_CODES.KEYS_FORBIDDEN);
    const parsed = schema.safeParse(input);
    return parsed.success ? parsed.data : refuse(method, EXTERNAL_PEER_ERROR_CODES.INVALID);
  };

  const onThisNetwork = (method: string, party: PeerParty): void => {
    if (party.side === 'external' && party.network !== peer.network) refuse(method, EXTERNAL_PEER_ERROR_CODES.INVALID);
  };

  return {
    network: peer.network,
    publishPreKeyBundle: async (input) => {
      const publication = admit('publishPreKeyBundle', preKeyBundlePublicationSchema, input);
      onThisNetwork('publishPreKeyBundle', publication.party);
      return peer.publishPreKeyBundle(publication);
    },
    fetchPreKeyBundles: async (input) => {
      const user = admit('fetchPreKeyBundles', peerUserSchema, input);
      if (user.side === 'external' && user.network !== peer.network) refuse('fetchPreKeyBundles', EXTERNAL_PEER_ERROR_CODES.INVALID);
      return peer.fetchPreKeyBundles(user);
    },
    deliverEnvelope: async (input) => {
      const envelope = admit('deliverEnvelope', outboundEnvelopeSchema, input);
      onThisNetwork('deliverEnvelope', envelope.from);
      onThisNetwork('deliverEnvelope', envelope.to);
      if (!isLibsignalCiphertext(libsignal(), envelope.type, envelope.body)) {
        refuse('deliverEnvelope', EXTERNAL_PEER_ERROR_CODES.PLAINTEXT_REFUSED);
      }
      return peer.deliverEnvelope(envelope);
    },
    receiveEnvelopes: async (input) => {
      const recipient = admit('receiveEnvelopes', peerPartySchema, input);
      onThisNetwork('receiveEnvelopes', recipient);
      return peer.receiveEnvelopes(recipient);
    },
    acknowledge: async (input) => {
      const acknowledgement = admit('acknowledge', acknowledgementSchema, input);
      onThisNetwork('acknowledge', acknowledgement.recipient);
      return peer.acknowledge(acknowledgement);
    },
    deliverAttachment: async (input) => {
      const attachment = admit('deliverAttachment', opaqueAttachmentSchema, input);
      onThisNetwork('deliverAttachment', attachment.uploader);
      return peer.deliverAttachment(attachment);
    },
    fetchAttachment: async (input) => peer.fetchAttachment(admit('fetchAttachment', attachmentIdSchema, input)),
  };
}

/**
 * Charge `@signalapp/libsignal-client` (module ESM, binaire natif) depuis
 * Node ≥ 22.12, où `require` d'un module ESM est permis. Mis en cache.
 */
let cached: LibsignalMessagesApi | undefined;

export function loadLibsignalMessages(): LibsignalMessagesApi {
  if (!cached) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cached = require('@signalapp/libsignal-client') as LibsignalMessagesApi;
  }
  return cached;
}
