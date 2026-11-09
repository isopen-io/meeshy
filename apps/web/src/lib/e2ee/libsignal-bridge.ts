import init, {
  ProtocolStore,
  generateIdentity,
  generateKyberPreKey,
  generatePreKey,
  generateSignedPreKey,
  libsignalVersion,
  type GeneratedPreKey as WasmPreKey,
} from './libsignal/libsignal_wasm.js';

/**
 * LE PONT libsignal DU WEB (#17114) — la façade TypeScript du WASM construit
 * depuis `packages/libsignal-wasm` (la crate officielle `libsignal-protocol` au
 * tag de la version commune, #17113). Elle n'implémente aucune primitive et ne
 * garde aucun état : chaque appel reçoit ce que l'appareil a persisté
 * (identité, pré-clés, session, identité connue du pair) et rend ce qu'il doit
 * persister ensuite. Rien ne part sur le réseau d'ici.
 *
 * Ce module tire le WASM : il ne s'importe JAMAIS statiquement depuis un écran,
 * seulement par `loadLibsignalBridge()` (`libsignal-loader.ts`), hors première
 * peinture (`budgets.json › on_demand_chunks.libsignal_bridge`).
 */

export type SignalAddress = { readonly name: string; readonly deviceId: number };

export type LocalDevice = {
  readonly identityKeyPair: Uint8Array;
  readonly registrationId: number;
  readonly address: SignalAddress;
};

export type MessageType = 2 | 3;
export type WireMessage = { readonly type: MessageType; readonly body: Uint8Array };

export type PreKeyEntry = { readonly id: number; readonly record: Uint8Array };

/**
 * Une clé de base déjà acceptée sur un couple (Kyber, signée). L'appareil la
 * persiste après chaque `open` d'un premier message (`usedBaseKey`) et la rend
 * au suivant : c'est ce qui refuse le REJEU d'un premier message adressé à une
 * pré-clé Kyber de dernier recours, que le magasin éphémère oublierait sinon.
 */
export type SeenBaseKey = { readonly kyberPreKeyId: number; readonly signedPreKeyId: number; readonly baseKey: Uint8Array };

export type DevicePreKeys = {
  readonly signedPreKeys: readonly PreKeyEntry[];
  readonly kyberPreKeys: readonly PreKeyEntry[];
  readonly preKeys: readonly PreKeyEntry[];
  readonly seenBaseKeys: readonly SeenBaseKey[];
};

export type DeviceIdentity = {
  readonly identityKeyPair: Uint8Array;
  readonly identityKey: Uint8Array;
  readonly registrationId: number;
};

/** `record` reste dans l'appareil ; `publicKey` et `signature` vont au serveur. */
export type GeneratedPreKey = {
  readonly id: number;
  readonly record: Uint8Array;
  readonly publicKey: Uint8Array;
  readonly signature: Uint8Array;
};

export type SignedPublicKey = { readonly id: number; readonly publicKey: Uint8Array; readonly signature: Uint8Array };

export type PublicPreKeyBundle = {
  readonly registrationId: number;
  readonly identityKey: Uint8Array;
  readonly signedPreKey: SignedPublicKey;
  readonly kyberPreKey: SignedPublicKey;
  readonly preKey: { readonly id: number; readonly publicKey: Uint8Array } | null;
};

export type SessionState = { readonly session: Uint8Array; readonly remoteIdentity: Uint8Array };

export type Opened = SessionState & {
  readonly plaintext: Uint8Array;
  readonly usedPreKeyId: number | null;
  readonly usedKyberPreKeyId: number | null;
  readonly usedSignedPreKeyId: number | null;
  readonly usedBaseKey: Uint8Array | null;
};

export type Sealed = SessionState & { readonly message: WireMessage };

type Peer = { readonly local: LocalDevice; readonly remote: SignalAddress; readonly remoteIdentity: Uint8Array | null };

export type LibsignalBridge = {
  readonly version: string;
  readonly generateIdentity: () => Promise<DeviceIdentity>;
  readonly generateSignedPreKey: (options: { readonly identityKeyPair: Uint8Array; readonly id: number; readonly now?: number }) => Promise<GeneratedPreKey>;
  readonly generateKyberPreKey: (options: { readonly identityKeyPair: Uint8Array; readonly id: number; readonly now?: number }) => Promise<GeneratedPreKey>;
  readonly generatePreKey: (options: { readonly id: number }) => Promise<GeneratedPreKey>;
  readonly startSession: (options: Peer & { readonly bundle: PublicPreKeyBundle; readonly now?: number }) => Promise<SessionState>;
  readonly seal: (options: Peer & { readonly session: Uint8Array; readonly plaintext: Uint8Array; readonly now?: number }) => Promise<Sealed>;
  readonly open: (options: Peer & { readonly session: Uint8Array | null; readonly preKeys: DevicePreKeys; readonly message: WireMessage }) => Promise<Opened>;
};

const NO_PRE_KEYS: DevicePreKeys = { signedPreKeys: [], kyberPreKeys: [], preKeys: [], seenBaseKeys: [] };

