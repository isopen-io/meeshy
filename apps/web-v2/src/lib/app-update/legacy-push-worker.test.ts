import { describe, expect, test } from 'bun:test';

import { LEGACY_PUSH_WORKER_SCRIPT, unregisterLegacyPushWorkers } from './legacy-push-worker';

/**
 * LE WORKER ZOMBIE DU PUSH LEGACY (#7305).
 *
 * `meeshy.me` sert la v2 depuis le 2026-09-15. Tout navigateur qui a connu le
 * legacy sur cette origine conserve une inscription VIVANTE de
 * `/firebase-messaging-sw.js`, sous sa propre portée
 * (`/firebase-cloud-messaging-push-scope`), que RIEN ne remplace : la
 * substitution de `/sw.js` ne touche pas une autre inscription, et
 * `sw-legacy-purge.js` ne purge que des caches.
 *
 * Effacer le fichier du dépôt ne tue pas cette inscription — un 404 sur le
 * script pendant une mise à jour ne désinscrit pas un worker, il fait
 * simplement échouer la mise à jour. Le zombie survivrait donc à la
 * suppression, et le même message lèverait DEUX bannières, l'une rendue par
 * lui avec ses routes périmées (`/conversations/<id>`, `/mood`, `/reel` —
 * aucune des trois n'existe dans la v2). C'est une violation directe de D-11,
 * introduite par le lot censé le respecter : la suppression et la
 * désinscription ne se séparent pas.
 */

type Trace = { readonly unregistered: string[] };

const registration = (scriptURL: string | null, trace: Trace, options: { refuses?: boolean } = {}) => ({
  active: scriptURL === null ? null : { scriptURL },
  installing: null,
  waiting: null,
  unregister: async () => {
    if (options.refuses === true) throw new Error('stockage indisponible');
    trace.unregistered.push(scriptURL ?? '');
    return true;
  },
});

const container = (registrations: readonly unknown[]) => ({
  getRegistrations: async () => registrations as never,
});

describe('la désinscription du worker de push legacy', () => {
  test('désinscrit l’inscription dont le script est celui du legacy', async () => {
    const trace: Trace = { unregistered: [] };
    const retirees = await unregisterLegacyPushWorkers(
      container([registration('https://meeshy.me/firebase-messaging-sw.js?firebaseConfig=abc', trace)]),
    );
    expect({ retirees, unregistered: trace.unregistered }).toEqual({
      retirees: 1,
      unregistered: ['https://meeshy.me/firebase-messaging-sw.js?firebaseConfig=abc'],
    });
  });

  test('ne touche JAMAIS le worker de la v2 — c’est lui qui sert l’application', async () => {
    const trace: Trace = { unregistered: [] };
    const retirees = await unregisterLegacyPushWorkers(container([registration('https://meeshy.me/sw.js', trace)]));
    expect({ retirees, unregistered: trace.unregistered }).toEqual({ retirees: 0, unregistered: [] });
  });

  test('lit AUSSI les états `installing` et `waiting` — un zombie peut n’avoir jamais activé', async () => {
    const trace: Trace = { unregistered: [] };
    const retirees = await unregisterLegacyPushWorkers(
      container([
        {
          active: null,
          installing: null,
          waiting: { scriptURL: `https://meeshy.me/${LEGACY_PUSH_WORKER_SCRIPT}` },
          unregister: async () => {
            trace.unregistered.push('waiting');
            return true;
          },
        },
      ]),
    );
    expect({ retirees, unregistered: trace.unregistered }).toEqual({ retirees: 1, unregistered: ['waiting'] });
  });

  test('un échec de désinscription ne fait rien échouer — la page n’en dépend pas', async () => {
    const trace: Trace = { unregistered: [] };
    const retirees = await unregisterLegacyPushWorkers(
      container([
        registration('https://meeshy.me/firebase-messaging-sw.js', trace, { refuses: true }),
        registration('https://meeshy.me/firebase-messaging-sw.js', trace),
      ]),
    );
    expect({ retirees, unregistered: trace.unregistered }).toEqual({
      retirees: 1,
      unregistered: ['https://meeshy.me/firebase-messaging-sw.js'],
    });
  });

  test('idempotent : un second passage ne trouve plus rien', async () => {
    expect(await unregisterLegacyPushWorkers(container([]))).toBe(0);
  });

  test('sans `navigator.serviceWorker`, il n’y a rien à désinscrire', async () => {
    expect(await unregisterLegacyPushWorkers(undefined)).toBe(0);
  });

  test('un conteneur qui refuse la lecture ne lève pas', async () => {
    expect(
      await unregisterLegacyPushWorkers({
        getRegistrations: async () => {
          throw new Error('refusé par la politique du navigateur');
        },
      }),
    ).toBe(0);
  });
});
