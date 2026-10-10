import { AsyncLocalStorage } from 'node:async_hooks';
import { createRequire } from 'node:module';

import { afterEach, beforeEach } from 'bun:test';

/**
 * UN TÉMOIN DÉPASSÉ NE LAISSE AUCUN `act()` AUX FICHIERS SUIVANTS (#9509).
 *
 * Quand un témoin dépasse son délai, `bun test` le déclare rouge et passe au
 * suivant — mais rien n'arrête son corps : la promesse abandonnée poursuit ses
 * `await act(…)` par-dessus les témoins des fichiers suivants. React tient la
 * profondeur des portées `act` dans UN compteur de module ; deux corps qui s'y
 * entrelacent ne vident plus la file au bon moment (« overlapping act() calls »)
 * et chaque témoin React qui suit lit un DOM qui n'a pas été rendu. Le
 * 2026-10-06, un seul témoin dépassé a rougi 3 523 témoins innocents, sans
 * qu'aucun échec ne nomme le coupable (#9481).
 *
 * Cette garde, préchargée avant tout fichier, fait deux choses :
 *
 * 1. Chaque témoin porte un NUMÉRO, posé par un `beforeEach` global et suivi à
 *    travers ses `await` par un `AsyncLocalStorage`. Un `act()` appelé depuis
 *    un témoin qui n'est plus le témoin courant lève aussitôt : le corps
 *    abandonné s'arrête à son prochain `act()` au lieu de jouer dans celui
 *    d'un autre, et l'erreur nomme la ligne du fichier coupable.
 *
 * 2. Un `act(async …)` encore ouvert quand son témoin se termine (délai
 *    dépassé, ou `act` non attendu) est REFERMÉ de force par le `afterEach`
 *    global : sa promesse est rejetée, React dépile sa portée, et le témoin
 *    tombe sous son propre nom, avec la ligne qui a ouvert la portée. Sans
 *    cela, une portée qui ne se résout jamais laisserait le compteur de React
 *    au-dessus de zéro pour le reste du processus.
 *
 * Les crochets `beforeAll`/`afterAll` n'ont pas de numéro : leurs `act()`
 * (démontages de fin de fichier) passent sans contrôle.
 *
 * `act` est remplacé sur l'objet `module.exports` de React avant que le moindre
 * fichier ne l'importe : c'est pourquoi ce préchargement passe EN PREMIER dans
 * `bunfig.toml`. `act-leak-guard.test.ts` en garde l'effet.
 */

type Act = (callback: () => unknown) => unknown;
type OpenScope = { readonly abort: (reason: Error) => void; readonly origin: Error };

const isThenable = (value: unknown): value is PromiseLike<unknown> =>
  typeof value === 'object' && value !== null && 'then' in value && typeof value.then === 'function';

const isReactWithAct = (value: unknown): value is { act: Act } =>
  typeof value === 'object' && value !== null && 'act' in value && typeof value.act === 'function';

const react: unknown = createRequire(import.meta.url)('react');
if (!isReactWithAct(react)) throw new Error('act-leak-guard : `react` n’expose pas `act`, la garde ne peut pas se poser.');

const owners = new AsyncLocalStorage<number>();
const openScopes = new Map<number, Set<OpenScope>>();
let current = 0;

export class ActFromFinishedTestError extends Error {
  override readonly name = 'ActFromFinishedTestError';
}

export class ActLeftOpenError extends Error {
  override readonly name = 'ActLeftOpenError';
}

/** La première ligne de pile qui n'est ni React ni cette garde : celle du témoin qui a appelé `act`. */
const callSite = (error: Error): string =>
  (error.stack ?? '')
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.startsWith('at ') && !line.includes('/node_modules/') && !line.includes('act-leak-guard')) ??
  'site inconnu';

const hold = (owner: number, thenable: PromiseLike<unknown>, origin: Error): Promise<unknown> =>
  new Promise((resolve, reject) => {
    const scopes = openScopes.get(owner) ?? new Set<OpenScope>();
    openScopes.set(owner, scopes);
    const scope: OpenScope = { abort: reject, origin };
    scopes.add(scope);
    thenable.then(
      (value) => {
        scopes.delete(scope);
        resolve(value);
      },
      (error: unknown) => {
        scopes.delete(scope);
        reject(error);
      },
    );
  });

const realAct = react.act;

react.act = (callback) => {
  const owner = owners.getStore();
  if (owner !== undefined && owner !== current) {
    const error = new ActFromFinishedTestError(
      `act() appelé par un témoin déjà terminé (délai dépassé, ou promesse non attendue), ${callSite(new Error())} : son corps continuait par-dessus les témoins suivants, il s’arrête ici (#9509).`,
    );
    /* `bun test` ignore le rejet d'un corps qu'il a abandonné : sans cette
       ligne, l'arrêt serait muet. `stderr` et non `console.error`, que des
       témoins innocents espionnent. */
    process.stderr.write(`${error.name}: ${error.message}\n`);
    throw error;
  }
  return realAct(() => {
    const result = callback();
    /* L'origine se capture ICI, pas à l'entrée : seuls les `act` asynchrones
       peuvent survivre à leur témoin, et la pile, synchrone jusqu'au témoin,
       porte encore sa ligne. */
    return owner !== undefined && isThenable(result) ? hold(owner, result, new Error()) : result;
  });
};

beforeEach(() => {
  current += 1;
  owners.enterWith(current);
});

afterEach(() => {
  const scopes = openScopes.get(current);
  openScopes.delete(current);
  if (scopes === undefined || scopes.size === 0) return;
  const sites = [...scopes].map((scope) => callSite(scope.origin)).join(' ; ');
  const error = new ActLeftOpenError(
    `act(async …) encore ouvert à la fin de ce témoin (délai dépassé, ou act non attendu), ${sites} : refermé de force pour que les fichiers suivants n’en héritent pas (#9509).`,
  );
  for (const scope of scopes) scope.abort(error);
  throw error;
});
