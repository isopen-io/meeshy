/**
 * LE MOTEUR CRYPTOGRAPHIQUE du bout en bout web (#14592) : le contrat que
 * libsignal (compilé en WASM, `libsignal-engine.ts`) remplit. Aucune primitive
 * n'est écrite côté TypeScript : PQXDH (X25519 + ML-KEM-1024), Double Ratchet
 * et XEdDSA sont ceux du crate `libsignal-protocol` du tag épinglé
 * (`packages/LibSignalClient/LIBSIGNAL_VERSION`, le même que l'iOS).
 *
 * Le moteur est SANS ÉTAT : chaque opération lit les enregistrements par
 * `read` et rend ses écritures, que l'appelant range dans UNE transaction
 * scellée (`record-vault.ts`) — le nouvel état du ratchet part avec le
 * résultat, ou rien ne part.
 */

/** Les natures d'enregistrement, miroir de `E2EERecordKind` (iOS). */
export const RECORD_KINDS = {
  session: 'session',
  remoteIdentity: 'remoteIdentity',
  preKey: 'preKey',
  signedPreKey: 'signedPreKey',
  kyberPreKey: 'kyberPreKey',
  kyberLastResortMarker: 'kyberLastResortMarker',
  kyberBaseKeySeen: 'kyberBaseKeySeen',
  senderKey: 'senderKey',
  ownDevicePin: 'ownDevicePin',
  keyIdCounter: 'keyIdCounter',
  localIdentity: 'localIdentity',
  localEnrollment: 'localEnrollment',
  plaintext: 'plaintext',
} as const;

export type RecordKind = (typeof RECORD_KINDS)[keyof typeof RECORD_KINDS];

/** Une écriture rendue par une opération ; `null` efface. */
export type RecordWrite = { readonly kind: string; readonly key: string; readonly value: Uint8Array | null };

/** La lecture synchrone de la transaction ouverte. */
export type RecordReader = (kind: string, key: string) => Uint8Array | undefined;

/** L'appareil local : sa paire d'identité sérialisée (privée comprise), sa génération, son adresse. */
export type EngineLocalDevice = {
  readonly identity: Uint8Array;
  readonly registrationId: number;
  readonly userId: string;
  readonly deviceId: number;
};

export type EngineAddress = { readonly userId: string; readonly deviceId: number };

export type SignedKeyMaterial = {
  readonly record: Uint8Array;
  readonly publicKey: Uint8Array;
  readonly signature: Uint8Array;
};

export type OneTimeKeyMaterial = { readonly record: Uint8Array; readonly publicKey: Uint8Array };

/** Un bundle PQXDH décodé (octets), pour UN appareil. */
export type EngineBundle = {
  readonly userId: string;
  readonly deviceId: number;
  readonly registrationId: number;
  readonly identityKey: Uint8Array;
  readonly signedPreKey: { readonly keyId: number; readonly publicKey: Uint8Array; readonly signature: Uint8Array };
  readonly kyberPreKey: { readonly keyId: number; readonly publicKey: Uint8Array; readonly signature: Uint8Array };
  readonly preKey: { readonly keyId: number; readonly publicKey: Uint8Array } | null;
};

/** 3 = `PreKeySignalMessage` (premier message, PQXDH), 2 = `SignalMessage`. */
export type CiphertextType = 2 | 3;

export const PRE_KEY_MESSAGE_TYPE = 3 as const;
export const SIGNAL_MESSAGE_TYPE = 2 as const;

/**
 * libsignal a JUGÉ l'opération (signature invalide, rejeu, session absente,
 * identité refusée) : à distinguer d'un refus de stockage, qui ne juge rien.
 */
export class E2EEEngineVerdict extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'E2EEEngineVerdict';
  }
}

export interface E2EECryptoEngine {
  generateIdentity(): Uint8Array;
  identityPublicKey(identity: Uint8Array): Uint8Array;
  sign(identity: Uint8Array, message: Uint8Array): Uint8Array;
  verify(publicIdentity: Uint8Array, message: Uint8Array, signature: Uint8Array): boolean;
  generateSignedPreKey(identity: Uint8Array, keyId: number, nowMs: number): SignedKeyMaterial;
  generateKyberPreKey(identity: Uint8Array, keyId: number, nowMs: number): SignedKeyMaterial;
  generatePreKey(keyId: number): OneTimeKeyMaterial;
  /** La génération que vise une session, `null` sans état courant (Sesame § 3). */
  sessionRegistrationId(session: Uint8Array): number | null;
  startSession(local: EngineLocalDevice, read: RecordReader, bundle: EngineBundle, nowMs: number): readonly RecordWrite[];
  encrypt(
    local: EngineLocalDevice,
    read: RecordReader,
    remote: EngineAddress,
    plaintext: Uint8Array,
    nowMs: number,
  ): { readonly type: CiphertextType; readonly body: Uint8Array; readonly writes: readonly RecordWrite[] };
  decrypt(
    local: EngineLocalDevice,
    read: RecordReader,
    remote: EngineAddress,
    type: CiphertextType,
    body: Uint8Array,
  ): { readonly plaintext: Uint8Array; readonly writes: readonly RecordWrite[] };
}
