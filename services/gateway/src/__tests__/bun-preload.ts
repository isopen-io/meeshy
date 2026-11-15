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

import { mock, jest } from 'bun:test';
import { resolve as resolvePath } from 'node:path';
import {
  GATEWAY_ROOT,
  collectRequireActualSites,
  resolveRequireActualSpecifier,
} from './helpers/require-actual-sweep';

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

/**
 * `jest.requireActual` sous bun test (#6519).
 *
 * Bun n'implémente pas `jest.requireActual` (oven-sh/bun#29834, #5394) : sous
 * `bun test`, `jest.requireActual` est `undefined`, et toute suite qui
 * l'appelle — 213 fichiers du gateway, presque toutes dans le patron
 * « garder le module réel, ne surcharger que quelques exports » — meurt au
 * chargement (`TypeError: jest.requireActual is not a function`) alors
 * qu'elle est verte sous jest.
 *
 * Un simple alias vers `require()` ne suffit pas : `mock.module()` de bun
 * remplace la résolution du spécificateur pour TOUT appelant, y compris un
 * `require()` direct — donc pour de bon, jusqu'à la fin du process. Et un
 * `jest.mock` posé par un fichier reste actif pour tous les fichiers suivants
 * du même process bun (relevé en commentaire sur cette issue). Un
 * `requireActual` paresseux, qui ferait `require(cible)` au premier appel,
 * risquerait donc de capturer la version déjà MOQUÉE par un fichier exécuté
 * plus tôt, pas le module réel.
 *
 * La seule fenêtre où AUCUN mock n'existe encore pour personne est celle-ci :
 * le préchargement, qui tourne avant qu'un seul fichier de test soit chargé.
 * `helpers/require-actual-sweep.ts` repère, par balayage statique du texte
 * source, tous les `jest.requireActual('spécificateur')` de la suite ; on
 * capture ici leur cible réelle MAINTENANT, une fois pour toutes — avant que
 * le premier `jest.mock` ne s'exécute où que ce soit. Le même balayage est
 * réutilisé par le cliquet `require-actual-bun-parity.test.ts`.
 */

/**
 * `value`/`error` restent optionnels plutôt que discriminés par `ok` : sous
 * `tsconfig.test.json` (`strictNullChecks: false`), un accès à `result.error`
 * après `if (!result.ok)` ne se rétrécit pas — la forme plate évite le piège
 * plutôt que de compter sur un rétrécissement qui n'a pas lieu.
 */
type ActualLoadResult = { ok: boolean; value?: unknown; error?: unknown };

const actualModuleCache = new Map<string, ActualLoadResult>();

function loadActualModule(resolved: string): ActualLoadResult {
  const cached = actualModuleCache.get(resolved);
  if (cached) return cached;
  let result: ActualLoadResult;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires -- capture ciblée du module réel, hors mock
    result = { ok: true, value: require(resolved) };
  } catch (error) {
    result = { ok: false, error };
  }
  actualModuleCache.set(resolved, result);
  return result;
}

for (const site of collectRequireActualSites(resolvePath(GATEWAY_ROOT, 'src'))) {
  const result = loadActualModule(site.resolved);
  if (!result.ok) {
    console.warn(
      `[bun-preload] jest.requireActual('${site.specifier}') depuis ${site.file} : ` +
      `le module réel n'a pas pu être chargé au préchargement (${String(result.error)}). ` +
      `L'appel lèvera une erreur explicite s'il est réellement invoqué.`
    );
  }
}

/** Repère le premier appelant hors de ce fichier dans la pile d'appel. */
function findRequireActualCaller(): string | undefined {
  const stack = new Error().stack ?? '';
  for (const line of stack.split('\n').slice(1)) {
    const match = line.match(/\(([^()]+):\d+:\d+\)\s*$/) ?? line.match(/at ([^()]+):\d+:\d+\s*$/);
    const file = match?.[1];
    if (!file) continue;
    const path = file.startsWith('file://') ? file.slice('file://'.length) : file;
    if (!path.endsWith('/__tests__/bun-preload.ts')) return path;
  }
  return undefined;
}

jest.requireActual = (specifier: string): unknown => {
  const caller = findRequireActualCaller();
  if (!caller) {
    throw new Error(
      `jest.requireActual('${specifier}') : impossible de déterminer le fichier appelant sous bun test.`
    );
  }
  const resolved = resolveRequireActualSpecifier(specifier, caller);
  const result = loadActualModule(resolved);
  if (!result.ok) {
    throw new Error(
      `jest.requireActual('${specifier}') depuis ${caller} : le module réel n'a pas pu être ` +
      `chargé (${String(result.error)}). Vérifier que l'appel est un littéral de chaîne statique ` +
      `repérable par le balayage de bun-preload.ts.`
    );
  }
  return result.value;
};
