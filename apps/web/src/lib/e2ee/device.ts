/**
 * L'IDENTITÉ ET L'ENRÔLEMENT de ce navigateur (spec § 3.1 à 3.3, #14592),
 * miroir de `E2EELocalIdentity`, `E2EEDeviceKeyFactory` et
 * `E2EEDeviceRegistrar` (iOS). Les charges envoyées à l'annuaire ont la forme
 * EXACTE de l'iOS (`E2EEEnrollDeviceRequest`, `E2EEPublishKeysRequest`) : la
 * passerelle ne distingue un navigateur que par `platform: 'web'`.
 *
 * Les parties PRIVÉES (identité, pré-clés) sont rangées dans la MÊME
 * transaction scellée que la composition de ce qui part : une pré-clé publiée
 * a toujours sa clé privée sur l'appareil.
 */
import {
  deviceBindingMessage,
  E2EE_ERROR_CODES,
  type E2EEEnrollDeviceRequest,
  type E2EEPublishKeysRequest,
} from '@meeshy/shared/types/e2ee-directory';

import { RECORD_KINDS, type E2EECryptoEngine, type EngineLocalDevice } from './engine';
import { base64 } from './bytes';
import { E2EEDirectoryError, type E2EEDirectoryClient, type E2EEPreKeyStock } from './directory';
import type { RecordTransaction, RecordVault } from './record-vault';

/** Les bornes de réapprovisionnement de la spec (§ 3.2), celles de `E2EEPreKeyPolicy`. */
export const E2EE_PREKEY_POLICY = { batchSize: 100, refillBelow: 20 } as const;

export type LocalIdentity = { readonly keyPair: Uint8Array; readonly registrationId: number };
export type LocalEnrollment = { readonly userId: string; readonly deviceId: number; readonly registrationId: number };

export class E2EEDeviceLimitReached extends Error {
  constructor() {
    super('e2ee: limite d\'appareils atteinte');
    this.name = 'E2EEDeviceLimitReached';
  }
}

const IDENTITY_KEY = 'v1';
const ENROLLMENT_KEY = 'v1';

/** `[registrationId sur 2 octets] ‖ IdentityKeyPair` — la disposition du secret iOS (`E2EEIdentityVault`). */
export function encodeIdentity(identity: LocalIdentity): Uint8Array {
  const out = new Uint8Array(2 + identity.keyPair.length);
  out[0] = (identity.registrationId >> 8) & 0xff;
  out[1] = identity.registrationId & 0xff;
  out.set(identity.keyPair, 2);
  return out;
}

export function decodeIdentity(raw: Uint8Array): LocalIdentity | null {
  if (raw.length <= 2) return null;
  return { registrationId: ((raw[0] ?? 0) << 8) | (raw[1] ?? 0), keyPair: raw.slice(2) };
}

/** 14 bits, jamais 0 (`UInt32.random(in: 1...0x3FFF)`). */
export function randomRegistrationId(): number {
  const [value = 0] = crypto.getRandomValues(new Uint16Array(1));
  return 1 + (value % 0x3fff);
}

const readJson = (raw: Uint8Array | undefined): unknown => {
  if (!raw) return null;
  try {
    return JSON.parse(new TextDecoder().decode(raw));
  } catch {
    return null;
  }
};

const isEnrollment = (value: unknown): value is LocalEnrollment =>
  typeof value === 'object' &&
  value !== null &&
  typeof Reflect.get(value, 'userId') === 'string' &&
  typeof Reflect.get(value, 'deviceId') === 'number' &&
  typeof Reflect.get(value, 'registrationId') === 'number';

export function enrollmentIn(transaction: Pick<RecordTransaction, 'read'>): LocalEnrollment | null {
  const value = readJson(transaction.read(RECORD_KINDS.localEnrollment, ENROLLMENT_KEY));
  return isEnrollment(value) ? value : null;
}

export function identityIn(transaction: Pick<RecordTransaction, 'read'>): LocalIdentity | null {
  const raw = transaction.read(RECORD_KINDS.localIdentity, IDENTITY_KEY);
  return raw ? decodeIdentity(raw) : null;
}

