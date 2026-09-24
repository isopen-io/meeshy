import { afterEach, describe, expect, test } from 'bun:test';

import { ApiError } from './client';
import { isMediaAbsent, noteMediaAbsent, resetAbsentMedia } from './media-absent';
import { CACHE_SCHEMA, createAppQueryClient, purgeReaderCaches, shouldRetry, type StorageLike } from './query-client';
import { reactionStore } from './reaction-store';
import { createSessionStore } from './session';
/* La CONSTANTE, jamais son littéral : un `'admin-souverain'` recopié ici
   laisserait ce témoin vert après un renommage — vert pour la mauvaise
   raison, sur une garde de confidentialité. */
import { ADMIN_SOUVERAIN_PREFIXE } from './souverain';

function fakeStorage(): StorageLike & { readonly raw: Map<string, string> } {
  const raw = new Map<string, string>();
  return {
    raw,
    getItem: (key) => raw.get(key) ?? null,
    setItem: (key, value) => {
      raw.set(key, value);
    },
    removeItem: (key) => {
      raw.delete(key);
    },
  };
}

describe('shouldRetry — les deux moitiés', () => {
  test('ApiError 401/403/404 ⇒ false dès le 1er échec', () => {
    for (const status of [401, 403, 404]) {
      const error = new ApiError({ ok: false, status, error: 'refus' });
      expect(shouldRetry(1, error)).toBe(false);
    }
  });

  test('status 0 / 500 / TIMEOUT ⇒ trois ESSAIS RÉELS au total, pas cinq', async () => {
    // Compte les appels de `queryFn` via `QueryClient.fetchQuery`, jamais les
    // verdicts bruts du prédicat : `failureCount` (query-core) démarre à 0 et
    // n'est incrémenté qu'après le verdict, donc raisonner en verdicts
    // 1-based masque un `<= 2` qui autorise cinq essais (#6210).
    for (const error of [
      new ApiError({ ok: false, status: 0, error: 'réseau' }),
      new ApiError({ ok: false, status: 500, error: 'panne' }),
      new ApiError({ ok: false, status: 0, error: 'délai', code: 'TIMEOUT' }),
    ]) {
      const client = createAppQueryClient({ storage: fakeStorage(), buster: '0.0.0-test:u1' });
      let calls = 0;
      let threw = false;
      try {
        await client.fetchQuery({
          queryKey: ['boom', error.message],
          queryFn: () => {
            calls += 1;
            return Promise.reject(error);
          },
          retry: shouldRetry,
          retryDelay: 0,
        });
      } catch {
        threw = true;
      }
      expect(threw).toBe(true);
      expect(calls).toBe(3);
    }
  });
});

