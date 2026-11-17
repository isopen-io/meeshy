import init, {
  ProtocolStore,
  generateIdentity,
  generateKyberPreKey,
  generatePreKey,
  generateSignedPreKey,
  libsignalVersion,
  preKeyMessageInfo,
  sessionRemoteRegistrationId,
  signWithIdentity,
  verifyWithIdentity,
  type GeneratedPreKey as WasmPreKey,
} from './libsignal/libsignal_wasm.js';

/**
 * LE PONT libsignal DU WEB (#17114) — la façade TypeScript du WASM construit
 * depuis `packages/libsignal-wasm` (la crate officielle `libsignal-protocol` au
 * tag de la version commune, #17113). Elle n'implémente aucune primitive. Rien
 * ne part sur le réseau d'ici.
 *
 * PONT v2 (#18992, #18993, #18994, #18995) :
 *  - la preuve de liaison d'un appareil (`signWithIdentity`, XEdDSA) et sa
 *    vérification, la `registrationId` distante d'une session, l'en-tête d'un
 *    premier message (`preKeyMessageInfo`) ;
 *  - des erreurs TYPÉES (`LibsignalBridgeError`) : un `code` stable posé par le
 *    WASM, et la conduite qu'il commande — acquitter l'enveloppe ou réessayer —
 *    sans jamais lire le texte d'affichage de libsignal ;
 *  - LA SESSION NE CIRCULE PLUS PAR VALEUR. Une opération qui fait avancer un
 *    ratchet passe par un BAIL (`leaseSession`, `withSession`) tenu sur une
 *    adresse : il porte l'état et l'avance à chaque opération, et le pont
 *    REFUSE un second bail sur la même adresse tant que le premier est tenu.
 *    Deux scellements depuis un même instantané réutilisaient la clé de
 *    message et l'IV et perdaient le second message ; deux ouvertures
 *    faisaient bifurquer le ratchet (audit WEB-02). L'exclusion ENTRE onglets
 *    et avec le service worker est celle du verrou Web Locks du coffre
 *    (`vault/vault-guard.ts`), pris AVANT le bail.
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
 * Un doublon n'empêche plus rien (#18994) : la façade dédoublonne, le WASM
 * ignore la répétition À L'INJECTION seulement.
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

/** Ce que l'appareil RANGE après chaque opération du bail : la session et l'identité connue du pair. */
export type SessionState = { readonly session: Uint8Array; readonly remoteIdentity: Uint8Array };

export type Opened = SessionState & {
  readonly plaintext: Uint8Array;
  readonly usedPreKeyId: number | null;
  readonly usedKyberPreKeyId: number | null;
  readonly usedSignedPreKeyId: number | null;
  readonly usedBaseKey: Uint8Array | null;
};

export type Sealed = SessionState & { readonly message: WireMessage };

/** L'en-tête d'un premier message, lu sans le déchiffrer. */
export type PreKeyMessageInfo = {
  readonly registrationId: number;
  readonly preKeyId: number | null;
  readonly kyberPreKeyId: number | null;
  readonly signedPreKeyId: number;
  readonly identityKey: Uint8Array;
};

/** Ce qu'une enveloppe devient quand son ouverture échoue : effacée du serveur, ou gardée pour un nouvel essai. */
export type EnvelopeDisposition = 'acknowledge' | 'retry';

/**
 * LES CODES D'ERREUR DU PONT, ET CE QU'ILS COMMANDENT (#18993) — une liste
 * FERMÉE, posée par le WASM (`packages/libsignal-wasm` : `code_of`,
 * `fail_local`, `fail_argument`) ou par la façade (bail, panne du module) ;
 * un code inconnu devient `BRIDGE_FAILURE`.
 *
 * **ACQUITTER OU RÉESSAYER**, aligné sur l'iPhone
 * (`E2EEEnvelopeOpener.isVerdict`) : une erreur du PROTOCOLE sur ce que
 * l'enveloppe apporte est un VERDICT, l'enveloppe ne se lira jamais et
 * s'acquitte ; ce qui tient à CET appareil — une identité qu'il n'a pas
 * (encore) approuvée, son propre état illisible, un bail tenu ailleurs, le
 * module en panne — se RÉESSAIE : acquitter perdrait la copie pour toujours.
 */
