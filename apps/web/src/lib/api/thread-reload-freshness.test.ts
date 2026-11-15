import { InfiniteQueryObserver, type QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import { createHttpTransport } from './http';
import { messagesQuery } from './messages';
import { createAppQueryClient, type StorageLike } from './query-client';

/**
 * **UN FIL DÉJÀ OUVERT REVALIDE APRÈS UN RECHARGEMENT COMPLET** (#7353,
 * lot V5) — le symptôme de la recette staging du 2026-09-21 : sur un profil
 * DÉJÀ UTILISÉ (cache persisté existant), des messages arrivés pendant
 * l'absence restaient invisibles après un `goto` complet, alors qu'un profil
 * NEUF (aucun cache) les montrait — la preuve que la passerelle les sert
 * bien, et que le défaut vit dans la revalidation du cache, pas dans la
 * donnée.
 *
 * **CE QUE LA PREMIÈRE FORME DE CE TÉMOIN A ÉTABLI (revue avant commit)** —
 * `useMessages` n'a JAMAIS reposé `staleTime` ni `refetchOnMount` : les deux
 * héritent du défaut de `createAppQueryClient` (30 s). Un `InfiniteQueryObserver`
 * monté sur un cache VIEILLI de plus de 30 s revalide déjà correctement — la
 * mécanique par défaut de TanStack fonctionne. **Mais un rechargement qui
 * suit une absence de QUELQUES SECONDES (le cas nominal d'un `goto`
 * automatisé, ou d'un lecteur qui recharge tout de suite après avoir vu une
 * notification) tombe DANS la fenêtre de 30 s : le cache est « frais » selon
 * TanStack, et RIEN ne revalide — alors que le serveur, lui, a bien avancé.**
 * C'est la forme EXACTE du symptôme : le cache n'est pas « périmé » au sens
 * de `staleTime`, il est simplement PLUS VIEUX que l'événement qui vient de
 * se produire pendant l'absence, aussi courte soit-elle.
 *
 * **Le fil est une donnée VIVANTE**, pas une famille quasi-immuable
 * (`query-freshness.test.ts`, #6974) : la MÊME doctrine que `useStoryFeed` et
 * `usePost` (`query.ts`, `staleTime: 0`, « le lecteur doit voir une vue tout
 * juste marquée ailleurs dès sa prochaine ouverture ») s'applique ICI — le
 * cache-first (D-2, aucun spinner sur un cache non vide) reste entier,
 * `staleTime: 0` ne gouverne QUE la revalidation de fond.
 *
 * Le témoin rejoue le chemin RÉEL d'un rechargement, jamais un simple
 * remontage de composant :
 *
 * 1. **Session 1** — un `AppQueryClient` (motif `createAppQueryClient`) ouvre
 *    le fil, reçoit 3 messages, `persist()` les écrit sur le stockage
 *    (`localStorage` injecté, motif `query-freshness.test.ts`).
 * 2. **L'absence, COURTE** — le « serveur » reçoit 3 messages de PLUS,
 *    immédiatement après ; le même transport les sert désormais. AUCUN
 *    vieillissement artificiel du cache : c'est le cas où l'absence dure
 *    MOINS de 30 s, celui que `staleTime: 30_000` laissait filer.
 * 3. **Le rechargement** — un SECOND `AppQueryClient`, MÊME stockage, MÊME
 *    `buster` : `hydrate()` restaure les 3 messages, SYNCHRONE, avant tout
 *    montage.
 * 4. Un `InfiniteQueryObserver` monté sur ce second client doit servir les 3
 *    messages IMMÉDIATEMENT (cache-first), PUIS les 6 messages sans aucun
 *    geste — stale-while-revalidate, quelle que soit la durée de l'absence.
 */

function fakeStorage(): StorageLike {
  const raw = new Map<string, string>();
  return {
    getItem: (key) => raw.get(key) ?? null,
    setItem: (key, value) => {
      raw.set(key, value);
    },
    removeItem: (key) => {
      raw.delete(key);
    },
  };
}

const WIRE = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: `m${i}`,
    conversationId: 'c-a',
    senderId: 'u1',
    content: `msg ${i}`,
    originalLanguage: 'fr',
    messageType: 'text',
    translations: [],
    createdAt: new Date(1_757_000_000_000 - i * 60_000).toISOString(),
    updatedAt: new Date(1_757_000_000_000 - i * 60_000).toISOString(),
  }));

