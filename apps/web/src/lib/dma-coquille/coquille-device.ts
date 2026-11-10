/**
 * UN APPAREIL de la coquille « ami WhatsApp » (#17116) : l'ami simulé, ou
 * l'appareil Meeshy de recette qui lui écrit. Il tire ses clés du pont WASM
 * libsignal du web (#17114), publie son bundle PUBLIC par la porte « pair
 * externe », scelle et ouvre des messages libsignal. Aucune primitive ici :
 * toute la cryptographie est celle de libsignal, par le pont.
 *
 * Les clés privées et les sessions restent dans la mémoire de cet appareil
 * (un onglet, un processus de scénario) et disparaissent avec lui : c'est un
 * outil de recette, pas un client. Rien de privé ne part vers la porte.
 *
 * Adresse libsignal : l'identifiant du compte pour un appareil Meeshy, le
 * numéro E.164 pour un appareil WhatsApp — celles de la décision du
 * 2026-11-09 (« la passerelle parle à un pair externe par une interface unique »).
 */
import type { DevicePreKeys, GeneratedPreKey, LibsignalBridge, LocalDevice, PreKeyEntry, PublicPreKeyBundle, SessionState, SignalAddress } from '../e2ee/libsignal-bridge';

import { fromBase64, toBase64, userOf, type PorteBundle, type PorteClient, type PorteParty, type PortePublication } from './porte-client';

export type Received = {
  readonly envelopeId: string;
  readonly from: PorteParty;
  /** Le clair, sur cet appareil seulement ; `null` quand libsignal n'a pas su ouvrir l'enveloppe. */
  readonly text: string | null;
  /** Le corps tel que le serveur l'a relayé (base64) : ce que la recette vérifie opaque. */
  readonly body: string;
};

export type CoquilleDevice = {
  readonly party: PorteParty;
  readonly publish: () => Promise<void>;
  readonly send: (to: PorteParty, text: string) => Promise<void>;
  readonly receive: () => Promise<readonly Received[]>;
};

export type CoquilleDeviceOptions = {
  readonly bridge: LibsignalBridge;
  readonly porte: PorteClient;
  readonly party: PorteParty;
  readonly oneTimePreKeys?: number;
};

const SIGNED_PRE_KEY_ID = 1;
const KYBER_LAST_RESORT_ID = 1;
const FIRST_ONE_TIME_ID = 100;

type DeviceState = {
  readonly preKeys: DevicePreKeys;
  readonly sessions: ReadonlyMap<string, SessionState>;
};

export const addressOf = (party: PorteParty): SignalAddress => ({ name: party.side === 'meeshy' ? party.userId : party.handle, deviceId: party.deviceId });

const keyOf = (address: SignalAddress): string => `${address.name}.${address.deviceId}`;

const entry = (key: GeneratedPreKey): PreKeyEntry => ({ id: key.id, record: key.record });
const signedKey = (key: GeneratedPreKey) => ({ keyId: key.id, publicKey: toBase64(key.publicKey), signature: toBase64(key.signature) });

const ids = (count: number): readonly number[] => Array.from({ length: count }, (_, index) => FIRST_ONE_TIME_ID + index);

const bundleOf = (served: PorteBundle): PublicPreKeyBundle => ({
  registrationId: served.registrationId,
  identityKey: fromBase64(served.identityKey),
  signedPreKey: { id: served.signedPreKey.keyId, publicKey: fromBase64(served.signedPreKey.publicKey), signature: fromBase64(served.signedPreKey.signature) },
  kyberPreKey: { id: served.kyberPreKey.keyId, publicKey: fromBase64(served.kyberPreKey.publicKey), signature: fromBase64(served.kyberPreKey.signature) },
  preKey: served.preKey ? { id: served.preKey.keyId, publicKey: fromBase64(served.preKey.publicKey) } : null,
});

/** Les pré-clés après une ouverture : une pré-clé UNIQUE consommée sort du magasin, la clé de base acceptée y entre. */
const afterOpening = (preKeys: DevicePreKeys, opened: { readonly usedPreKeyId: number | null; readonly usedKyberPreKeyId: number | null; readonly usedSignedPreKeyId: number | null; readonly usedBaseKey: Uint8Array | null }): DevicePreKeys => ({
  signedPreKeys: preKeys.signedPreKeys,
  preKeys: preKeys.preKeys.filter((key) => key.id !== opened.usedPreKeyId),
  kyberPreKeys: preKeys.kyberPreKeys.filter((key) => key.id === KYBER_LAST_RESORT_ID || key.id !== opened.usedKyberPreKeyId),
  seenBaseKeys:
    opened.usedBaseKey && opened.usedKyberPreKeyId !== null && opened.usedSignedPreKeyId !== null
      ? [...preKeys.seenBaseKeys, { kyberPreKeyId: opened.usedKyberPreKeyId, signedPreKeyId: opened.usedSignedPreKeyId, baseKey: opened.usedBaseKey }]
      : preKeys.seenBaseKeys,
});