export const LIBSIGNAL_ERROR_DISPOSITION = {
  UNTRUSTED_IDENTITY: 'retry',
  INVALID_PREKEY_ID: 'acknowledge',
  INVALID_SIGNED_PREKEY_ID: 'acknowledge',
  INVALID_KYBER_PREKEY_ID: 'acknowledge',
  DUPLICATED_MESSAGE: 'acknowledge',
  INVALID_MESSAGE: 'acknowledge',
  SESSION_NOT_FOUND: 'acknowledge',
  UNRECOGNIZED_VERSION: 'acknowledge',
  SIGNATURE_INVALID: 'acknowledge',
  INVALID_KEY: 'acknowledge',
  INVALID_ARGUMENT: 'acknowledge',
  PROTOCOL: 'acknowledge',
  LOCAL_STATE_INVALID: 'retry',
  BRIDGE_SUSPENDED: 'retry',
  BRIDGE_FAILURE: 'retry',
  SESSION_BUSY: 'retry',
  SESSION_RELEASED: 'retry',
} as const satisfies Readonly<Record<string, EnvelopeDisposition>>;

export type LibsignalErrorCode = keyof typeof LIBSIGNAL_ERROR_DISPOSITION;

export class LibsignalBridgeError extends Error {
  readonly disposition: EnvelopeDisposition;

  constructor(
    readonly code: LibsignalErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'LibsignalBridgeError';
    this.disposition = LIBSIGNAL_ERROR_DISPOSITION[code];
  }
}

const isErrorCode = (value: unknown): value is LibsignalErrorCode => typeof value === 'string' && Object.hasOwn(LIBSIGNAL_ERROR_DISPOSITION, value);

/** Le code que le WASM a posé en propriété de l'erreur — jamais lu dans son texte. */
const bridgeErrorOf = (error: unknown): LibsignalBridgeError => {
  if (error instanceof LibsignalBridgeError) return error;
  const code: unknown = typeof error === 'object' && error !== null ? (error as { readonly code?: unknown }).code : undefined;
  const message = error instanceof Error ? error.message : String(error);
  return new LibsignalBridgeError(isErrorCode(code) ? code : 'BRIDGE_FAILURE', message);
};

const bridged = <T>(operate: () => T): T => {
  try {
    return operate();
  } catch (error) {
    throw bridgeErrorOf(error);
  }
};

export type SessionLeaseInit = {
  readonly local: LocalDevice;
  readonly remote: SignalAddress;
  /** La session rangée, `null` s'il n'y en a pas encore. */
  readonly session: Uint8Array | null;
  /** L'identité connue du pair (épingle), `null` pour la confiance au premier usage. */
  readonly remoteIdentity: Uint8Array | null;
};

/**
 * UN BAIL DE SESSION — le seul chemin par lequel un ratchet avance. Il porte
 * l'état et l'avance à chaque opération ; `state()` rend ce que l'appareil
 * doit ranger (dans la même transaction que le clair ouvert, et AVANT
 * d'envoyer ce qu'il a scellé). Un échec ne change pas l'état.
 */
export type SessionLease = {
  readonly state: () => SessionState | null;
  readonly startSession: (options: { readonly bundle: PublicPreKeyBundle; readonly now?: number }) => Promise<SessionState>;
  readonly seal: (options: { readonly plaintext: Uint8Array; readonly now?: number }) => Promise<Sealed>;
  readonly open: (options: { readonly message: WireMessage; readonly preKeys: DevicePreKeys }) => Promise<Opened>;
  readonly release: () => void;
};

