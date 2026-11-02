/**
 * Le moteur `E2EECryptoEngine` rempli par libsignal compilé en WASM (#14592,
 * `packages/libsignal-wasm`, décision D-n de `apps/web/decisions.md`).
 *
 * Ce module ne tire RIEN au démarrage : `loadLibsignalEngine` importe la colle
 * et le binaire à la demande, à l'ouverture d'une conversation chiffrée de bout
 * en bout. Les témoins initialisent la même colle depuis les octets du binaire
 * (`createLibsignalEngine`).
 */
import {
  E2EEEngineVerdict,
  type CiphertextType,
  type E2EECryptoEngine,
  type EngineLocalDevice,
  type OneTimeKeyMaterial,
  type RecordReader,
  type RecordWrite,
  type SignedKeyMaterial,
} from './engine';

/** La colle générée par wasm-bindgen (`libsignal/libsignal.js`), telle qu'on l'appelle. */
export type LibsignalGlue = {
  identityGenerate(): Uint8Array;
  identityPublicKey(identity: Uint8Array): Uint8Array;
  identitySign(identity: Uint8Array, message: Uint8Array): Uint8Array;
  identityVerify(publicIdentity: Uint8Array, message: Uint8Array, signature: Uint8Array): boolean;
  signedPreKeyGenerate(identity: Uint8Array, id: number, timestampMs: number): object;
  kyberPreKeyGenerate(identity: Uint8Array, id: number, timestampMs: number): object;
  preKeyGenerate(id: number): object;
  sessionRemoteRegistrationId(session: Uint8Array): number | undefined;
  sessionStart(
    identity: Uint8Array,
    registrationId: number,
    localName: string,
    localDeviceId: number,
    load: (kind: string, key: string) => Uint8Array | undefined,
    remoteName: string,
    remoteDeviceId: number,
    remoteRegistrationId: number,
    remoteIdentity: Uint8Array,
    preKeyId: number | null | undefined,
    preKey: Uint8Array | null | undefined,
    signedPreKeyId: number,
    signedPreKey: Uint8Array,
    signedPreKeySignature: Uint8Array,
    kyberPreKeyId: number,
    kyberPreKey: Uint8Array,
    kyberPreKeySignature: Uint8Array,
    nowMs: number,
  ): unknown[];
  sessionEncrypt(
    identity: Uint8Array,
    registrationId: number,
    localName: string,
    localDeviceId: number,
    load: (kind: string, key: string) => Uint8Array | undefined,
    remoteName: string,
    remoteDeviceId: number,
    plaintext: Uint8Array,
    nowMs: number,
  ): object;
  sessionDecrypt(
    identity: Uint8Array,
    registrationId: number,
    localName: string,
    localDeviceId: number,
    load: (kind: string, key: string) => Uint8Array | undefined,
    remoteName: string,
    remoteDeviceId: number,
    type: number,
    body: Uint8Array,
  ): object;
};

const field = (value: object, name: string): unknown => (name in value ? Reflect.get(value, name) : undefined);

const bytesField = (value: object, name: string): Uint8Array => {
  const found = field(value, name);
  if (!(found instanceof Uint8Array)) throw new E2EEEngineVerdict(`libsignal: ${name} absent`);
  return found;
};

const signedMaterial = (value: object): SignedKeyMaterial => ({
  record: bytesField(value, 'record'),
  publicKey: bytesField(value, 'publicKey'),
  signature: bytesField(value, 'signature'),
});

const writesOf = (raw: unknown): readonly RecordWrite[] => {
  if (!Array.isArray(raw)) throw new E2EEEngineVerdict('libsignal: écritures illisibles');
  return raw.map((entry: unknown) => {
    if (!Array.isArray(entry) || typeof entry[0] !== 'string' || typeof entry[1] !== 'string') {
      throw new E2EEEngineVerdict('libsignal: écriture illisible');
    }
    const value: unknown = entry[2];
    if (value !== null && !(value instanceof Uint8Array)) throw new E2EEEngineVerdict('libsignal: valeur illisible');
    return { kind: entry[0], key: entry[1], value };
  });
};