const preKeyOf = (wasm: WasmPreKey): GeneratedPreKey => {
  try {
    return { id: wasm.id, record: wasm.record, publicKey: wasm.publicKey, signature: wasm.signature };
  } finally {
    wasm.free();
  }
};

const asMessageType = (type: number): MessageType => {
  if (type === 2 || type === 3) return type;
  throw new Error(`libsignal: type de message ${type} hors du protocole à deux`);
};

/** Un magasin éphémère rempli pour UNE opération, puis libéré quoi qu'il arrive. */
const withStore = <T>({ local, remote, remoteIdentity }: Peer, preKeys: DevicePreKeys, session: Uint8Array | null, operate: (store: ProtocolStore) => T): T => {
  const store = new ProtocolStore(local.identityKeyPair, local.registrationId, local.address.name, local.address.deviceId);
  try {
    preKeys.signedPreKeys.forEach(({ id, record }) => store.addSignedPreKey(id, record));
    preKeys.kyberPreKeys.forEach(({ id, record }) => store.addKyberPreKey(id, record));
    preKeys.preKeys.forEach(({ id, record }) => store.addPreKey(id, record));
    preKeys.seenBaseKeys.forEach(({ kyberPreKeyId, signedPreKeyId, baseKey }) => store.addSeenBaseKey(kyberPreKeyId, signedPreKeyId, baseKey));
    if (remoteIdentity !== null) store.trustIdentity(remote.name, remote.deviceId, remoteIdentity);
    if (session !== null) store.setSession(remote.name, remote.deviceId, session);
    return operate(store);
  } finally {
    store.free();
  }
};

const sessionStateOf = (store: ProtocolStore, remote: SignalAddress): SessionState => {
  const session = store.session(remote.name, remote.deviceId);
  const remoteIdentity = store.identity(remote.name, remote.deviceId);
  if (session === undefined || remoteIdentity === undefined) throw new Error('libsignal: session absente après l’opération');
  return { session, remoteIdentity };
};

const createBridge = (): LibsignalBridge => ({
  version: libsignalVersion(),
  generateIdentity: async () => {
    const wasm = generateIdentity();
    try {
      return { identityKeyPair: wasm.identityKeyPair, identityKey: wasm.identityKey, registrationId: wasm.registrationId };
    } finally {
      wasm.free();
    }
  },
  generateSignedPreKey: async ({ identityKeyPair, id, now = Date.now() }) => preKeyOf(generateSignedPreKey(identityKeyPair, id, now)),
  generateKyberPreKey: async ({ identityKeyPair, id, now = Date.now() }) => preKeyOf(generateKyberPreKey(identityKeyPair, id, now)),
  generatePreKey: async ({ id }) => preKeyOf(generatePreKey(id)),
  startSession: async ({ bundle, now = Date.now(), ...peer }) =>
    withStore(peer, NO_PRE_KEYS, null, (store) => {
      store.processPreKeyBundle(
        peer.remote.name,
        peer.remote.deviceId,
        bundle.registrationId,
        bundle.identityKey,
        bundle.signedPreKey.id,
        bundle.signedPreKey.publicKey,
        bundle.signedPreKey.signature,
        bundle.kyberPreKey.id,
        bundle.kyberPreKey.publicKey,
        bundle.kyberPreKey.signature,
        bundle.preKey?.id,
        bundle.preKey?.publicKey,
        now,
      );
      return sessionStateOf(store, peer.remote);
    }),
  seal: async ({ session, plaintext, now = Date.now(), ...peer }) =>
    withStore(peer, NO_PRE_KEYS, session, (store) => {
      const sealed = store.seal(peer.remote.name, peer.remote.deviceId, plaintext, now);
      try {
        return { message: { type: asMessageType(sealed.messageType), body: sealed.body }, ...sessionStateOf(store, peer.remote) };
      } finally {
        sealed.free();
      }
    }),
  open: async ({ session, preKeys, message, ...peer }) =>
    withStore(peer, preKeys, session, (store) => {
      const opened = store.open(peer.remote.name, peer.remote.deviceId, message.type, message.body);
      try {
        return {
          plaintext: opened.plaintext,
          usedPreKeyId: opened.preKeyId ?? null,
          usedKyberPreKeyId: opened.kyberPreKeyId ?? null,
          usedSignedPreKeyId: opened.signedPreKeyId ?? null,
          usedBaseKey: opened.baseKey ?? null,
          ...sessionStateOf(store, peer.remote),
        };
      } finally {
        opened.free();
      }
    }),
});

/**
 * Instancie le WASM une fois (le module généré mémorise l'instance) et rend le
 * pont. Sans argument, le binaire est servi par l'adresse que Vite émet à côté
 * du chunk ; un témoin passe les octets lus sur le disque.
 */
export const openLibsignalBridge = async (wasm?: BufferSource): Promise<LibsignalBridge> => {
  await init(wasm === undefined ? undefined : { module_or_path: wasm });
  return createBridge();
};