export type LibsignalBridge = {
  readonly version: string;
  readonly generateIdentity: () => Promise<DeviceIdentity>;
  readonly generateSignedPreKey: (options: { readonly identityKeyPair: Uint8Array; readonly id: number; readonly now?: number }) => Promise<GeneratedPreKey>;
  readonly generateKyberPreKey: (options: { readonly identityKeyPair: Uint8Array; readonly id: number; readonly now?: number }) => Promise<GeneratedPreKey>;
  readonly generatePreKey: (options: { readonly id: number }) => Promise<GeneratedPreKey>;
  /** XEdDSA d'un message arbitraire par la clé d'identité — la preuve de liaison (`deviceBindingMessage`). */
  readonly signWithIdentity: (options: { readonly identityKeyPair: Uint8Array; readonly message: Uint8Array }) => Promise<Uint8Array>;
  readonly verifyWithIdentity: (options: { readonly identityKey: Uint8Array; readonly message: Uint8Array; readonly signature: Uint8Array }) => Promise<boolean>;
  /** La génération du pair qu'une session vise, lue dans l'enregistrement. */
  readonly sessionRemoteRegistrationId: (session: Uint8Array) => Promise<number>;
  readonly preKeyMessageInfo: (body: Uint8Array) => Promise<PreKeyMessageInfo>;
  /** Prend le bail d'une adresse — `SESSION_BUSY` si ce contexte le tient déjà. */
  readonly leaseSession: (init: SessionLeaseInit) => SessionLease;
  /** Le bail le temps d'une opération, rendu quoi qu'il arrive. */
  readonly withSession: <T>(init: SessionLeaseInit, operate: (lease: SessionLease) => Promise<T>) => Promise<T>;
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
  throw new LibsignalBridgeError('INVALID_MESSAGE', `libsignal: type de message ${type} hors du protocole à deux`);
};

const hex = (bytes: Uint8Array): string => Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

/** Une clé de base n'est injectée qu'une fois, quelle que soit la forme de la liste rangée. */
const distinctSeenBaseKeys = (keys: readonly SeenBaseKey[]): readonly SeenBaseKey[] => [
  ...new Map(keys.map((key) => [`${key.kyberPreKeyId}.${key.signedPreKeyId}.${hex(key.baseKey)}`, key] as const)).values(),
];

type StoreInput = { readonly local: LocalDevice; readonly remote: SignalAddress; readonly remoteIdentity: Uint8Array | null; readonly session: Uint8Array | null };

/** Un magasin éphémère rempli pour UNE opération, puis libéré quoi qu'il arrive. */
const withStore = <T>({ local, remote, remoteIdentity, session }: StoreInput, preKeys: DevicePreKeys, operate: (store: ProtocolStore) => T): T =>
  bridged(() => {
    const store = new ProtocolStore(local.identityKeyPair, local.registrationId, local.address.name, local.address.deviceId);
    try {
      preKeys.signedPreKeys.forEach(({ id, record }) => store.addSignedPreKey(id, record));
      preKeys.kyberPreKeys.forEach(({ id, record }) => store.addKyberPreKey(id, record));
      preKeys.preKeys.forEach(({ id, record }) => store.addPreKey(id, record));
      distinctSeenBaseKeys(preKeys.seenBaseKeys).forEach(({ kyberPreKeyId, signedPreKeyId, baseKey }) => store.addSeenBaseKey(kyberPreKeyId, signedPreKeyId, baseKey));
      if (remoteIdentity !== null) store.trustIdentity(remote.name, remote.deviceId, remoteIdentity);
      if (session !== null) store.setSession(remote.name, remote.deviceId, session);
      return operate(store);
    } finally {
      store.free();
    }
  });

const sessionStateOf = (store: ProtocolStore, remote: SignalAddress): SessionState => {
  const session = store.session(remote.name, remote.deviceId);
  const remoteIdentity = store.identity(remote.name, remote.deviceId);
  if (session === undefined || remoteIdentity === undefined) throw new LibsignalBridgeError('PROTOCOL', 'libsignal: session absente après l’opération');
  return { session, remoteIdentity };
};

/**
 * LES BAUX TENUS DANS CE CONTEXTE — à l'échelle du module, donc du contexte
 * JavaScript (onglet, Worker) : deux ponts ouverts dans le même onglet ne
 * peuvent pas tenir chacun un bail sur la même adresse.
 */
const heldLeases = new Set<string>();
const leaseKeyOf = ({ local, remote }: Pick<SessionLeaseInit, 'local' | 'remote'>): string =>
  JSON.stringify([local.address.name, local.address.deviceId, remote.name, remote.deviceId]);