describe('persistence — round trip', () => {
  test('même storage, même buster ⇒ getQueryData rend la donnée persistée', () => {
    const storage = fakeStorage();
    const a = createAppQueryClient({ storage, buster: '0.0.0-test:u1' });
    a.setQueryData(['conversations'], [{ id: 'c-1' }]);
    a.persist();

    const b = createAppQueryClient({ storage, buster: '0.0.0-test:u1' });
    expect(b.getQueryData(['conversations'])).toEqual([{ id: 'c-1' }]);
  });

  /**
   * **UNE LECTURE SOUVERAINE NE TOUCHE PAS LE DISQUE** (#6862).
   *
   * `estClefSouveraine` est testé isolément dans `souverain`/`admin-conversations` ;
   * ces témoins-ci gardent la seule chose qui compte vraiment — que `persist()`
   * l'APPLIQUE. Un prédicat juste que le filtre n'appelle pas laisserait le
   * contenu d'une conversation privée sur le poste de l'administrateur, où il
   * survivrait à la session : une copie qu'`AdminAuditLog` ne connaît pas et
   * que personne ne révoque.
   *
   * Ce qui est écrit est lu depuis la Map du faux stockage plutôt que par une
   * clé de cache recopiée : le nom du seau est un détail d'implémentation, et
   * un troisième site qui le déclare finirait par diverger.
   */
  const CLEF_SOUVERAINE = [ADMIN_SOUVERAIN_PREFIXE, 'messages', 'conv-1', 0] as const;
  const SECRET = 'texte-prive-que-rien-ne-doit-ecrire-sur-le-disque';

  test('le contenu d’une lecture souveraine n’entre PAS dans le stockage', () => {
    const storage = fakeStorage();
    const client = createAppQueryClient({ storage, buster: '0.0.0-test:u1' });

    client.setQueryData(['conversations'], [{ id: 'c-1' }]);
    client.setQueryData(CLEF_SOUVERAINE, { messages: [{ id: 'm-1', content: SECRET }] });
    client.persist();

    const ecrit = [...storage.raw.values()].join('');
    expect(ecrit).not.toContain(SECRET);
    expect(ecrit).not.toContain(ADMIN_SOUVERAIN_PREFIXE);

    // LE CONTRASTE, sans lequel ce témoin passerait aussi sur un filtre qui
    // n'écrirait plus RIEN — c'est-à-dire sur une v2 qui aurait perdu tout son
    // cache persisté sans que personne ne s'en aperçoive.
    expect(ecrit).toContain('conversations');
    expect(ecrit).toContain('c-1');
  });

  test('exclure du DISQUE n’est pas jeter : la donnée reste en mémoire pour l’écran qui la lit', () => {
    const storage = fakeStorage();
    const client = createAppQueryClient({ storage, buster: '0.0.0-test:u1' });

    client.setQueryData(CLEF_SOUVERAINE, { secret: SECRET });
    client.persist();

    expect(client.getQueryData(CLEF_SOUVERAINE)).toEqual({ secret: SECRET });
  });

  test('un rechargement ne la restaure pas — elle n’a jamais été écrite', () => {
    const storage = fakeStorage();
    const avant = createAppQueryClient({ storage, buster: '0.0.0-test:u1' });
    avant.setQueryData(['conversations'], [{ id: 'c-1' }]);
    avant.setQueryData(CLEF_SOUVERAINE, { secret: SECRET });
    avant.persist();

    const apres = createAppQueryClient({ storage, buster: '0.0.0-test:u1' });
    expect(apres.getQueryData(CLEF_SOUVERAINE)).toBeUndefined();
    // Et le reste du cache a bien survécu : la garde est CIBLÉE, pas générale.
    expect(apres.getQueryData(['conversations'])).toEqual([{ id: 'c-1' }]);
  });

  test('buster différent ⇒ undefined ET l’entrée est purgée', () => {
    const storage = fakeStorage();
    const a = createAppQueryClient({ storage, buster: '0.0.0-test:u1' });
    a.setQueryData(['conversations'], [{ id: 'c-1' }]);
    a.persist();

    const b = createAppQueryClient({ storage, buster: '0.0.0-test:u2' });
    expect(b.getQueryData(['conversations'])).toBeUndefined();
    expect(storage.raw.has('meeshy.query-cache')).toBe(false);
  });

  /**
   * `CACHE_SCHEMA` (#6195) — un cache écrit sous le buster de la VERSION
   * PRÉCÉDENTE de schéma (la FORME de `['conversations']` a changé : tableau
   * → `InfiniteData`) est PURGÉ, jamais hydraté ; sous le buster COURANT, il
   * l'est. Le buster composé réel (`currentBuster`, non exporté) place
   * `CACHE_SCHEMA` entre la version applicative et l'identité — ce témoin
   * fixe la même forme pour rester vrai quel que soit son emplacement exact,
   * tant que le SCHÉMA fait partie du buster.
   */
  test('CACHE_SCHEMA bumpé ⇒ un cache de l’ancien schéma est purgé, du courant est hydraté', () => {
    const previousSchema = CACHE_SCHEMA - 1;
    const storage = fakeStorage();
    const stale = createAppQueryClient({ storage, buster: `0.0.0-test:${previousSchema}:u1` });
    stale.setQueryData(['conversations'], { pages: [{ conversations: [{ id: 'c-1' }] }], pageParams: ['seed'] });
    stale.persist();

    const afterBump = createAppQueryClient({ storage, buster: `0.0.0-test:${CACHE_SCHEMA}:u1` });
    expect(afterBump.getQueryData(['conversations'])).toBeUndefined();
    expect(storage.raw.has('meeshy.query-cache')).toBe(false);

    afterBump.setQueryData(['conversations'], { pages: [{ conversations: [{ id: 'c-2' }] }], pageParams: ['seed'] });
    afterBump.persist();
    const reloaded = createAppQueryClient({ storage, buster: `0.0.0-test:${CACHE_SCHEMA}:u1` });
    expect(reloaded.getQueryData(['conversations'])).toEqual({
      pages: [{ conversations: [{ id: 'c-2' }] }],
      pageParams: ['seed'],
    });
  });

  test('JSON corrompu ⇒ undefined, aucune exception', () => {
    const storage = fakeStorage();
    storage.setItem('meeshy.query-cache', '{ pas du json');
    expect(() => createAppQueryClient({ storage, buster: '0.0.0-test:u1' })).not.toThrow();
    const client = createAppQueryClient({ storage, buster: '0.0.0-test:u1' });
    expect(client.getQueryData(['conversations'])).toBeUndefined();
  });
});

