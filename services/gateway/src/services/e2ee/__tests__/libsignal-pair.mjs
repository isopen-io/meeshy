// Deux appareils libsignal EN MÉMOIRE pour les bancs Node de la passerelle
// (#17113) : identité, pré-clé signée et Kyber, une pré-clé à usage unique neuve
// par bundle. `receive` rend `{ text }` ou `{ error: { code, message } }`, jamais
// une exception avalée.
import * as signal from '@signalapp/libsignal-client';
import { Stores } from './libsignal-stores.mjs';

export const device = (name) => {
  const identity = signal.IdentityKeyPair.generate();
  const stores = new Stores(identity, 1 + Math.floor(Math.random() * 16000));
  const signed = signal.PrivateKey.generate();
  stores.signedPreKeys.set(1, signal.SignedPreKeyRecord.new(1, Date.now(), signed.getPublicKey(), signed, identity.privateKey.sign(signed.getPublicKey().serialize())));
  const kyber = signal.KEMKeyPair.generate();
  stores.kyberPreKeys.set(1, signal.KyberPreKeyRecord.new(1, Date.now(), kyber, identity.privateKey.sign(kyber.getPublicKey().serialize())));
  return { name, identity, stores, signed, kyber, nextPreKey: 1, address: signal.ProtocolAddress.new(name, 1) };
};

export const bundleOf = (owner) => {
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

export const startSession = (from, to) => signal.processPreKeyBundle(bundleOf(to), to.address, from.address, from.stores.session, from.stores.identityStore);

export const send = async (from, to, text) => {
  const message = await signal.signalEncrypt(new TextEncoder().encode(text), to.address, from.address, from.stores.session, from.stores.identityStore);
  return { type: message.type(), body: message.serialize() };
};

export const receive = async (to, from, { type, body }) => {
  try {
    const plaintext = type === signal.CiphertextMessageType.PreKey
      ? await signal.signalDecryptPreKey(
          signal.PreKeySignalMessage.deserialize(body), from.address, to.address,
          to.stores.session, to.stores.identityStore, to.stores.preKeyStore, to.stores.signedPreKeyStore, to.stores.kyberStore,
        )
      : await signal.signalDecrypt(signal.SignalMessage.deserialize(body), from.address, to.address, to.stores.session, to.stores.identityStore);
    return { text: new TextDecoder().decode(plaintext) };
  } catch (error) {
    return { error: { code: error.code, message: error.message } };
  }
};
