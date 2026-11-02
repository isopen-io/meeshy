/**
 * LE SCELLEMENT d'un message pour CHAQUE appareil de la conversation directe
 * (Sesame, M. Marlinspike et T. Perrin, rév. 2, § 3 ; spec § 3.4 et § 4.3 ;
 * #14592), miroir de `E2EEMessageSealer.swift` : les appareils actifs du
 * correspondant, plus mes autres appareils APPROUVÉS. Une session manquante ou
 * qui vise une autre génération s'ouvre depuis le bundle (PQXDH) ; un 409
 * `E2EE_DEVICES_MISMATCH` efface les sessions périmées et rechiffre.
 *
 * Modèle de menace : serveur compromis. Il ne reçoit que des chiffrés ; il peut
 * annoncer un appareil de trop sur le compte du CORRESPONDANT (TOFU, jusqu'à la
 * vérification du numéro de sécurité), jamais sur le mien : un de mes appareils
 * ne reçoit de copie que sous la clé épinglée (`ownDevicePin`).
 */
import type { E2EEDevicesMismatch, E2EEEnvelope } from '@meeshy/shared/types/e2ee-directory';

import { base64 } from './bytes';
import { authored, encodeContent, padded, type E2EEContent } from './content';
import { E2EEEngineVerdict, RECORD_KINDS, type EngineAddress } from './engine';
import type { E2EEDirectoryClient, E2EEDeviceListing } from './directory';
import type { RecordVault } from './record-vault';
import type { SessionCipher } from './session-cipher';

export type SealedMessage = {
  readonly senderDeviceId: number;
  readonly envelopes: readonly E2EEEnvelope[];
  readonly unapprovedOwnDevices: readonly number[];
};

export class E2EERecipientHasNoDevice extends Error {
  constructor(readonly userId: string) {
    super('e2ee: le correspondant n\'a aucun appareil chiffré');
    this.name = 'E2EERecipientHasNoDevice';
  }
}

export class E2EEDevicesMismatchUnresolved extends Error {
  constructor() {
    super('e2ee: la liste d\'appareils change sous nos pieds');
    this.name = 'E2EEDevicesMismatchUnresolved';
  }
}

/**
 * Ce que `deliver` lève quand la passerelle répond 409 `E2EE_DEVICES_MISMATCH`.
 * L'écart détaillé est facultatif : chaque tentative RELIT l'annuaire (appareils
 * apparus, générations changées, appareils retirés), ce qui suffit à converger.
 * Le détail, quand il est là, ne sert qu'à oublier tout de suite les sessions
 * des appareils retirés ou périmés.
 */
export class E2EEDevicesMismatchError extends Error {
  constructor(readonly mismatch: E2EEDevicesMismatch | null) {
    super('e2ee: 409 devices mismatch');
    this.name = 'E2EEDevicesMismatchError';
  }
}

export const E2EE_SEAL_MAX_ATTEMPTS = 3;

type Target = { readonly address: EngineAddress; readonly registrationId: number };

export function createMessageSealer(params: {
  readonly local: EngineAddress;
  readonly cipher: SessionCipher;
  readonly directory: E2EEDirectoryClient;
  readonly vault: RecordVault;
}) {
  const { local, cipher, directory, vault } = params;

  const withSessions = async (userId: string, listed: readonly E2EEDeviceListing[]): Promise<readonly Target[]> => {
    const current = await Promise.all(listed.map(async (device) => ({ device, registrationId: await cipher.remoteRegistrationId({ userId, deviceId: device.deviceId }) })));
    const toOpen = current.filter(({ device, registrationId }) => registrationId !== device.registrationId).map(({ device }) => device.deviceId);
    if (toOpen.length > 0) {
      const bundles = await directory.bundles(userId, toOpen);
      for (const bundle of bundles) {
        await cipher.deleteSession({ userId, deviceId: bundle.deviceId });
        await cipher.startSession(bundle, userId);
      }
    }
    const opened = await Promise.all(
      listed.map(async (device) => {
        const address = { userId, deviceId: device.deviceId };
        const registrationId = await cipher.remoteRegistrationId(address);
        return registrationId === null ? null : { address, registrationId };
      }),
    );
    return opened.filter((target): target is Target => target !== null);
  };

  const pinOf = (deviceId: number) => vault.read(RECORD_KINDS.ownDevicePin, String(deviceId));

  const ownTargets = async (): Promise<{ approved: readonly Target[]; unapproved: readonly number[] }> => {
    const others = (await directory.devices(local.userId)).filter((device) => device.deviceId !== local.deviceId);
    const pinned: E2EEDeviceListing[] = [];
    for (const device of others) if (await pinOf(device.deviceId)) pinned.push(device);
    const opened: Target[] = [];
    for (const device of pinned) {
      try {
        opened.push(...(await withSessions(local.userId, [device])));
      } catch (error) {
        if (!(error instanceof E2EEEngineVerdict)) throw error;
      }
    }
    const approved: Target[] = [];
    for (const target of opened) {
      const [identity, pin] = await Promise.all([cipher.remoteIdentity(target.address), pinOf(target.address.deviceId)]);
      if (identity && pin && identity.length === pin.length && identity.every((byte, index) => byte === pin[index])) approved.push(target);
    }
    const approvedIds = new Set(approved.map((target) => target.address.deviceId));
    return { approved, unapproved: others.map((device) => device.deviceId).filter((id) => !approvedIds.has(id)) };
  };

  const sealPlaintext = async (unpadded: Uint8Array, peerUserId: string): Promise<SealedMessage> => {
    const peers = await withSessions(
      peerUserId,
      (await directory.devices(peerUserId)).filter((device) => !(peerUserId === local.userId && device.deviceId === local.deviceId)),
    );
    if (peers.length === 0) throw new E2EERecipientHasNoDevice(peerUserId);
    const own = await ownTargets();
    const recipients = [...peers, ...own.approved];
    const plaintext = padded(unpadded, recipients.length);
    const envelopes: E2EEEnvelope[] = [];
    for (const target of recipients) {
      const ciphertext = await cipher.encrypt(plaintext, target.address);
      envelopes.push({ userId: target.address.userId, deviceId: target.address.deviceId, registrationId: target.registrationId, type: ciphertext.type, body: base64(ciphertext.body) });
    }
    return { senderDeviceId: local.deviceId, envelopes, unapprovedOwnDevices: own.unapproved };
  };

  const plaintextOf = (content: E2EEContent) => encodeContent(authored(content, local.userId, local.deviceId));

  return {
    seal: (content: E2EEContent, peerUserId: string) => sealPlaintext(plaintextOf(content), peerUserId),
    /** Scelle, remet par `deliver`, et résout jusqu'à `E2EE_SEAL_MAX_ATTEMPTS` refus Sesame. */
    async sealAndDeliver<T>(content: E2EEContent, peerUserId: string, deliver: (sealed: SealedMessage) => Promise<T>): Promise<T> {
      const plaintext = plaintextOf(content);
      for (let attempt = 1; attempt <= E2EE_SEAL_MAX_ATTEMPTS; attempt += 1) {
        const sealed = await sealPlaintext(plaintext, peerUserId);
        try {
          return await deliver(sealed);
        } catch (error) {
          if (!(error instanceof E2EEDevicesMismatchError)) throw error;
          for (const ref of [...(error.mismatch?.stale ?? []), ...(error.mismatch?.extra ?? [])]) await cipher.deleteSession(ref);
        }
      }
      throw new E2EEDevicesMismatchUnresolved();
    },
  };
}

export type MessageSealer = ReturnType<typeof createMessageSealer>;