describe('la session purge le cache', () => {
  test('clearSession() sur le magasin injecté ⇒ getQueryData undefined et le storage ne porte plus meeshy.query-cache', () => {
    const storage = fakeStorage();
    const session = createSessionStore({ storage: fakeStorage() });
    session.getState().establish({
      user: { id: 'u-1', username: 'ada' },
      token: 'jwt',
      sessionToken: 'sess',
      expiresIn: 86_400,
    });

    const client = createAppQueryClient({ storage, buster: '0.0.0-test:u-1', session });
    client.setQueryData(['conversations'], [{ id: 'c-1' }]);
    client.persist();
    expect(storage.raw.has('meeshy.query-cache')).toBe(true);

    session.getState().clearSession();

    expect(client.getQueryData(['conversations'])).toBeUndefined();
    expect(storage.raw.has('meeshy.query-cache')).toBe(false);
  });
});

/**
 * LA MISE À JOUR DE L'APPLICATION JETTE LE CACHE PERSISTÉ — et il ne revient
 * pas (#6936).
 *
 * `discardPersisted()` est appelée juste avant le rechargement qui charge la
 * version neuve. Le piège qu'elle doit fermer n'est pas l'effacement (une
 * ligne) mais la RÉÉCRITURE : `persist` est câblée sur `pagehide` et
 * `visibilitychange`, tous deux déclenchés PAR ce rechargement. Une purge qui
 * n'arrête pas la persistance réécrit la même clé, avec le même `buster`,
 * dans la milliseconde qui suit — elle n'a rien purgé.
 *
 * Et elle ne touche QUE cette clé : la session, les préférences et les
 * brouillons vivent dans le même `localStorage` et doivent survivre à la mise
 * à jour (« en préservant la session », directive porteur 2026-09-17).
 */
describe('la mise à jour de l’application jette le cache persisté, et la session survit', () => {
  test('la clé du cache part, les autres clés du stockage restent', () => {
    const storage = fakeStorage();
    storage.setItem('meeshy.session', '{"user":"ada"}');
    storage.setItem('meeshy.draft.u_a.c1', 'brouillon');

    const client = createAppQueryClient({ storage, buster: '0.0.0-test:u-1' });
    client.setQueryData(['conversations'], [{ id: 'c-1' }]);
    client.persist();
    expect(storage.raw.has('meeshy.query-cache')).toBe(true);

    client.discardPersisted();

    expect(storage.raw.has('meeshy.query-cache')).toBe(false);
    expect(storage.getItem('meeshy.session')).toBe('{"user":"ada"}');
    expect(storage.getItem('meeshy.draft.u_a.c1')).toBe('brouillon');
  });

  /* `persist()` EST ce que le `pagehide` du rechargement appelle
     (`createAppQueryClient` § AUTO-PERSISTANCE) : l'appeler directement teste
     la même porte sans dépendre d'un DOM. */
  test('après elle, plus aucun `persist()` ne réécrit la clé — c’est ce que le `pagehide` du rechargement déclenche', () => {
    const storage = fakeStorage();
    const client = createAppQueryClient({ storage, buster: '0.0.0-test:u-1' });
    client.setQueryData(['conversations'], [{ id: 'c-1' }]);
    client.persist();

    client.discardPersisted();
    client.persist();

    expect(storage.raw.has('meeshy.query-cache')).toBe(false);
  });

  test('une écriture de cache APRÈS elle ne rallume pas la persistance', async () => {
    const storage = fakeStorage();
    const client = createAppQueryClient({ storage, buster: '0.0.0-test:u-1' });

    client.discardPersisted();
    client.setQueryData(['conversations'], [{ id: 'c-2' }]);
    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(storage.raw.has('meeshy.query-cache')).toBe(false);
  });

  test('le cache EN MÉMOIRE reste servi — la page qui part ne se vide pas à l’écran', () => {
    const storage = fakeStorage();
    const client = createAppQueryClient({ storage, buster: '0.0.0-test:u-1' });
    client.setQueryData(['conversations'], [{ id: 'c-1' }]);

    client.discardPersisted();

    expect(client.getQueryData(['conversations'])).toEqual([{ id: 'c-1' }]);
  });

  test('la version NEUVE ne relit rien — le cache jeté ne se réhydrate pas', () => {
    const storage = fakeStorage();
    const ancienne = createAppQueryClient({ storage, buster: '0.0.0-test:u-1' });
    ancienne.setQueryData(['conversations'], [{ id: 'c-1' }]);
    ancienne.persist();
    ancienne.discardPersisted();

    const neuve = createAppQueryClient({ storage, buster: '0.0.0-test:u-1' });

    expect(neuve.getQueryData(['conversations'])).toBeUndefined();
  });
});