export const createCoquilleDevice = async ({ bridge, porte, party, oneTimePreKeys = 4 }: CoquilleDeviceOptions): Promise<CoquilleDevice> => {
  const identity = await bridge.generateIdentity();
  const local: LocalDevice = { identityKeyPair: identity.identityKeyPair, registrationId: identity.registrationId, address: addressOf(party) };
  const signed = await bridge.generateSignedPreKey({ identityKeyPair: identity.identityKeyPair, id: SIGNED_PRE_KEY_ID });
  const lastResort = await bridge.generateKyberPreKey({ identityKeyPair: identity.identityKeyPair, id: KYBER_LAST_RESORT_ID });
  const ecKeys = await Promise.all(ids(oneTimePreKeys).map((id) => bridge.generatePreKey({ id })));
  const kyberKeys = await Promise.all(ids(oneTimePreKeys).map((id) => bridge.generateKyberPreKey({ identityKeyPair: identity.identityKeyPair, id })));

  const publication: PortePublication = {
    party,
    registrationId: identity.registrationId,
    identityKey: toBase64(identity.identityKey),
    signedPreKey: signedKey(signed),
    kyberLastResort: signedKey(lastResort),
    oneTimePreKeys: ecKeys.map((key) => ({ keyId: key.id, publicKey: toBase64(key.publicKey) })),
    kyberPreKeys: kyberKeys.map(signedKey),
  };

  let state: DeviceState = {
    preKeys: { signedPreKeys: [entry(signed)], kyberPreKeys: [entry(lastResort), ...kyberKeys.map(entry)], preKeys: ecKeys.map(entry), seenBaseKeys: [] },
    sessions: new Map(),
  };

  const withSession = (remote: SignalAddress, session: SessionState): void => {
    state = { ...state, sessions: new Map([...state.sessions, [keyOf(remote), session]]) };
  };

  const sessionWith = async (to: PorteParty): Promise<SessionState> => {
    const remote = addressOf(to);
    const known = state.sessions.get(keyOf(remote));
    if (known) return known;
    const bundles = await porte.queryBundles(userOf(to));
    const served = bundles.find((bundle) => bundle.deviceId === to.deviceId);
    if (!served) throw new Error('aucun bundle publié pour cet appareil');
    return bridge.startSession({ local, remote, remoteIdentity: null, bundle: bundleOf(served) });
  };

  const openOne = async (envelope: { readonly envelopeId: string; readonly from: PorteParty; readonly type: 2 | 3; readonly body: string }): Promise<Received> => {
    const remote = addressOf(envelope.from);
    const known = state.sessions.get(keyOf(remote)) ?? null;
    try {
      const opened = await bridge.open({
        local,
        remote,
        remoteIdentity: known?.remoteIdentity ?? null,
        session: known?.session ?? null,
        preKeys: state.preKeys,
        message: { type: envelope.type, body: fromBase64(envelope.body) },
      });
      state = { ...state, preKeys: afterOpening(state.preKeys, opened) };
      withSession(remote, { session: opened.session, remoteIdentity: opened.remoteIdentity });
      return { envelopeId: envelope.envelopeId, from: envelope.from, text: new TextDecoder().decode(opened.plaintext), body: envelope.body };
    } catch {
      return { envelopeId: envelope.envelopeId, from: envelope.from, text: null, body: envelope.body };
    }
  };

  return {
    party,
    publish: () => porte.publish(publication),
    send: async (to, text) => {
      const session = await sessionWith(to);
      const remote = addressOf(to);
      const sealed = await bridge.seal({ local, remote, remoteIdentity: session.remoteIdentity, session: session.session, plaintext: new TextEncoder().encode(text) });
      withSession(remote, { session: sealed.session, remoteIdentity: sealed.remoteIdentity });
      await porte.deliver({ from: party, to, type: sealed.message.type, body: toBase64(sealed.message.body) });
    },
    receive: async () => {
      const envelopes = await porte.pending(party);
      const received = await envelopes.reduce<Promise<readonly Received[]>>(async (done, envelope) => [...(await done), await openOne(envelope)], Promise.resolve([]));
      if (received.length > 0) await porte.acknowledge(party, received.map((item) => item.envelopeId));
      return received;
    },
  };
};
