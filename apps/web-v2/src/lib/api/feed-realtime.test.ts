import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import { FEED_QUERY_KEY } from './feed';
import type { FeedInfiniteData, FeedPost } from './feed-pages';
import { FEED_NEW_COUNT_KEY } from './feed-new-count';
import { applyPostCreated, applyPostDeleted, applyPostUpdated } from './feed-realtime';
import { postQueryKey } from './publication-detail';

/**
 * **LE FLUX APPREND CE QUI ARRIVE** (#7182) — `post:created`, `post:updated`
 * et `post:deleted`, les trois événements de publication que web-v2 ne
 * consommait PAS.
 *
 * ## LA MESURE QUI OUVRE LE LOT
 *
 * `socket.ts` écoute trente événements. `post:liked`, `post:unliked`,
 * `post:bookmarked`, les quatre `story:*` et `comment:added` en font partie ;
 * les trois ci-dessus, non. La passerelle les diffuse pourtant aux amis depuis
 * toujours (`SocialEventsHandler.ts:322`), les types sont déclarés
 * (`packages/shared/types/post.ts:282`), les constantes aussi
 * (`event-names.ts:398`). **Rien ne manquait au serveur : personne n'écoutait.**
 *
 * Conséquence produit, et c'est elle qu'on corrige : une publication d'un ami
 * n'apparaissait jamais sans rechargement, une publication modifiée gardait
 * son ancien texte, une publication supprimée restait affichée.
 *
 * ## LA DOCTRINE EST CELLE D'iOS, PAS UNE INVENTION
 *
 * `FeedViewModel.swift:1464-1490` la porte en trois temps, et chacun donne ici
 * son témoin :
 *
 * 1. **réconcilier par cmid** — l'auteur a inséré sa publication optimiste
 *    sous le `clientMutationId` comme id ; l'écho serveur la REMPLACE en place
 *    au lieu d'insérer un doublon ;
 * 2. **sinon insérer en tête et compter** (`posts.insert(at: 0)`,
 *    `newPostsCount += 1`) — le compte alimente la bannière
 *    « N nouveaux posts » (`FeedView.swift:1200-1235`) ;
 * 3. **préserver l'état local du lecteur** à travers un remplacement
 *    (« Preserve local-only state (isLiked) across the update ») : `isLikedByMe`
 *    et `isBookmarkedByMe` se lisent PAR LECTEUR, et l'événement diffusé à tous
 *    ne peut pas les porter justes pour chacun.
 *
 * ## LA CHARGE TELLE QUE LE FIL L'ÉMET
 *
 * `PostCreatedEventData.post` est un `Post` du paquet partagé ; le cache tient
 * des `FeedPost`. Les deux ne coïncident pas au type près — c'est la frontière
 * que la garde de forme franchit côté production. Le témoin la franchit par un
 * cast NOMMÉ plutôt qu'en fabriquant une troisième forme qui ne serait celle
 * de personne (même parti que `realtime-apply-comment.test.ts`, #7151).
 */

const post = (patch: Partial<FeedPost> = {}): FeedPost =>
  ({
    id: 'p-serveur',
    type: 'POST',
    createdAt: '2026-09-20T10:00:00.000Z',
    content: 'Une publication venue d’ailleurs',
    author: { id: 'u-autre', displayName: 'Noa Berger', username: 'noa' },
    ...patch,
  }) as FeedPost;

const cacheAvec = (posts: readonly FeedPost[]): FeedInfiniteData =>
  ({
    pages: [{ posts, pagination: { limit: 20, hasMore: false, nextCursor: null } }],
    pageParams: [undefined],
  }) as FeedInfiniteData;

const clientAvec = (posts: readonly FeedPost[]): QueryClient => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(FEED_QUERY_KEY, cacheAvec(posts));
  return queryClient;
};

const cartes = (queryClient: QueryClient): readonly FeedPost[] =>
  queryClient.getQueryData<FeedInfiniteData>(FEED_QUERY_KEY)?.pages.flatMap((page) => page.posts) ?? [];

const compte = (queryClient: QueryClient): number => queryClient.getQueryData<number>(FEED_NEW_COUNT_KEY) ?? 0;

