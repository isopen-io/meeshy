/**
 * Les vecteurs croisés SCELLÉS PAR LE WEB (#17114) : le même échange que
 * `packages/shared/scripts/generate-libsignal-vectors.mjs` (PQXDH, deux
 * PreKeySignalMessage, une réponse, un troisième message après le pas de
 * ratchet), scellé ici par le pont WASM, au même schéma. La passerelle
 * (`libsignal-cross-vectors.test.ts`, vraie bibliothèque native) et le banc
 * web rejouent chaque fichier de `fixtures/libsignal/sealed-by/` : c'est le
 * sens « le web scelle, les autres ouvrent ».
 *
 *   cd apps/web && bun scripts/generate-libsignal-web-vectors.ts
 *
 * Clés de TEST, tirées ici et jamais réutilisées. Le script vérifie chaque
 * vecteur avant de l'écrire. Une montée de libsignal régénère ce fichier dans
 * le même lot que les vecteurs courants.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openLibsignalBridge, type DevicePreKeys, type LocalDevice, type SessionState, type WireMessage } from '../src/lib/e2ee/libsignal-bridge';
import { LIBSIGNAL_WASM_FILE } from '../src/lib/licences/libsignal-engine';

const WEB_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = join(WEB_ROOT, '..', '..', 'packages', 'shared', 'fixtures', 'libsignal', 'sealed-by', 'web.vectors.json');
const TIMESTAMP = 1_790_000_000_000;

const bridge = await openLibsignalBridge(readFileSync(join(WEB_ROOT, LIBSIGNAL_WASM_FILE)));

const b64 = (bytes: Uint8Array): string => Buffer.from(bytes).toString('base64');
const utf8 = (value: string): Uint8Array => new TextEncoder().encode(value);
const text = (raw: Uint8Array): string => new TextDecoder().decode(raw);

const party = async (name: string) => {
  const identity = await bridge.generateIdentity();
  const device: LocalDevice = { identityKeyPair: identity.identityKeyPair, registrationId: identity.registrationId, address: { name, deviceId: 1 } };
  return { identity, device };
};

const ALICE = await party('c3'.repeat(12));
const BOB = await party('d4'.repeat(12));
const signedPreKey = await bridge.generateSignedPreKey({ identityKeyPair: BOB.identity.identityKeyPair, id: 1, now: TIMESTAMP });
const kyberPreKey = await bridge.generateKyberPreKey({ identityKeyPair: BOB.identity.identityKeyPair, id: 1, now: TIMESTAMP });
const preKey = await bridge.generatePreKey({ id: 1 });
const bobPreKeys: DevicePreKeys = { signedPreKeys: [signedPreKey], kyberPreKeys: [kyberPreKey], preKeys: [preKey] };

type Sent = { readonly message: WireMessage; readonly plaintext: string; readonly sender: SessionState };

const seal = async (from: LocalDevice, to: LocalDevice, state: SessionState, plaintext: string): Promise<Sent> => {
  const sealed = await bridge.seal({ local: from, remote: to.address, remoteIdentity: state.remoteIdentity, session: state.session, plaintext: utf8(plaintext) });
  return { message: sealed.message, plaintext, sender: sealed };
};

const expectOpened = async (to: LocalDevice, from: LocalDevice, state: SessionState | null, sent: Sent): Promise<SessionState> => {
  const opened = await bridge.open({
    local: to,
    remote: from.address,
    remoteIdentity: state?.remoteIdentity ?? null,
    session: state?.session ?? null,
    preKeys: bobPreKeys,
    message: sent.message,
  });
  if (text(opened.plaintext) !== sent.plaintext) throw new Error(`vecteur faux : « ${text(opened.plaintext)} » au lieu de « ${sent.plaintext} »`);
  return opened;
};

const started = await bridge.startSession({
  local: ALICE.device,
  remote: BOB.device.address,
  remoteIdentity: null,
  bundle: {
    registrationId: BOB.identity.registrationId,
    identityKey: BOB.identity.identityKey,
    signedPreKey,
    kyberPreKey,
    preKey: { id: preKey.id, publicKey: preKey.publicKey },
  },
});

const first = await seal(ALICE.device, BOB.device, started, 'Bonjour Bob 👋 — scellé par le web');
const bobAfterFirst = await expectOpened(BOB.device, ALICE.device, null, first);
const second = await seal(ALICE.device, BOB.device, first.sender, 'Toujours avant ta réponse, depuis le navigateur');
const bobBeforeReply = await expectOpened(BOB.device, ALICE.device, bobAfterFirst, second);
const aliceBeforeReply = second.sender;
const reply = await seal(BOB.device, ALICE.device, bobBeforeReply, 'Réponse de Bob : le Double Ratchet tourne sur le web');
const bobBeforeThird = reply.sender;
const aliceAfterReply = await expectOpened(ALICE.device, BOB.device, aliceBeforeReply, reply);
const third = await seal(ALICE.device, BOB.device, aliceAfterReply, 'Troisième message d’Alice, après le pas de ratchet');
await expectOpened(BOB.device, ALICE.device, bobBeforeThird, third);

if (first.message.type !== 3 || second.message.type !== 3) throw new Error('les messages d’Alice avant toute réponse doivent être des PreKeySignalMessage');
if (reply.message.type !== 2 || third.message.type !== 2) throw new Error('la réponse et le troisième message doivent être des SignalMessage');

const wire = (sent: Sent) => ({ type: sent.message.type, body: b64(sent.message.body), plaintext: sent.plaintext });
const identityOf = (owner: Awaited<ReturnType<typeof party>>) => ({
  name: owner.device.address.name,
  deviceId: owner.device.address.deviceId,
  registrationId: owner.identity.registrationId,
  identityKeyPair: b64(owner.identity.identityKeyPair),
});

const vectors = {
  _doc: 'Vecteurs croisés libsignal SCELLÉS PAR LE WEB (#17114). Généré par apps/web/scripts/generate-libsignal-web-vectors.ts — ne pas éditer à la main. Clés de TEST.',
  libsignal: bridge.version,
  sealedBy: 'web — pont WASM packages/libsignal-wasm',
  alice: identityOf(ALICE),
  bob: {
    ...identityOf(BOB),
    signedPreKey: { id: signedPreKey.id, record: b64(signedPreKey.record) },
    kyberPreKey: { id: kyberPreKey.id, record: b64(kyberPreKey.record) },
    preKey: { id: preKey.id, record: b64(preKey.record) },
  },
  freshSession: {
    _label: 'Bob, depuis ses seules pré-clés, ouvre les deux PreKeySignalMessage d’Alice (PQXDH, Kyber, pré-clé unique)',
    messages: [wire(first), wire(second)],
  },
  persistedSessions: {
    _label: 'Sessions SÉRIALISÉES par le web : chacune, rechargée, ouvre le SignalMessage suivant',
    aliceOpensReply: { session: b64(aliceBeforeReply.session), message: wire(reply) },
    bobOpensThird: { session: b64(bobBeforeThird.session), message: wire(third) },
  },
};

mkdirSync(dirname(OUTPUT), { recursive: true });
writeFileSync(OUTPUT, `${JSON.stringify(vectors, null, 2)}\n`);
process.stdout.write(`vecteurs libsignal ${bridge.version} scellés par le web écrits dans ${OUTPUT}\n`);
