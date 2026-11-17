/**
 * **LE WEB LIT ET ÉCRIT LE CONTENU CHIFFRÉ PAR LE CONTRAT COMMUN, ET REJOUE SES
 * VECTEURS** (#18996, #10788, contrat #18940).
 *
 * Le contrat de ce que libsignal chiffre — contenu v1, signaux v1, sonde,
 * remplissage, verdicts d'ouverture — est UNIQUE : `@meeshy/shared/types/e2ee-content`,
 * avec des vecteurs dont les octets canoniques sont écrits à la main d'après
 * l'iPhone. Le web n'en écrit pas de troisième jumelle : il l'importe, et ce
 * témoin fait traverser à chaque vecteur le chemin réel d'un message —
 * encodé, rempli, SCELLÉ puis OUVERT par le pont libsignal du navigateur, puis
 * confronté à l'enveloppe — pour prouver qu'il rend les mêmes octets et le même
 * verdict que l'iPhone et Android.
 */
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  encodeE2EEContent,
  encodeE2EESignal,
  openE2EEPlaintext,
  padE2EEPlaintext,
  type E2EEContentV1,
  type E2EEEnvelopeOrigin,
  type E2EESignalV1,
} from '@meeshy/shared/types/e2ee-content';

import { LIBSIGNAL_WASM_FILE } from '@/lib/licences/libsignal-engine';

import { openLibsignalBridge, type DevicePreKeys, type LocalDevice } from './libsignal-bridge';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, '..', '..', '..', '..', '..', 'packages', 'shared', 'fixtures');

type EncodedCase<T> = {
  readonly name: string;
  readonly object: T;
  readonly canonicalJson: string;
  readonly envelope: E2EEEnvelopeOrigin;
  readonly padded: { readonly recipients: number; readonly length: number; readonly base64: string };
};
type VerdictCase = {
  readonly name: string;
  readonly plaintextBase64: string;
  readonly envelope: E2EEEnvelopeOrigin;
  readonly payload: 'message' | 'signal';
  readonly verdict: string;
};
type Vectors<T> = { readonly cases: readonly EncodedCase<T>[]; readonly verdicts: readonly VerdictCase[] };

const read = <T>(path: string): Vectors<T> => JSON.parse(readFileSync(join(FIXTURES, path), 'utf8')) as Vectors<T>;
const content = read<E2EEContentV1>('e2ee-content/content.vectors.json');
const signals = read<E2EESignalV1>('e2ee-signal/signal.vectors.json');

const bridge = await openLibsignalBridge(readFileSync(join(HERE, '..', '..', '..', LIBSIGNAL_WASM_FILE)));
const bytes = (base64: string): Uint8Array => new Uint8Array(Buffer.from(base64, 'base64'));
const b64 = (raw: Uint8Array): string => Buffer.from(raw).toString('base64');

/**
 * UN CANAL WEB → WEB RÉEL, partagé par tous les vecteurs : Alice ouvre la
 * session depuis le bundle de Bob et scelle sous SON bail, Bob ouvre sous le
 * sien, dans l'ordre — le premier clair traverse PQXDH, les suivants le Double
 * Ratchet, exactement la vie d'une conversation.
 */
const device = async (name: string) => {
  const identity = await bridge.generateIdentity();
  const local: LocalDevice = { identityKeyPair: identity.identityKeyPair, registrationId: identity.registrationId, address: { name, deviceId: 1 } };
  return { identity, local };
};
const alice = await device('64f0c0ffee0000000000aaaa');
const bob = await device('64f0c0ffee0000000000bbbb');
const signedPreKey = await bridge.generateSignedPreKey({ identityKeyPair: bob.identity.identityKeyPair, id: 1 });
const kyberPreKey = await bridge.generateKyberPreKey({ identityKeyPair: bob.identity.identityKeyPair, id: 1 });
const bobPreKeys: DevicePreKeys = { signedPreKeys: [signedPreKey], kyberPreKeys: [kyberPreKey], preKeys: [], seenBaseKeys: [] };

const sender = bridge.leaseSession({ local: alice.local, remote: bob.local.address, session: null, remoteIdentity: null });
const receiver = bridge.leaseSession({ local: bob.local, remote: alice.local.address, session: null, remoteIdentity: null });
await sender.startSession({
  bundle: {
    registrationId: bob.identity.registrationId,
    identityKey: bob.identity.identityKey,
    signedPreKey: { id: signedPreKey.id, publicKey: signedPreKey.publicKey, signature: signedPreKey.signature },
    kyberPreKey: { id: kyberPreKey.id, publicKey: kyberPreKey.publicKey, signature: kyberPreKey.signature },
    preKey: null,
  },
});

/** Un clair scellé par Alice, ouvert par Bob : ce que le pont rend à l'ouvreur. */
const throughBridge = async (plaintext: Uint8Array): Promise<Uint8Array> => {
  const { message } = await sender.seal({ plaintext });
  return (await receiver.open({ message, preKeys: bobPreKeys })).plaintext;
};

describe.each(content.cases.map((vector) => [vector.name, vector] as const))('le contenu chiffré v1 « %s », du contrat commun au pont du navigateur (#18996)', (_name, vector) => {
  test('octets canoniques, clair rempli, scellé puis ouvert à l’identique, admis', async () => {
    expect(encodeE2EEContent(vector.object)).toBe(vector.canonicalJson);
    const padded = padE2EEPlaintext(vector.canonicalJson, vector.padded.recipients);
    expect({ length: padded.length, base64: b64(padded) }).toEqual({ length: vector.padded.length, base64: vector.padded.base64 });

    const opened = await throughBridge(padded);

    expect(b64(opened)).toBe(vector.padded.base64);
    expect(openE2EEPlaintext(opened, vector.envelope)).toMatchObject({ payload: 'message', content: vector.object });
  });
});

describe.each(signals.cases.map((vector) => [vector.name, vector] as const))('le signal chiffré v1 « %s », du contrat commun au pont du navigateur (#18996)', (_name, vector) => {
  test('octets canoniques, clair rempli, scellé puis ouvert à l’identique, admis', async () => {
    expect(encodeE2EESignal(vector.object)).toBe(vector.canonicalJson);
    const padded = padE2EEPlaintext(vector.canonicalJson, vector.padded.recipients);
    expect(b64(padded)).toBe(vector.padded.base64);

    const opened = await throughBridge(padded);

    expect(b64(opened)).toBe(vector.padded.base64);
    expect(openE2EEPlaintext(opened, vector.envelope)).toMatchObject({ payload: 'signal' });
  });
});

describe.each([...content.verdicts, ...signals.verdicts].map((vector) => [vector.name, vector] as const))('le verdict « %s », sur un clair qui a traversé le pont (#18996)', (_name, vector) => {
  test('le pont rend les octets à l’identique, et le contrat rend le verdict commun', async () => {
    const opened = await throughBridge(bytes(vector.plaintextBase64));

    expect(b64(opened)).toBe(vector.plaintextBase64);
    expect(openE2EEPlaintext(opened, vector.envelope)).toMatchObject({ payload: vector.payload, verdict: vector.verdict });
  });
});
