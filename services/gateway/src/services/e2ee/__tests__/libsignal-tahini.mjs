// Le banc NODE de Tahini (#17113) : ouverture simultanée d'une session par les
// deux pairs, et SignalMessage en vol pendant que le destinataire redémarre ses
// sessions. Processus à part, car Jest remplace la bibliothèque native par un
// simulacre.
//
//   node libsignal-tahini.mjs
//
// Imprime UN objet JSON : la version chargée, ce que chaque pair lit après une
// ouverture simultanée, et ce que devient un message en vol selon le nombre de
// redémarrages de session ({ text } ou { error }). Les redémarrages sont des
// ouvertures LOCALES chez le destinataire, chacune archivant la session active.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { device, receive, send, startSession } from './libsignal-pair.mjs';

const loaded = JSON.parse(
  readFileSync(createRequire(import.meta.url).resolve('@signalapp/libsignal-client/package.json'), 'utf8'),
).version;

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
