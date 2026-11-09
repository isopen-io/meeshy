// Le banc NODE des vecteurs croisés libsignal (#17113) : il rejoue
// `packages/shared/fixtures/libsignal/cross-platform.vectors.json`, le même
// fichier que le SDK iOS et `:core:e2ee` Android. Processus à part, car Jest
// remplace la bibliothèque native par un simulacre.
//
//   node libsignal-vectors.mjs <fichier de vecteurs>
//
// Imprime UN objet JSON : la version chargée, ce que chaque cas ouvre, et si la
// même charge altérée d'un octet (premier, milieu, dernier) est refusée.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import * as signal from '@signalapp/libsignal-client';
import { Stores } from './libsignal-stores.mjs';

const bytes = (base64) => new Uint8Array(Buffer.from(base64, 'base64'));
const text = (raw) => new TextDecoder().decode(raw);

const loaded = JSON.parse(
  readFileSync(createRequire(import.meta.url).resolve('@signalapp/libsignal-client/package.json'), 'utf8'),
).version;
const vectors = JSON.parse(readFileSync(process.argv[2], 'utf8'));

const addressOf = (party) => signal.ProtocolAddress.new(party.name, party.deviceId);

const storesOf = (party) => new Stores(signal.IdentityKeyPair.deserialize(bytes(party.identityKeyPair)), party.registrationId);

const bobWithPreKeys = () => {
  const stores = storesOf(vectors.bob);
  const { signedPreKey, kyberPreKey, preKey } = vectors.bob;
  stores.signedPreKeys.set(signedPreKey.id, signal.SignedPreKeyRecord.deserialize(bytes(signedPreKey.record)));
  stores.kyberPreKeys.set(kyberPreKey.id, signal.KyberPreKeyRecord.deserialize(bytes(kyberPreKey.record)));
  stores.preKeys.set(preKey.id, signal.PreKeyRecord.deserialize(bytes(preKey.record)));
  return stores;
};

const withSession = (party, peer, session) => {
  const stores = storesOf(party);
  stores.sessions.set(addressOf(peer).toString(), bytes(session));
  return stores;
};

const open = async (stores, local, remote, { type, body }) => text(
  type === signal.CiphertextMessageType.PreKey
    ? await signal.signalDecryptPreKey(
        signal.PreKeySignalMessage.deserialize(body), addressOf(remote), addressOf(local),
        stores.session, stores.identityStore, stores.preKeyStore, stores.signedPreKeyStore, stores.kyberStore,
      )
    : await signal.signalDecrypt(signal.SignalMessage.deserialize(body), addressOf(remote), addressOf(local), stores.session, stores.identityStore),
);

const wire = (message) => ({ type: message.type, body: bytes(message.body) });

// Le premier octet porte la version du message dans son quartet HAUT ; le
// quartet bas de l'enveloppe PreKeySignalMessage n'est couvert par aucun MAC et
// libsignal l'ignore (mesuré : 0x44 → 0x45 s'ouvre, clair inchangé). L'altération
// de version bascule donc le quartet haut.
const TAMPERED_BYTES = {
  version: { at: () => 0, mask: 0x10 },
  middle: { at: (length) => Math.floor(length / 2), mask: 0x01 },
  last: { at: (length) => length - 1, mask: 0x01 },
};

const flipByte = (message, { at, mask }) => {
  const body = wire(message).body;
  const target = at(body.length);
  return { type: message.type, body: body.map((value, index) => (index === target ? value ^ mask : value)) };
};

const refused = async (attempt) => {
  try {
    await attempt();
    return false;
  } catch {
    return true;
  }
};

const fresh = () => {
  const stores = bobWithPreKeys();
  return vectors.freshSession.messages.reduce(
    async (opened, message) => [...(await opened), await open(stores, vectors.bob, vectors.alice, wire(message))],
    Promise.resolve([]),
  );
};

const { aliceOpensReply, bobOpensThird } = vectors.persistedSessions;

const report = {
  loaded,
  declared: vectors.libsignal,
  fresh: await fresh(),
  aliceOpensReply: await open(withSession(vectors.alice, vectors.bob, aliceOpensReply.session), vectors.alice, vectors.bob, wire(aliceOpensReply.message)),
  bobOpensThird: await open(withSession(vectors.bob, vectors.alice, bobOpensThird.session), vectors.bob, vectors.alice, wire(bobOpensThird.message)),
  tamperedRefused: Object.fromEntries(
    await Promise.all(
      Object.entries(TAMPERED_BYTES).map(async ([name, position]) => [
        name,
        {
          preKeyMessage: await refused(() => open(bobWithPreKeys(), vectors.bob, vectors.alice, flipByte(vectors.freshSession.messages[0], position))),
          aliceOpensReply: await refused(() => open(
            withSession(vectors.alice, vectors.bob, aliceOpensReply.session), vectors.alice, vectors.bob, flipByte(aliceOpensReply.message, position),
          )),
          bobOpensThird: await refused(() => open(
            withSession(vectors.bob, vectors.alice, bobOpensThird.session), vectors.bob, vectors.alice, flipByte(bobOpensThird.message, position),
          )),
        },
      ]),
    ),
  ),
};

process.stdout.write(JSON.stringify(report));
