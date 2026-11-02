/**
 * UN MOTEUR DE BANC, SANS AUCUNE CRYPTOGRAPHIE (#14592). Il remplit le contrat
 * `E2EECryptoEngine` pour éprouver la TUYAUTERIE (enrôlement, Sesame, accusés,
 * rangement scellé, attribution) : sessions par adresse, génération visée,
 * premier message de type 3, rejeu refusé, pré-clé unique consommée, envoi vers
 * un de mes appareils refusé sans clé épinglée. Il ne protège RIEN : un témoin
 * de confidentialité exige un vrai moteur. Jamais importé hors des témoins.
 */
import {
  E2EEEngineVerdict,
  type CiphertextType,
  type E2EECryptoEngine,
  type EngineAddress,
  type EngineLocalDevice,
  type RecordReader,
  type RecordWrite,
} from '../engine';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const json = (value: unknown): Uint8Array => encoder.encode(JSON.stringify(value));
const parse = (bytes: Uint8Array): Record<string, unknown> => JSON.parse(decoder.decode(bytes)) as Record<string, unknown>;
const hex = (bytes: Uint8Array): string => [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
const fromHex = (text: string): Uint8Array => Uint8Array.from(text.match(/../g) ?? [], (pair) => parseInt(pair, 16));

const publicOf = (identity: Uint8Array): Uint8Array => Uint8Array.from([0x05, ...identity.slice(0, 32).map((byte) => byte ^ 0x5a)]);

const fnv = (bytes: Uint8Array): number => bytes.reduce((hash, byte) => Math.imul(hash ^ byte, 16777619) >>> 0, 2166136261);
const signatureOf = (publicKey: Uint8Array, message: Uint8Array): Uint8Array => {
  const tag = fnv(Uint8Array.from([...publicKey, ...message]));
  return Uint8Array.from({ length: 64 }, (_, index) => (tag >>> ((index % 4) * 8)) & 0xff);
};

const key = (address: EngineAddress) => `${address.userId}.${address.deviceId}`;
const same = (a: Uint8Array | undefined, b: Uint8Array) => a !== undefined && a.length === b.length && a.every((byte, index) => byte === b[index]);

type Session = { registrationId: number; pending: boolean; sent: number; seen: number[] };

const sessionIn = (read: RecordReader, address: EngineAddress): Session | null => {
  const raw = read('session', key(address));
  return raw ? (parse(raw) as unknown as Session) : null;
};

export function transparentEngine(): E2EECryptoEngine {
  const material = (identity: Uint8Array, keyId: number) => {
    const publicKey = crypto.getRandomValues(new Uint8Array(33));
    return { record: json({ keyId, publicKey: hex(publicKey) }), publicKey, signature: signatureOf(publicOf(identity), publicKey) };
  };
  return {
    generateIdentity: () => crypto.getRandomValues(new Uint8Array(32)),
    identityPublicKey: publicOf,
    sign: (identity, message) => signatureOf(publicOf(identity), message),
    verify: (publicIdentity, message, signature) => same(signature, signatureOf(publicIdentity, message)),
    generateSignedPreKey: material,
    generateKyberPreKey: material,
    generatePreKey: (keyId) => {
      const publicKey = crypto.getRandomValues(new Uint8Array(33));
      return { record: json({ keyId, publicKey: hex(publicKey) }), publicKey };
    },
    sessionRegistrationId: (session) => (parse(session).registrationId as number | undefined) ?? null,
    startSession: (local: EngineLocalDevice, read, bundle) => {
      const address = { userId: bundle.userId, deviceId: bundle.deviceId };
      if (!same(signatureOf(bundle.identityKey, bundle.signedPreKey.publicKey), bundle.signedPreKey.signature)) throw new E2EEEngineVerdict('signature');
      if (bundle.userId === local.userId && !same(read('ownDevicePin', String(bundle.deviceId)), bundle.identityKey)) throw new E2EEEngineVerdict('untrusted identity');
      const session: Session = { registrationId: bundle.registrationId, pending: true, sent: 0, seen: [] };
      return [
        { kind: 'session', key: key(address), value: json(session) },
        { kind: 'remoteIdentity', key: key(address), value: bundle.identityKey },
        { kind: 'pendingPreKey', key: key(address), value: json({ preKeyId: bundle.preKey?.keyId ?? null, kyberId: bundle.kyberPreKey.keyId }) },
      ];
    },
    encrypt: (local, read, remote, plaintext) => {
      const session = sessionIn(read, remote);
      if (!session) throw new E2EEEngineVerdict('no session');
      const type: CiphertextType = session.pending ? 3 : 2;
      const pending = read('pendingPreKey', key(remote));
      const body = json({
        n: session.sent,
        identity: hex(publicOf(local.identity)),
        registrationId: local.registrationId,
        ...(type === 3 && pending ? parse(pending) : {}),
        masked: hex(plaintext.map((byte) => byte ^ 0xa5)),
      });
      return { type, body, writes: [{ kind: 'session', key: key(remote), value: json({ ...session, sent: session.sent + 1 }) }] };
    },
    decrypt: (_local, read, remote, type, body) => {
      const message = parse(body);
      const existing = sessionIn(read, remote);
      if (!existing && type !== 3) throw new E2EEEngineVerdict('no session');
      const session: Session = existing ?? { registrationId: Number(message.registrationId), pending: false, sent: 0, seen: [] };
      const n = Number(message.n);
      if (session.seen.includes(n)) throw new E2EEEngineVerdict('replay');
      const writes: RecordWrite[] = [
        { kind: 'session', key: key(remote), value: json({ ...session, pending: false, seen: [...session.seen, n] }) },
        { kind: 'remoteIdentity', key: key(remote), value: fromHex(String(message.identity)) },
        ...(type === 3 && typeof message.preKeyId === 'number' ? [{ kind: 'preKey', key: String(message.preKeyId), value: null }] : []),
      ];
      return { plaintext: fromHex(String(message.masked)).map((byte) => byte ^ 0xa5), writes };
    },
  };
}