/** Un identifiant neuf par nature de clé, jamais réutilisé sur cet appareil. */
function nextKeyId(transaction: RecordTransaction, counter: string): number {
  const raw = transaction.read(RECORD_KINDS.keyIdCounter, counter);
  const current = raw ? Number(new TextDecoder().decode(raw)) || 0 : 0;
  const next = current >= 0x7fffffff ? 1 : current + 1;
  transaction.stage([{ kind: RECORD_KINDS.keyIdCounter, key: counter, value: new TextEncoder().encode(String(next)) }]);
  return next;
}

/** La fabrique des clés publiées (spec § 3.2), miroir de `E2EEDeviceKeyFactory`. */
export function deviceKeyFactory(engine: E2EECryptoEngine, identity: LocalIdentity) {
  const identityKey = base64(engine.identityPublicKey(identity.keyPair));

  const signedPreKey = (transaction: RecordTransaction, now: number) => {
    const keyId = nextKeyId(transaction, 'signedPreKey');
    const material = engine.generateSignedPreKey(identity.keyPair, keyId, now);
    transaction.stage([{ kind: RECORD_KINDS.signedPreKey, key: String(keyId), value: material.record }]);
    return { keyId, publicKey: base64(material.publicKey), signature: base64(material.signature) };
  };

  const kyberPreKey = (transaction: RecordTransaction, now: number, lastResort: boolean) => {
    const keyId = nextKeyId(transaction, 'kyberPreKey');
    const material = engine.generateKyberPreKey(identity.keyPair, keyId, now);
    transaction.stage([
      { kind: RECORD_KINDS.kyberPreKey, key: String(keyId), value: material.record },
      ...(lastResort ? [{ kind: RECORD_KINDS.kyberLastResortMarker, key: String(keyId), value: new Uint8Array([1]) }] : []),
    ]);
    return { keyId, publicKey: base64(material.publicKey), signature: base64(material.signature) };
  };

  const oneTimePreKeys = (transaction: RecordTransaction, count: number) =>
    Array.from({ length: count }, () => {
      const keyId = nextKeyId(transaction, 'preKey');
      const material = engine.generatePreKey(keyId);
      transaction.stage([{ kind: RECORD_KINDS.preKey, key: String(keyId), value: material.record }]);
      return { keyId, publicKey: base64(material.publicKey) };
    });

  return {
    enrollment(transaction: RecordTransaction, params: { userId: string; label: string | null; now: number; oneTimeBatch: number }): E2EEEnrollDeviceRequest {
      const timestamp = Math.floor(params.now);
      const message = deviceBindingMessage({ userId: params.userId, registrationId: identity.registrationId, identityKey, timestamp });
      const signature = base64(engine.sign(identity.keyPair, new TextEncoder().encode(message)));
      return {
        registrationId: identity.registrationId,
        identityKey,
        signedPreKey: signedPreKey(transaction, params.now),
        kyberLastResort: kyberPreKey(transaction, params.now, true),
        platform: 'web',
        ...(params.label === null ? {} : { label: params.label }),
        binding: { timestamp, signature },
        oneTimePreKeys: oneTimePreKeys(transaction, params.oneTimeBatch),
        kyberPreKeys: Array.from({ length: params.oneTimeBatch }, () => kyberPreKey(transaction, params.now, false)),
      };
    },
    replenishment(transaction: RecordTransaction, stock: E2EEPreKeyStock, now: number): E2EEPublishKeysRequest | null {
      const refillEC = stock.oneTimePreKeys < E2EE_PREKEY_POLICY.refillBelow;
      const refillKyber = stock.kyberPreKeys < E2EE_PREKEY_POLICY.refillBelow;
      if (!refillEC && !refillKyber) return null;
      return {
        ...(refillEC ? { oneTimePreKeys: oneTimePreKeys(transaction, E2EE_PREKEY_POLICY.batchSize) } : {}),
        ...(refillKyber
          ? { kyberPreKeys: Array.from({ length: E2EE_PREKEY_POLICY.batchSize }, () => kyberPreKey(transaction, now, false)) }
          : {}),
      };
    },
  };
}

export type EnrolledDevice = { readonly enrollment: LocalEnrollment; readonly local: EngineLocalDevice };

