// Le banc NODE de la malléabilité d'un PreKeySignalMessage (#17113) : une copie
// modifiée hors MAC (quartet bas du premier octet, champ protobuf inconnu ajouté
// à la fin) s'ouvre, puis l'original est refusé comme doublon. Processus à part,
// car Jest remplace la bibliothèque native par un simulacre.
//
//   node libsignal-prekey-malleability.mjs
import { device, receive, send, startSession } from './libsignal-pair.mjs';

const UNKNOWN_FIELD = [0xf8, 0x07, 0x01];

const copyThenOriginal = async (alter) => {
  const alice = device('alice');
  const bob = device('bob');
  await startSession(alice, bob);
  const message = await send(alice, bob, 'secret');
  const copy = await receive(bob, alice, { type: message.type, body: alter(Uint8Array.from(message.body)) });
  return { firstByte: message.body[0], copy, original: await receive(bob, alice, message) };
};

const lowNibbleFlipped = await copyThenOriginal((body) => body.map((value, index) => (index === 0 ? value ^ 0x01 : value)));
const unknownFieldAppended = await copyThenOriginal((body) => Uint8Array.from([...body, ...UNKNOWN_FIELD]));

process.stdout.write(JSON.stringify({
  firstByte: lowNibbleFlipped.firstByte,
  lowNibbleFlipped: { copy: lowNibbleFlipped.copy, original: lowNibbleFlipped.original },
  unknownFieldAppended: { copy: unknownFieldAppended.copy, original: unknownFieldAppended.original },
}));