const ciphertextType = (value: unknown): CiphertextType => {
  if (value === 2 || value === 3) return value;
  throw new E2EEEngineVerdict(`libsignal: type de chiffré inattendu ${String(value)}`);
};

/** Toute erreur levée par libsignal JUGE l'opération (signature, rejeu, session, identité). */
const judged = <T>(operation: () => T): T => {
  try {
    return operation();
  } catch (error) {
    if (error instanceof E2EEEngineVerdict) throw error;
    throw new E2EEEngineVerdict(error instanceof Error ? error.message : String(error));
  }
};

const reader = (read: RecordReader) => (kind: string, key: string): Uint8Array | undefined => read(kind, key);

export function createLibsignalEngine(glue: LibsignalGlue): E2EECryptoEngine {
  const withLocal = (local: EngineLocalDevice) => [local.identity, local.registrationId, local.userId, local.deviceId] as const;
  return {
    generateIdentity: () => glue.identityGenerate(),
    identityPublicKey: (identity) => judged(() => glue.identityPublicKey(identity)),
    sign: (identity, message) => judged(() => glue.identitySign(identity, message)),
    verify: (publicIdentity, message, signature) => {
      try {
        return glue.identityVerify(publicIdentity, message, signature);
      } catch {
        return false;
      }
    },
    generateSignedPreKey: (identity, keyId, nowMs) => judged(() => signedMaterial(glue.signedPreKeyGenerate(identity, keyId, nowMs))),
    generateKyberPreKey: (identity, keyId, nowMs) => judged(() => signedMaterial(glue.kyberPreKeyGenerate(identity, keyId, nowMs))),
    generatePreKey: (keyId): OneTimeKeyMaterial =>
      judged(() => {
        const raw = glue.preKeyGenerate(keyId);
        return { record: bytesField(raw, 'record'), publicKey: bytesField(raw, 'publicKey') };
      }),
    sessionRegistrationId: (session) => judged(() => glue.sessionRemoteRegistrationId(session) ?? null),
    startSession: (local, read, bundle, nowMs) =>
      judged(() =>
        writesOf(
          glue.sessionStart(
            ...withLocal(local),
            reader(read),
            bundle.userId,
            bundle.deviceId,
            bundle.registrationId,
            bundle.identityKey,
            bundle.preKey?.keyId ?? null,
            bundle.preKey?.publicKey ?? null,
            bundle.signedPreKey.keyId,
            bundle.signedPreKey.publicKey,
            bundle.signedPreKey.signature,
            bundle.kyberPreKey.keyId,
            bundle.kyberPreKey.publicKey,
            bundle.kyberPreKey.signature,
            nowMs,
          ),
        ),
      ),
    encrypt: (local, read, remote, plaintext, nowMs) =>
      judged(() => {
        const raw = glue.sessionEncrypt(...withLocal(local), reader(read), remote.userId, remote.deviceId, plaintext, nowMs);
        return { type: ciphertextType(field(raw, 'type')), body: bytesField(raw, 'body'), writes: writesOf(field(raw, 'writes')) };
      }),
    decrypt: (local, read, remote, type, body) =>
      judged(() => {
        const raw = glue.sessionDecrypt(...withLocal(local), reader(read), remote.userId, remote.deviceId, type, body);
        return { plaintext: bytesField(raw, 'plaintext'), writes: writesOf(field(raw, 'writes')) };
      }),
  };
}

let loading: Promise<E2EECryptoEngine> | null = null;

/** Charge libsignal à la demande (une fois par page) : rien n'entre dans la première peinture. */
export function loadLibsignalEngine(): Promise<E2EECryptoEngine> {
  loading ??= (async () => {
    const [glue, wasm] = await Promise.all([import('./libsignal/libsignal.js'), import('./libsignal/libsignal_bg.wasm?url')]);
    await glue.default({ module_or_path: wasm.default });
    return createLibsignalEngine(glue);
  })().catch((error: unknown) => {
    loading = null;
    throw error;
  });
  return loading;
}
