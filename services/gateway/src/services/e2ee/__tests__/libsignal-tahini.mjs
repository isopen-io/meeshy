// Le banc NODE de Tahini (#17113) : ouverture simultanée d'une session par les
// deux pairs, et SignalMessage en vol pendant que le destinataire redémarre ses
// sessions. Processus à part, car Jest remplace la bibliothèque native par un
// simulacre.
//
//   node libsignal-tahini.mjs
//
// Imprime UN objet JSON : la version chargée, ce que chaque pair lit après une
// ouverture simultanée, et ce que devient un message en vol selon le nombre de
// redémarrages de session (null : illisible).
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import * as signal from '@signalapp/libsignal-client';
import { Stores } from './libsignal-stores.mjs';

const loaded = JSON.parse(
  readFileSync(createRequire(import.meta.url).resolve('@signalapp/libsignal-client/package.json'), 'utf8'),
).version;

const device = (name) => {
  const identity = signal.IdentityKeyPair.generate();
  const stores = new Stores(identity, 1 + Math.floor(Math.random() * 16000));
  const signed = signal.PrivateKey.generate();
  stores.signedPreKeys.set(1, signal.SignedPreKeyRecord.new(1, Date.now(), signed.getPublicKey(), signed, identity.privateKey.sign(signed.getPublicKey().serialize())));
  const kyber = signal.KEMKeyPair.generate();
  stores.kyberPreKeys.set(1, signal.KyberPreKeyRecord.new(1, Date.now(), kyber, identity.privateKey.sign(kyber.getPublicKey().serialize())));
  return { name, identity, stores, signed, kyber, nextPreKey: 1, address: signal.ProtocolAddress.new(name, 1) };
};

const bundleOf = (owner) => {
  const id = owner.nextPreKey;
  owner.nextPreKey += 1;
  const oneTime = signal.PrivateKey.generate();
  owner.stores.preKeys.set(id, signal.PreKeyRecord.new(id, oneTime.getPublicKey(), oneTime));
  return signal.PreKeyBundle.new(
    owner.stores.registrationId, 1, id, oneTime.getPublicKey(),
    1, owner.signed.getPublicKey(), owner.identity.privateKey.sign(owner.signed.getPublicKey().serialize()),
    owner.identity.publicKey,
    1, owner.kyber.getPublicKey(), owner.identity.privateKey.sign(owner.kyber.getPublicKey().serialize()),
  );
};

const startSession = (from, to) => signal.processPreKeyBundle(bundleOf(to), to.address, from.address, from.stores.session, from.stores.identityStore);

const send = async (from, to, text) => {
  const message = await signal.signalEncrypt(new TextEncoder().encode(text), to.address, from.address, from.stores.session, from.stores.identityStore);
  return { type: message.type(), body: message.serialize() };
};

const receive = async (to, from, { type, body }) => {
  try {
    const plaintext = type === signal.CiphertextMessageType.PreKey
      ? await signal.signalDecryptPreKey(
          signal.PreKeySignalMessage.deserialize(body), from.address, to.address,
          to.stores.session, to.stores.identityStore, to.stores.preKeyStore, to.stores.signedPreKeyStore, to.stores.kyberStore,
        )
      : await signal.signalDecrypt(signal.SignalMessage.deserialize(body), from.address, to.address, to.stores.session, to.stores.identityStore);
    return new TextDecoder().decode(plaintext);
  } catch {
    return null;
  }
};

const glare = async () => {
  const alice = device('alice');
  const bob = device('bob');
  await startSession(alice, bob);
  await startSession(bob, alice);
  const fromAlice = await send(alice, bob, 'alice-1');
  const fromBob = await send(bob, alice, 'bob-1');
  const firstMessages = [await receive(bob, alice, fromAlice), await receive(alice, bob, fromBob)];
  const afterwards = [];
  for (let round = 0; round < 6; round += 1) {
    const [from, to] = round % 2 === 0 ? [alice, bob] : [bob, alice];
    afterwards.push(await receive(to, from, await send(from, to, `ping-${round}`)));
  }
  return { firstMessages, afterwards };
};

const inFlightAfter = async (restarts) => {
  const alice = device('alice');
  const bob = device('bob');
  await startSession(alice, bob);
  await receive(bob, alice, await send(alice, bob, 'ouverture'));
  await receive(alice, bob, await send(bob, alice, 'réponse'));
  const inFlight = await send(alice, bob, 'en vol');
  for (let restart = 0; restart < restarts; restart += 1) await startSession(bob, alice);
  return receive(bob, alice, inFlight);
};

const inFlightAfterRestarts = {};
for (const restarts of [1, 3, 4]) inFlightAfterRestarts[restarts] = await inFlightAfter(restarts);

process.stdout.write(JSON.stringify({ loaded, glare: await glare(), inFlightAfterRestarts }));