/**
 * REVUE-CORRECTION (#5650) — CE QUI PART À CÔTÉ DU CACHE DE REQUÊTES.
 *
 * Le `buster` par identité protège le cache TanStack et son entrée de
 * `localStorage`. Mais câbler la passerelle a fait entrer, pour la PREMIÈRE
 * fois, des réponses `/api/**` dans le `runtimeCaching` du service worker
 * (`vite.config.ts` : seau `api`, NetworkFirst, 200 entrées, sept jours) et
 * des médias dans le seau `medias` — sur le DISQUE, et resservis dès que le
 * réseau dépasse trois secondes ou tombe. Sans cette purge, la liste du
 * compte PRÉCÉDENT restait servable au compte suivant sur le même appareil.
 *
 * Le témoin exige aussi que le seau de PRÉCACHE survive : purger le shell à
 * chaque déconnexion referait payer 400 Ko au lecteur pour rien.
 */
describe('la session purge AUSSI les seaux du service worker (D-6)', () => {
  function fakeCaches(names: readonly string[]) {
    const remaining = new Set(names);
    return {
      remaining,
      keys: async () => [...remaining],
      delete: async (name: string) => remaining.delete(name),
    };
  }

  test('changement d’identité ⇒ les seaux `api` et `medias` sont supprimés, le précache SURVIT', async () => {
    const storage = fakeStorage();
    const session = createSessionStore({ storage: fakeStorage() });
    session.getState().establish({
      user: { id: 'u-1', username: 'ada' },
      token: 'jwt',
      sessionToken: 'sess',
      expiresIn: 86_400,
    });
    const cacheStorage = fakeCaches(['api', 'medias', 'workbox-precache-v2-https://x/']);

    createAppQueryClient({ storage, buster: '0.0.0-test:u-1', session, cacheStorage });
    session.getState().clearSession();
    await Promise.resolve();
    await Promise.resolve();

    expect([...cacheStorage.remaining]).toEqual(['workbox-precache-v2-https://x/']);
  });

  test('purgeReaderCaches sans CacheStorage (coque, Node) ⇒ aucune exception', () => {
    expect(() => purgeReaderCaches(undefined)).not.toThrow();
  });
});

/**
 * « MES RÉACTIONS » SURVIT SUR LA MÊME HORLOGE QUE LE CACHE DES MESSAGES
 * (revue #5814, défaut majeur 5, BLOQUANT) — reproduit exactement la
 * séquence mesurée (`recette4.mjs`) : sans ce correctif, un rechargement
 * restaurait `reactionSummary` (persisté avec le reste du cache) mais PAS
 * `reactionStore.mine` (magasin séparé, jamais persisté) — un compte de
 * réactions affiché sans que « la vôtre » ne le reconnaisse plus, doublant
 * au tap suivant et rendant le RETRAIT définitivement inerte (loi 4).
 *
 * `reactionStore` est un singleton de MODULE (comme en production) — chaque
 * test le remet à `{}` pour ne pas polluer le suivant.
 */