/** Un `fetchImpl` STATEFUL : sert 3 messages jusqu'à `avancer()`, 6 ensuite —
 * « le serveur reçoit du nouveau pendant l'absence ». */
function transportQuiAvance() {
  let enAvance = false;
  const impl = (async (input: RequestInfo | URL) => {
    void input;
    const data = enAvance ? WIRE(6) : WIRE(3);
    return new Response(
      JSON.stringify({
        success: true,
        data: [...data].reverse(),
        cursorPagination: { limit: 50, hasMore: false, nextCursor: null },
      }),
      { status: 200 },
    );
  }) as typeof fetch;
  return {
    transport: createHttpTransport({ base: '', fetchImpl: impl }),
    avancer: () => {
      enAvance = true;
    },
  };
}

const tour = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/** LA FABRIQUE RÉELLE que `useMessages` consomme TELLE QUELLE
 * (`useInfiniteQuery(messagesQuery(apiDeps, id))`, `query.ts`) — jamais une
 * copie de ses options dans le témoin : une copie qui poserait elle-même
 * `staleTime: 0` resterait verte le jour où la fabrique le perdrait. */
async function montePuisRegle(
  client: QueryClient,
  deps: { readonly source: 'gateway'; readonly transport: ReturnType<typeof createHttpTransport> },
) {
  const observer = new InfiniteQueryObserver(client, messagesQuery(deps, 'c-a'));
  const desabonner = observer.subscribe(() => undefined);
  const immediat = observer.getCurrentResult();
  for (let tours = 0; tours < 200; tours += 1) {
    const resultat = observer.getCurrentResult();
    if (!resultat.isFetching) break;
    await tour();
  }
  const final = observer.getCurrentResult();
  desabonner();
  return { immediat, final };
}

const messagesOf = (resultat: { readonly data?: unknown }): readonly { readonly id: string }[] =>
  (resultat.data as { readonly messages: readonly { readonly id: string }[] } | undefined)?.messages ?? [];

describe('un fil déjà ouvert revalide après un rechargement complet (#7353)', () => {
  test('cache IMMÉDIAT (3), puis les messages arrivés PENDANT UNE ABSENCE COURTE (6) — sans geste, sans attendre 30 s', async () => {
    const storage = fakeStorage();
    const buster = '0.0.0-test:reload-thread';
    const { transport, avancer } = transportQuiAvance();
    const deps = { source: 'gateway' as const, transport };

    // Session 1 — le fil s'ouvre, 3 messages, persisté.
    const clientA = createAppQueryClient({ storage, buster });
    await montePuisRegle(clientA, deps);
    clientA.persist();

    // L'absence — COURTE (aucun vieillissement artificiel) : le serveur
    // avance de 3 messages pendant que le lecteur a le dos tourné, même
    // quelques secondes.
    avancer();

    // Le rechargement — second client, même stockage, même buster.
    const clientB = createAppQueryClient({ storage, buster });
    const { immediat, final } = await montePuisRegle(clientB, deps);

    // Cache-first : la donnée du cache restauré est servie SANS attendre le
    // réseau — trois messages, tout de suite.
    expect(messagesOf(immediat)).toHaveLength(3);

    // Stale-while-revalidate : les messages arrivés pendant l'absence sont
    // là — SANS geste, et SANS avoir attendu la fenêtre de fraîcheur.
    expect(messagesOf(final)).toHaveLength(6);
  });

  test('un cache VIEILLI de plus de 30 s revalide aussi (garde de non-régression, #6972/#6974)', async () => {
    const storage = fakeStorage();
    const buster = '0.0.0-test:reload-thread-vieilli';
    const { transport, avancer } = transportQuiAvance();
    const deps = { source: 'gateway' as const, transport };

    const clientA = createAppQueryClient({ storage, buster });
    await montePuisRegle(clientA, deps);
    clientA.persist();
    avancer();

    const clientB = createAppQueryClient({ storage, buster });
    clientB.setQueryData(messagesQuery(deps, 'c-a').queryKey, (donnee: unknown) => donnee, {
      updatedAt: Date.now() - 31_000,
    });

    const { immediat, final } = await montePuisRegle(clientB, deps);
    expect(messagesOf(immediat)).toHaveLength(3);
    expect(messagesOf(final)).toHaveLength(6);
  });
});