describe('une charge MALFORMÉE ne change rien, et ne lève pas', () => {
  /**
   * LA GARDE SE MESURE PAR SON EFFET, pas par une fonction exportée : un
   * événement inattendu ne doit ni casser l'écran ni entrer dans le cache.
   * Chaque cas retire UNE chose, pour que le verdict désigne ce qui manque —
   * un id absent ou vide rendrait la carte indédoublonnable ET irretirable.
   */
  test('`post:created` ignore ce qui n’est pas sa charge', () => {
    const queryClient = clientAvec([post({ id: 'p1' })]);

    for (const charge of [null, {}, { post: null }, { post: { id: 42 } }, { post: { id: '' } }]) {
      expect(() => applyPostCreated(queryClient, charge)).not.toThrow();
    }

    expect(cartes(queryClient).map((p) => p.id)).toEqual(['p1']);
    expect(compte(queryClient)).toBe(0);
  });

  test('`post:updated` et `post:deleted` ignorent les leurs', () => {
    const queryClient = clientAvec([post({ id: 'p1', content: 'intact' })]);

    for (const charge of [null, {}, { postId: 'p1' }, { post: { id: 7 } }]) {
      expect(() => applyPostUpdated(queryClient, charge)).not.toThrow();
    }
    for (const charge of [null, {}, { postId: 7 }, { post: post() }]) {
      expect(() => applyPostDeleted(queryClient, charge)).not.toThrow();
    }

    expect(cartes(queryClient).map((p) => p.id)).toEqual(['p1']);
    expect(cartes(queryClient)[0]?.content).toBe('intact');
  });
});

describe('`post:created` — la publication d’un ami ENTRE dans le fil', () => {
  test('elle se pose en TÊTE, devant ce qui était là', () => {
    const queryClient = clientAvec([post({ id: 'p-ancien', content: 'déjà là' })]);

    applyPostCreated(queryClient, { post: post() });

    expect(cartes(queryClient).map((p) => p.id)).toEqual(['p-serveur', 'p-ancien']);
  });

  /** L'IDEMPOTENCE — un rejeu (reconnexion, double abonnement) dédoublerait la
      carte ET ferait dériver le compteur. Le dépôt a déjà payé ce défaut sur le
      cœur (`8893402442`). */
  test('deux fois le même id n’insèrent qu’une carte', () => {
    const queryClient = clientAvec([]);
    const rejeu = { post: post() };

    applyPostCreated(queryClient, rejeu);
    applyPostCreated(queryClient, rejeu);

    expect(cartes(queryClient).map((p) => p.id)).toEqual(['p-serveur']);
    expect(compte(queryClient)).toBe(1);
  });

  /**
   * SON PROPRE ENVOI — l'auteur reçoit son écho. La carte optimiste porte le
   * `cmid` comme id (U1 ST3, `FeedViewModel.swift:1475`) ; l'écho le rapporte,
   * et la carte est REMPLACÉE en place.
   */
  test('la carte optimiste de l’auteur est RÉCONCILIÉE, pas dédoublée', () => {
    const queryClient = clientAvec([post({ id: 'cmid_abc', content: 'écrit à l’instant', isLikedByMe: true })]);

    applyPostCreated(queryClient, {
      post: post({ id: 'p-serveur', content: 'écrit à l’instant' }),
      clientMutationId: 'cmid_abc',
    });

    const vues = cartes(queryClient);
    expect(vues.map((p) => p.id)).toEqual(['p-serveur']);
    /* L'état du LECTEUR survit à l'échange d'id — il ne vient pas du serveur. */
    expect(vues[0]?.isLikedByMe).toBe(true);
  });

  /**
   * ET LE COMPTEUR NE BOUGE PAS POUR SA PROPRE PUBLICATION : la bannière
   * annonce ce qu'on n'a PAS encore vu. Annoncer « 1 nouveau post » à qui
   * vient de l'écrire serait un mensonge poli.
   */
  test('la réconciliation ne compte PAS un nouveau post', () => {
    const queryClient = clientAvec([post({ id: 'cmid_abc' })]);

    applyPostCreated(queryClient, { post: post(), clientMutationId: 'cmid_abc' });

    expect(compte(queryClient)).toBe(0);
  });

  test('le compteur suit les publications des AUTRES', () => {
    const queryClient = clientAvec([]);

    applyPostCreated(queryClient, { post: post({ id: 'p1' }) });
    applyPostCreated(queryClient, { post: post({ id: 'p2' }) });

    expect(compte(queryClient)).toBe(2);
  });

  /**
   * UN `cmid` INCONNU N'ÉCRASE RIEN : c'est l'écho d'un AUTRE client. La carte
   * s'insère normalement.
   */
  test('un `clientMutationId` inconnu insère, il n’écrase aucune carte', () => {
    const queryClient = clientAvec([post({ id: 'cmid_moi', content: 'le mien' })]);

    applyPostCreated(queryClient, { post: post({ id: 'p-autre' }), clientMutationId: 'cmid_quelquun-dautre' });

    expect(cartes(queryClient).map((p) => p.id)).toEqual(['p-autre', 'cmid_moi']);
  });

  /** Un cache absent n'est pas une erreur — et ne se FABRIQUE pas : un fil né
      d'un seul événement afficherait une page qui n'a jamais été servie. */
  test('sans fil en cache, il ne lève pas et n’invente pas de page', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    expect(() => applyPostCreated(queryClient, { post: post() })).not.toThrow();
    expect(queryClient.getQueryData(FEED_QUERY_KEY)).toBeUndefined();
  });
});