describe('« mes réactions » (reactionStore) survit au rechargement, SUR LA MÊME HORLOGE que le cache (revue #5814, défaut majeur 5)', () => {
  afterEach(() => {
    reactionStore.setState({ mine: {} });
  });

  test('même storage, même buster ⇒ reactionStore.mine est restauré APRÈS un rechargement simulé', () => {
    const storage = fakeStorage();
    const a = createAppQueryClient({ storage, buster: '0.0.0-test:u1' });
    reactionStore.getState().add('m1', '😂');
    a.persist();

    // « rechargement » : un NOUVEAU client, sur le MÊME storage/buster —
    // le module `reactionStore` est un singleton, donc un vrai rechargement
    // de page le remettrait à `{}` avant l'hydratation ; on simule cette
    // remise à zéro ici pour isoler ce que l'hydratation restaure.
    reactionStore.setState({ mine: {} });
    expect(reactionStore.getState().mine.m1).toBeUndefined();

    createAppQueryClient({ storage, buster: '0.0.0-test:u1' });

    expect(reactionStore.getState().mine.m1).toEqual(['😂']);
  });

  test('buster différent (déconnexion/reconnexion) ⇒ reactionStore.mine ne fuit PAS vers la nouvelle identité (D-6)', () => {
    const storage = fakeStorage();
    createAppQueryClient({ storage, buster: '0.0.0-test:u1' });
    reactionStore.getState().add('m1', '😂');
    storage.setItem(
      'meeshy.query-cache',
      JSON.stringify({ buster: '0.0.0-test:u1', state: { queries: [], mutations: [] }, reactions: { m1: ['😂'] } }),
    );

    reactionStore.setState({ mine: {} });
    createAppQueryClient({ storage, buster: '0.0.0-test:u2' });

    expect(reactionStore.getState().mine.m1).toBeUndefined();
  });

  test('un cache écrit AVANT ce correctif (sans `reactions`) ⇒ hydratation SANS exception, `mine` reste vide', () => {
    const storage = fakeStorage();
    storage.setItem('meeshy.query-cache', JSON.stringify({ buster: '0.0.0-test:u1', state: { queries: [], mutations: [] } }));

    expect(() => createAppQueryClient({ storage, buster: '0.0.0-test:u1' })).not.toThrow();
    expect(reactionStore.getState().mine).toEqual({});
  });

  test('changement d’identité ⇒ reactionStore.mine est vidé, même sans nouvelle réaction pour l’écraser', () => {
    const storage = fakeStorage();
    const session = createSessionStore({ storage: fakeStorage() });
    session.getState().establish({ user: { id: 'u-1', username: 'ada' }, token: 'jwt', sessionToken: 'sess', expiresIn: 86_400 });
    createAppQueryClient({ storage, buster: '0.0.0-test:u-1', session });
    reactionStore.getState().add('m1', '😂');
    expect(reactionStore.getState().mine.m1).toEqual(['😂']);

    session.getState().clearSession();

    expect(reactionStore.getState().mine.m1).toBeUndefined();
  });
});

/**
 * LE REGISTRE DES MÉDIAS ABSENTS (#7022) SURVIT AU CHANGEMENT DE COMPTE — LA
 * COUPURE D'ACCÈS (revue adversariale 2026-09-18, défaut REVUE_NON_JOUÉE §1).
 *
 * Scénario mesuré : A ouvre une publication dont un média lui est REFUSÉ
 * (403) → `noteMediaAbsent` grave la source absente, au niveau MODULE. A se
 * déconnecte, B se connecte dans le MÊME onglet (SPA, pas de rechargement) —
 * B, qui a le DROIT de voir ce média, hérite du verdict de A et voit « Média
 * indisponible » pour toute sa session. Le registre ne connaît que des
 * ÉCHECS DE CHARGEMENT, jamais une identité ; une source qui a échoué pour A
 * n'a RIEN prouvé sur ce que B peut voir.
 *
 * Le site est le MÊME que celui qui vide `reactionStore` ci-dessus : le
 * changement d'identité, dans `createAppQueryClient`. Deux registres de
 * MODULE, deux fuites SYMÉTRIQUES entre deux comptes du même navigateur.
 */
describe('changement d’identité ⇒ le registre des médias absents ne fuit PAS vers le compte suivant (#7022)', () => {
  afterEach(() => {
    resetAbsentMedia();
  });

  test('un média gravé absent pour un compte redevient demandable pour le compte SUIVANT', () => {
    const storage = fakeStorage();
    const session = createSessionStore({ storage: fakeStorage() });
    session.getState().establish({ user: { id: 'u-1', username: 'ada' }, token: 'jwt', sessionToken: 'sess', expiresIn: 86_400 });
    createAppQueryClient({ storage, buster: '0.0.0-test:u-1', session });

    const src = 'https://gate.meeshy.me/api/v1/attachments/file/2026%2F09%2Frestreint-a-ada.jpg';
    noteMediaAbsent(src);
    expect(isMediaAbsent(src)).toBe(true);

    session.getState().establish({ user: { id: 'u-2', username: 'bob' }, token: 'jwt2', sessionToken: 'sess2', expiresIn: 86_400 });

    expect(isMediaAbsent(src)).toBe(false);
  });
});
