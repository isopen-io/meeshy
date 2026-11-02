/**
 * LE CHIFFREUR DE SESSION de ce navigateur (spec § 4.1, #14592), miroir de
 * `E2EESessionCipher.swift` : chaque opération s'exécute dans UNE transaction
 * scellée, sous le verrou — le nouvel état du ratchet est rangé avec le
 * résultat, ou rien ne l'est.
 */
import type { E2EEDeviceBundle } from '@meeshy/shared/types/e2ee-directory';

import { fromBase64 } from './bytes';
import { RECORD_KINDS, type CiphertextType, type E2EECryptoEngine, type EngineAddress, type EngineLocalDevice } from './engine';
import type { RecordTransaction, RecordVault } from './record-vault';

export const addressKey = (address: EngineAddress): string => `${address.userId}.${address.deviceId}`;

export interface SessionCipher {
  startSession(bundle: E2EEDeviceBundle, userId: string): Promise<void>;
  remoteRegistrationId(address: EngineAddress): Promise<number | null>;
  remoteIdentity(address: EngineAddress): Promise<Uint8Array | null>;
  deleteSession(address: EngineAddress): Promise<void>;
  encrypt(plaintext: Uint8Array, address: EngineAddress): Promise<{ readonly type: CiphertextType; readonly body: Uint8Array }>;
  /** Déchiffre ET range ce que `persist` tire du clair dans la MÊME transaction que le nouvel état du ratchet. */
  decrypt<T>(
    ciphertext: { readonly type: CiphertextType; readonly body: Uint8Array },
    address: EngineAddress,
    persist: (plaintext: Uint8Array, transaction: RecordTransaction) => T,
  ): Promise<T>;
}

export function createSessionCipher(params: {
  readonly engine: E2EECryptoEngine;
  readonly vault: RecordVault;
  readonly local: EngineLocalDevice;
  readonly now?: () => number;
}): SessionCipher {
  const { engine, vault, local } = params;
  const now = params.now ?? (() => Date.now());
  return {
    startSession: (bundle, userId) =>
      vault.transact((transaction) => {
        const writes = engine.startSession(
          local,
          transaction.read,
          {
            userId,
            deviceId: bundle.deviceId,
            registrationId: bundle.registrationId,
            identityKey: fromBase64(bundle.identityKey),
            signedPreKey: { keyId: bundle.signedPreKey.keyId, publicKey: fromBase64(bundle.signedPreKey.publicKey), signature: fromBase64(bundle.signedPreKey.signature) },
            kyberPreKey: { keyId: bundle.kyberPreKey.keyId, publicKey: fromBase64(bundle.kyberPreKey.publicKey), signature: fromBase64(bundle.kyberPreKey.signature) },
            preKey: bundle.preKey ? { keyId: bundle.preKey.keyId, publicKey: fromBase64(bundle.preKey.publicKey) } : null,
          },
          now(),
        );
        transaction.stage(writes);
      }),
    remoteRegistrationId: async (address) => {
      const session = await vault.read(RECORD_KINDS.session, addressKey(address));
      return session ? engine.sessionRegistrationId(session) : null;
    },
    remoteIdentity: async (address) => (await vault.read(RECORD_KINDS.remoteIdentity, addressKey(address))) ?? null,
    deleteSession: (address) => vault.transact(({ stage }) => stage([{ kind: RECORD_KINDS.session, key: addressKey(address), value: null }])),
    encrypt: (plaintext, address) =>
      vault.transact((transaction) => {
        const message = engine.encrypt(local, transaction.read, address, plaintext, now());
        transaction.stage(message.writes);
        return { type: message.type, body: message.body };
      }),
    decrypt: (ciphertext, address, persist) =>
      vault.transact((transaction) => {
        const opened = engine.decrypt(local, transaction.read, address, ciphertext.type, ciphertext.body);
        transaction.stage(opened.writes);
        return persist(opened.plaintext, transaction);
      }),
  };
}
