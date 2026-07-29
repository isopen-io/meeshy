/**
 * Préchargement commun à toute la suite de tests du gateway.
 *
 * Raison d'être : le binding natif de `zeromq` appelle `uv_async_init` au
 * chargement du module, une fonction libuv que Bun n'implémente pas. Le
 * runtime ne lève pas une erreur rattrapable — il PANIQUE :
 *
 *     panic(main thread): unsupported uv function: uv_async_init
 *
 * et le lanceur de tests meurt sur place (exit 133). Comme `zeromq` est
 * importé en tête de `ZmqConnectionManager` et `ZmqAgentClient`, la simple
 * chaîne d'imports `PostService` → `ZmqSingleton` → `zmq-translation`
 * suffisait à tuer la suite complète — au 20e fichier sur 571, sans qu'aucune
 * ligne n'indique lequel. Le symptôme observé était « la suite se bloque » :
 * le process paniqué reste en vie sans consommer de CPU.
 *
 * On remplace donc le module par un double inerte. Aucun test du gateway ne
 * parle à un vrai socket ZeroMQ : ceux qui exercent la couche de traduction
 * posent déjà leur propre mock, qui prend le pas sur celui-ci.
 */

import { mock } from 'bun:test';

/** Socket inerte : accepte tout, ne transporte rien, ne ferme aucun handle. */
class FakeSocket {
  readonly events = { on: () => {}, off: () => {} };
  connect(): void {}
  bind(): Promise<void> { return Promise.resolve(); }
  subscribe(): void {}
  unsubscribe(): void {}
  send(): Promise<void> { return Promise.resolve(); }
  close(): void {}
  /** Un abonné réel bloque ici en attendant un message ; le double ne rend
   *  jamais la main non plus, mais sans handle natif ouvert. */
  async *[Symbol.asyncIterator](): AsyncGenerator<Buffer[]> {}
}

class FakeContext {
  close(): void {}
}

mock.module('zeromq', () => ({
  Push: FakeSocket,
  Pull: FakeSocket,
  Subscriber: FakeSocket,
  Publisher: FakeSocket,
  Request: FakeSocket,
  Reply: FakeSocket,
  Dealer: FakeSocket,
  Router: FakeSocket,
  Context: FakeContext,
}));