const leaseSession = (init: SessionLeaseInit): SessionLease => {
  const key = leaseKeyOf(init);
  if (heldLeases.has(key)) throw new LibsignalBridgeError('SESSION_BUSY', 'libsignal: un bail est déjà tenu sur cette session dans ce contexte');
  heldLeases.add(key);
  let held = true;
  let current: SessionState | null = init.session === null || init.remoteIdentity === null ? null : { session: init.session, remoteIdentity: init.remoteIdentity };
  let session = init.session;
  let trusted = init.remoteIdentity;

  const advance = <T extends SessionState>(preKeys: DevicePreKeys, operate: (store: ProtocolStore) => T): T => {
    if (!held) throw new LibsignalBridgeError('SESSION_RELEASED', 'libsignal: ce bail a été rendu');
    const outcome = withStore({ local: init.local, remote: init.remote, remoteIdentity: trusted, session }, preKeys, operate);
    session = outcome.session;
    trusted = outcome.remoteIdentity;
    current = { session: outcome.session, remoteIdentity: outcome.remoteIdentity };
    return outcome;
  };

  return {
    state: () => current,
    startSession: async ({ bundle, now = Date.now() }) =>
      advance(NO_PRE_KEYS, (store) => {
        store.processPreKeyBundle(
          init.remote.name,
          init.remote.deviceId,
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
        return sessionStateOf(store, init.remote);
      }),
    seal: async ({ plaintext, now = Date.now() }) =>
      advance(NO_PRE_KEYS, (store) => {
        const sealed = store.seal(init.remote.name, init.remote.deviceId, plaintext, now);
        try {
          return { message: { type: asMessageType(sealed.messageType), body: sealed.body }, ...sessionStateOf(store, init.remote) };
        } finally {
          sealed.free();
        }
      }),
    open: async ({ message, preKeys }) =>
      advance(preKeys, (store) => {
        const opened = store.open(init.remote.name, init.remote.deviceId, message.type, message.body);
        try {
          return {
            plaintext: opened.plaintext,
            usedPreKeyId: opened.preKeyId ?? null,
            usedKyberPreKeyId: opened.kyberPreKeyId ?? null,
            usedSignedPreKeyId: opened.signedPreKeyId ?? null,
            usedBaseKey: opened.baseKey ?? null,
            ...sessionStateOf(store, init.remote),
          };
        } finally {
          opened.free();
        }
      }),
    release: () => {
      if (!held) return;
      held = false;
      heldLeases.delete(key);
    },
  };
};

const createBridge = (): LibsignalBridge => ({
  version: libsignalVersion(),
  generateIdentity: async () =>
    bridged(() => {
      const wasm = generateIdentity();
      try {
        return { identityKeyPair: wasm.identityKeyPair, identityKey: wasm.identityKey, registrationId: wasm.registrationId };
      } finally {
        wasm.free();
      }
    }),
  generateSignedPreKey: async ({ identityKeyPair, id, now = Date.now() }) => bridged(() => preKeyOf(generateSignedPreKey(identityKeyPair, id, now))),
  generateKyberPreKey: async ({ identityKeyPair, id, now = Date.now() }) => bridged(() => preKeyOf(generateKyberPreKey(identityKeyPair, id, now))),
  generatePreKey: async ({ id }) => bridged(() => preKeyOf(generatePreKey(id))),
  signWithIdentity: async ({ identityKeyPair, message }) => bridged(() => signWithIdentity(identityKeyPair, message)),
  verifyWithIdentity: async ({ identityKey, message, signature }) => bridged(() => verifyWithIdentity(identityKey, message, signature)),
  sessionRemoteRegistrationId: async (session) => bridged(() => sessionRemoteRegistrationId(session)),
  preKeyMessageInfo: async (body) =>
    bridged(() => {
      const wasm = preKeyMessageInfo(body);
      try {
        return {
          registrationId: wasm.registrationId,
          preKeyId: wasm.preKeyId ?? null,
          kyberPreKeyId: wasm.kyberPreKeyId ?? null,
          signedPreKeyId: wasm.signedPreKeyId,
          identityKey: wasm.identityKey,
        };
      } finally {
        wasm.free();
      }
    }),
  leaseSession,
  withSession: async (init, operate) => {
    const lease = leaseSession(init);
    try {
      return await operate(lease);
    } finally {
      lease.release();
    }
  },
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
