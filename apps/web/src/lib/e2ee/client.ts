/**
 * LE CLIENT E2EE d'un compte sur ce navigateur (#14592) : l'appareil enrôlé,
 * son chiffreur, son scelleur et son ouvreur, composés une fois. Il ne se
 * construit que si un moteur libsignal est présent : sans lui, aucune porte
 * d'écriture ne s'ouvre.
 */
import { authored, type E2EEContent } from './content';
import { deviceRegistrar, type LocalEnrollment } from './device';
import { RECORD_KINDS, type E2EECryptoEngine } from './engine';
import type { E2EEDirectoryClient } from './directory';
import { createEnvelopeOpener, type EnvelopeOpener, type PlaintextEntry } from './opener';
import type { RecordVault } from './record-vault';
import { createMessageSealer, type MessageSealer } from './sealer';
import { createSessionCipher } from './session-cipher';

export type E2EEClient = {
  readonly device: LocalEnrollment;
  readonly sealer: MessageSealer;
  readonly opener: EnvelopeOpener;
  /** Range le clair d'un message envoyé PAR cet appareil : il ne lui revient pas en enveloppe. */
  rememberSent(messageId: string, content: E2EEContent): Promise<void>;
};

export async function openE2EEClient(params: {
  readonly engine: E2EECryptoEngine;
  readonly vault: RecordVault;
  readonly directory: E2EEDirectoryClient;
  readonly userId: string;
  readonly label: string | null;
  readonly now?: () => number;
  readonly warn?: (message: string) => void;
}): Promise<E2EEClient> {
  const { engine, vault, directory } = params;
  const enrolled = await deviceRegistrar({ engine, vault, directory, label: params.label, ...(params.now ? { now: params.now } : {}) }).ensureEnrolled(params.userId);
  const cipher = createSessionCipher({ engine, vault, local: enrolled.local, ...(params.now ? { now: params.now } : {}) });
  const local = { userId: enrolled.local.userId, deviceId: enrolled.local.deviceId };
  return {
    device: enrolled.enrollment,
    sealer: createMessageSealer({ local, cipher, directory, vault }),
    opener: createEnvelopeOpener({ local: { ...local, registrationId: enrolled.local.registrationId }, cipher, vault, directory, ...(params.warn ? { warn: params.warn } : {}) }),
    rememberSent: (messageId, content) => {
      const entry: PlaintextEntry = { state: 'readable', content: authored(content, local.userId, local.deviceId), senderUserId: local.userId, senderDeviceId: local.deviceId };
      return vault.transact(({ stage }) => stage([{ kind: RECORD_KINDS.plaintext, key: messageId, value: new TextEncoder().encode(JSON.stringify(entry)) }]));
    },
  };
}