describe('`post:updated` — le texte modifié REMPLACE l’ancien', () => {
  test('la carte est remplacée en place, à son rang', () => {
    const queryClient = clientAvec([post({ id: 'p1' }), post({ id: 'p2', content: 'avant' })]);

    applyPostUpdated(queryClient, { post: post({ id: 'p2', content: 'après' }) });

    const vues = cartes(queryClient);
    expect(vues.map((p) => p.id)).toEqual(['p1', 'p2']);
    expect(vues[1]?.content).toBe('après');
  });

  /**
   * L'ÉTAT DU LECTEUR SURVIT — `isLikedByMe` / `isBookmarkedByMe` se lisent PAR
   * LECTEUR, et un événement diffusé à tous ne peut pas les porter justes pour
   * chacun. Sans cette préservation, corriger une faute de frappe dé-remplirait
   * le cœur de tous ceux qui avaient aimé. Miroir explicite d'iOS
   * (« Preserve local-only state (isLiked) across the update »).
   */
  test('le cœur et le signet DU LECTEUR ne se vident pas sous ses yeux', () => {
    const queryClient = clientAvec([
      post({ id: 'p1', isLikedByMe: true, isBookmarkedByMe: true }),
    ]);

    applyPostUpdated(queryClient, { post: post({ id: 'p1', content: 'corrigé' }) });

    const vue = cartes(queryClient)[0];
    expect(vue?.isLikedByMe).toBe(true);
    expect(vue?.isBookmarkedByMe).toBe(true);
  });

  /** MODIFIER N'EST PAS CRÉER : une publication hors du fil (hors audience,
      jamais chargée) ne s'y invite pas par sa modification. */
  test('une publication absente du fil n’y est PAS insérée', () => {
    const queryClient = clientAvec([post({ id: 'p1' })]);

    applyPostUpdated(queryClient, { post: post({ id: 'p-inconnu' }) });

    expect(cartes(queryClient).map((p) => p.id)).toEqual(['p1']);
  });

  /** LE DÉTAIL SUIT LE FIL — la même publication ne peut pas porter deux
      textes selon l'écran qui la montre (doctrine de `performPostGesture`). */
  test('le cache du DÉTAIL suit', () => {
    const queryClient = clientAvec([post({ id: 'p1' })]);
    queryClient.setQueryData(postQueryKey('p1'), post({ id: 'p1', content: 'avant', isLikedByMe: true }));

    applyPostUpdated(queryClient, { post: post({ id: 'p1', content: 'après' }) });

    const detail = queryClient.getQueryData<FeedPost>(postQueryKey('p1'));
    expect(detail?.content).toBe('après');
    expect(detail?.isLikedByMe).toBe(true);
  });
});

describe('`post:deleted` — la publication supprimée DISPARAÎT', () => {
  test('elle quitte le fil', () => {
    const queryClient = clientAvec([post({ id: 'p1' }), post({ id: 'p2' })]);

    applyPostDeleted(queryClient, { postId: 'p1' });

    expect(cartes(queryClient).map((p) => p.id)).toEqual(['p2']);
  });

  test('elle quitte aussi le DÉTAIL', () => {
    const queryClient = clientAvec([post({ id: 'p1' })]);
    queryClient.setQueryData(postQueryKey('p1'), post({ id: 'p1' }));

    applyPostDeleted(queryClient, { postId: 'p1' });

    expect(queryClient.getQueryData(postQueryKey('p1'))).toBeUndefined();
  });

  test('un id inconnu ne retire rien', () => {
    const queryClient = clientAvec([post({ id: 'p1' })]);

    applyPostDeleted(queryClient, { postId: 'p-inconnu' });

    expect(cartes(queryClient).map((p) => p.id)).toEqual(['p1']);
  });
});