const codeOf = (error: unknown): string | undefined => (error instanceof E2EEDirectoryError ? error.code : undefined);

/**
 * L'enrôlement de ce navigateur et son entretien, miroir de
 * `E2EEDeviceRegistrar.ensureEnrolled` : enrôlé pour ce compte, il relit son
 * stock et le complète ; délié de sa session, il se réenrôle sans pré-clés
 * uniques puis complète ; révoqué, il tire une nouvelle identité ; un autre
 * compte efface tout.
 */
export function deviceRegistrar(params: {
  readonly engine: E2EECryptoEngine;
  readonly vault: RecordVault;
  readonly directory: E2EEDirectoryClient;
  readonly label: string | null;
  readonly now?: () => number;
}) {
  const { engine, vault, directory, label } = params;
  const now = params.now ?? (() => Date.now());

  const localOf = (enrollment: LocalEnrollment, identity: LocalIdentity): EnrolledDevice => ({
    enrollment,
    local: { identity: identity.keyPair, registrationId: identity.registrationId, userId: enrollment.userId, deviceId: enrollment.deviceId },
  });

  const currentOrCreateIdentity = () =>
    vault.transact((transaction) => {
      const existing = identityIn(transaction);
      if (existing) return existing;
      const created = { keyPair: engine.generateIdentity(), registrationId: randomRegistrationId() };
      transaction.stage([{ kind: RECORD_KINDS.localIdentity, key: IDENTITY_KEY, value: encodeIdentity(created) }]);
      return created;
    });

  const replenish = async (stock: E2EEPreKeyStock, identity: LocalIdentity) => {
    const request = await vault.transact((transaction) => deviceKeyFactory(engine, identity).replenishment(transaction, stock, now()));
    if (request) await directory.publishKeys(stock.deviceId, request);
  };

  const enroll = async (userId: string, identity: LocalIdentity, returning: boolean, regenerate: boolean): Promise<EnrolledDevice> => {
    const request = await vault.transact((transaction) =>
      deviceKeyFactory(engine, identity).enrollment(transaction, { userId, label, now: now(), oneTimeBatch: returning ? 0 : E2EE_PREKEY_POLICY.batchSize }),
    );
    let enrolled: { deviceId: number };
    try {
      enrolled = await directory.enroll(request);
    } catch (error) {
      if (codeOf(error) === E2EE_ERROR_CODES.IDENTITY_REVOKED && regenerate) {
        await vault.erase();
        return enroll(userId, await currentOrCreateIdentity(), false, false);
      }
      if (codeOf(error) === E2EE_ERROR_CODES.DEVICE_LIMIT_REACHED) throw new E2EEDeviceLimitReached();
      throw error;
    }
    const enrollment: LocalEnrollment = { userId, deviceId: enrolled.deviceId, registrationId: identity.registrationId };
    await vault.transact(({ stage }) =>
      stage([{ kind: RECORD_KINDS.localEnrollment, key: ENROLLMENT_KEY, value: new TextEncoder().encode(JSON.stringify(enrollment)) }]),
    );
    if (returning) await replenish(await directory.preKeyStock(), identity);
    return localOf(enrollment, identity);
  };

  const stillBound = async (recorded: LocalEnrollment, identity: LocalIdentity): Promise<EnrolledDevice | null> => {
    try {
      const stock = await directory.preKeyStock();
      if (stock.deviceId !== recorded.deviceId) return null;
      await replenish(stock, identity);
      return localOf(recorded, identity);
    } catch (error) {
      if (codeOf(error) === E2EE_ERROR_CODES.DEVICE_NOT_BOUND) return null;
      throw error;
    }
  };

  return {
    async ensureEnrolled(userId: string): Promise<EnrolledDevice> {
      const recorded = await vault.transact((transaction) => enrollmentIn(transaction));
      if (recorded !== null && recorded.userId !== userId) await vault.erase();
      const identity = await currentOrCreateIdentity();
      if (recorded?.userId === userId && recorded.registrationId === identity.registrationId) {
        const kept = await stillBound(recorded, identity);
        if (kept) return kept;
      }
      return enroll(userId, identity, recorded?.userId === userId, true);
    },
  };
}
