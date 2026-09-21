import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import { FEED_QUERY_KEY } from './feed';
import type { FeedInfiniteData, FeedPost } from './feed-pages';
import type { ApiResult, HttpRequest, HttpTransport } from './http';
import {
  COMMENT_MAX_LENGTH,
  commentsQueryKey,
  performComment,
  type CommentInfiniteData,
  type PostComment,
} from './publication-comments';
import { postQueryKey } from './publication-detail';
import { reelsQueryKey } from './reels';
import {
  COMMENT_DELETE_FAILED_MESSAGE,
  COMMENT_EDIT_FAILED_MESSAGE,
  COMMENT_GESTURE_PENDING_MESSAGE,
  COMMENT_GESTURE_UNCONFIRMED_MESSAGE,
  COMMENT_LIKE_FAILED_MESSAGE,
  performCommentDelete,
  performCommentEdit,
  performCommentLike,
  type CommentGestureDeps,
} from './comment-gestures';

/**
 * LES GESTES D'UNE RANGÉE DE COMMENTAIRE (#7135, première tranche de #7118) —
 * même forme que `feed-gestures.test.ts` : le cache bouge AVANT la réponse, et
 * un refus PERMANENT le remet EXACTEMENT où il était.
 *
 * Ce que ces témoins mesurent et qu'aucun rendu ne mesure : la VALEUR de
 * retour du cache après rollback. Un rollback « à peu près » — un compteur
 * remis à 0, une rangée réinsérée en tête — passerait tous les témoins de
 * composant et se verrait au premier usage.
 */

const comment = (partial: Partial<PostComment> = {}): PostComment => ({
  id: 'cm1',
  content: 'Superbe photo',
  createdAt: '2026-09-19T11:40:00.000Z',
  author: { id: 'u-noa', displayName: 'Noa Berger', username: 'noa' },
  likeCount: 0,
  ...partial,
});

const seeded = (pages: readonly (readonly PostComment[])[]): QueryClient => {
  const queryClient = new QueryClient();
  const data: CommentInfiniteData = {
    pages: pages.map((comments, i) => ({
      comments,
      pagination: { limit: 20, hasMore: i < pages.length - 1, nextCursor: i < pages.length - 1 ? `c${i}` : null },
    })),
    pageParams: pages.map((_, i) => (i === 0 ? undefined : `c${i - 1}`)),
  };
  queryClient.setQueryData(commentsQueryKey('p1'), data);
  return queryClient;
};

const rows = (queryClient: QueryClient): readonly PostComment[] =>
  (queryClient.getQueryData<CommentInfiniteData>(commentsQueryKey('p1'))?.pages ?? []).flatMap((p) => p.comments);

const cached = (queryClient: QueryClient, id = 'cm1'): PostComment | undefined => rows(queryClient).find((c) => c.id === id);

/** Un transport qui ENREGISTRE ce qu'on lui demande — `scripted` de `feed-gestures.test.ts`. */
const scripted = (respond: (req: HttpRequest) => Promise<ApiResult<unknown>>) => {
  const requests: HttpRequest[] = [];
  const transport = {
    request: (req: HttpRequest) => {
      requests.push(req);
      return respond(req);
    },
  } as unknown as HttpTransport;
  return { requests, transport };
};

const gatewayDeps = (queryClient: QueryClient, transport: HttpTransport): CommentGestureDeps => ({
  source: 'gateway',
  transport,
  queryClient,
});

const MUTATION_ID = /^cmid_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * LE LECTEUR EST HORS LIGNE PENDANT CET APPEL — et il le redevient en ligne
 * après. `comment.gesture.pending` NOMME le réseau : le servir sur un 5xx
 * envoie l'utilisateur vérifier son wifi alors que sa connexion est bonne
 * (défaut majeur 4). Le témoin doit donc pouvoir poser les DEUX rangs.
 */
const horsLigne = async <T>(run: () => Promise<T>): Promise<T> => {
  const descriptor = Object.getOwnPropertyDescriptor(navigator, 'onLine');
  Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
  try {
    return await run();
  } finally {
    if (descriptor === undefined) delete (navigator as { onLine?: boolean }).onLine;
    else Object.defineProperty(navigator, 'onLine', descriptor);
  }
};

describe('performCommentLike — le compteur bouge AVANT la réponse, et REVIENT au refus', () => {
  test('le cœur et le compte basculent avant toute réponse réseau', async () => {
    const queryClient = seeded([[comment({ likeCount: 3 })]]);
    let release: (r: ApiResult<unknown>) => void = () => undefined;
    const { transport } = scripted(() => new Promise((resolve) => (release = resolve)));

    const pending = performCommentLike({ postId: 'p1', commentId: 'cm1', on: true, deps: gatewayDeps(queryClient, transport) });
    expect(cached(queryClient)?.isLikedByMe).toBe(true);
    expect(cached(queryClient)?.likeCount).toBe(4);

    release({ ok: true, data: { liked: true, likeCount: 4 } });
    expect(await pending).toEqual({ ok: true });
  });

  test('aimer ⇒ `POST /api/v1/posts/:postId/comments/:commentId/like`', async () => {
    const queryClient = seeded([[comment()]]);
    const { requests, transport } = scripted(async () => ({ ok: true, data: { liked: true, likeCount: 1 } }));

    await performCommentLike({ postId: 'p1', commentId: 'cm1', on: true, deps: gatewayDeps(queryClient, transport) });

    expect(requests).toHaveLength(1);
    expect(requests[0]?.method).toBe('POST');
    expect(requests[0]?.path).toBe('/api/v1/posts/p1/comments/cm1/like');
  });

  test('un commentaire DÉJÀ aimé ⇒ `DELETE …/like`, cœur vide, compte −1', async () => {
    const queryClient = seeded([[comment({ isLikedByMe: true, likeCount: 5 })]]);
    const { requests, transport } = scripted(async () => ({ ok: true, data: { liked: false, likeCount: 4 } }));

    await performCommentLike({ postId: 'p1', commentId: 'cm1', on: false, deps: gatewayDeps(queryClient, transport) });

    expect(requests[0]?.method).toBe('DELETE');
    expect(cached(queryClient)?.isLikedByMe).toBe(false);
    expect(cached(queryClient)?.likeCount).toBe(4);
  });

  /**
   * **LE VERBE SUIT LA DIRECTION DEMANDÉE, PAS L'ÉTAT DU CACHE** (défaut
   * majeur 2 de la revue-correction). `performCommentLike` relisait
   * `site.comment.isLikedByMe` AU MOMENT DE L'APPEL. Tant que le rejeu ne
   * survenait qu'après un rollback, les deux lectures coïncidaient — et c'est
   * exactement pourquoi aucun témoin ne pouvait le voir. Dès que le rejeu
   * porte sur un optimiste RESTÉ POSÉ (ce que l'issue passagère fait
   * maintenant, ce que l'écho socket de #7118 et la file #5868 feront
   * encore), le cache dit « déjà aimé » et l'ancienne règle envoyait un
   * `DELETE` là où le lecteur demandait un `POST`.
   *
   * LE TÉMOIN SE POSE DONC SUR UN CACHE DÉJÀ BASCULÉ — sur un cache au repos,
   * la règle juste et la règle fausse rendent le même verbe.
   */
  test('une requête REJOUÉE sur un optimiste NON défait renvoie le MÊME verbe', async () => {
    const queryClient = seeded([[comment({ isLikedByMe: true, likeCount: 4 })]]);
    const { requests, transport } = scripted(async () => ({ ok: true, data: { liked: true, likeCount: 4 } }));

    await performCommentLike({ postId: 'p1', commentId: 'cm1', on: true, deps: gatewayDeps(queryClient, transport) });

    expect(requests[0]?.method).toBe('POST');
  });

  /**
   * **L'ÉCRITURE OPTIMISTE EST IDEMPOTENTE, PAS DIFFÉRENTIELLE** (défaut
   * majeur 1 de la seconde revue-correction). Le témoin du VERBE ci-dessus
   * frôle ce défaut sans le voir : il mesure ce que le rejeu ENVOIE, jamais ce
   * que le rejeu ÉCRIT. `liked()` / `unliked()` comptent en DELTA
   * (`countOf(comment.likeCount) ± 1`) sur la rangée TELLE QU'ELLE EST dans le
   * cache ; tant que le rejeu ne survenait qu'après un rollback, la rangée
   * était revenue à son état d'avant et le delta tombait juste. Depuis que
   * l'optimiste du cœur RESTE POSÉ sur une issue passagère (doctrine du geste
   * réversible), le second tap part d'un compte DÉJÀ incrémenté : trois rejeux
   * sur une passerelle qui bat de l'aile affichaient « 6 » là où la passerelle
   * en avait « 3 ».
   *
   * L'auto-guérison par `servedLikeCount` ne rattrape rien ici : elle suppose
   * une réponse SERVIE, et il n'y en a pas — c'est précisément le cas du rejeu.
   *
   * LE TÉMOIN SE POSE DONC SUR LE CACHE, seule surface qui le dise, et sur un
   * rejeu qui ÉCHOUE encore : c'est le rang où la règle juste et la règle
   * fausse divergent.
   */
  test('deux rejeux d’un cœur NON confirmé laissent le compteur à +1, jamais +2', async () => {
    const queryClient = seeded([[comment({ isLikedByMe: false, likeCount: 3 })]]);
    const { requests, transport } = scripted(async () => ({ ok: false, status: 503, error: 'Service Unavailable' }));
    const request = { postId: 'p1', commentId: 'cm1', on: true, deps: gatewayDeps(queryClient, transport) } as const;

    expect(await performCommentLike(request)).toEqual({
      ok: false,
      message: COMMENT_GESTURE_UNCONFIRMED_MESSAGE,
      issue: 'unconfirmed',
    });
    expect(cached(queryClient)?.likeCount).toBe(4);

    await performCommentLike(request);

    expect(cached(queryClient)?.likeCount).toBe(4);
    expect(cached(queryClient)?.isLikedByMe).toBe(true);
    /* LE REJEU PART BIEN — l'idempotence porte sur l'ÉCRITURE, pas sur
       l'appel : renoncer à appeler ferait d'un « Réessayer » un bouton inerte
       (loi 4). */
    expect(requests).toHaveLength(2);
  });

  /* LE SENS INVERSE, et il fausse le compteur dans l'AUTRE direction : le
     `Math.max(0, …)` d'`unliked` fige à 0 au lieu de dériver, si bien qu'un
     compte servi à 1 tombait à 0 puis y restait — la même règle différentielle,
     le même défaut, invisible au témoin jumeau. */
  test('deux rejeux d’un retrait NON confirmé laissent le compteur à −1, jamais −2', async () => {
    const queryClient = seeded([[comment({ isLikedByMe: true, likeCount: 3 })]]);
    const { transport } = scripted(async () => ({ ok: false, status: 503, error: 'Service Unavailable' }));
    const request = { postId: 'p1', commentId: 'cm1', on: false, deps: gatewayDeps(queryClient, transport) } as const;

    await performCommentLike(request);
    expect(cached(queryClient)?.likeCount).toBe(2);

    await performCommentLike(request);

    expect(cached(queryClient)?.likeCount).toBe(2);
    expect(cached(queryClient)?.isLikedByMe).toBe(false);
  });

  test('le `likeCount` SERVI fait foi — il remplace l’estimation optimiste', async () => {
    const queryClient = seeded([[comment({ likeCount: 3 })]]);
    const { transport } = scripted(async () => ({ ok: true, data: { liked: true, likeCount: 11 } }));

    await performCommentLike({ postId: 'p1', commentId: 'cm1', on: true, deps: gatewayDeps(queryClient, transport) });

    expect(cached(queryClient)?.likeCount).toBe(11);
  });

  /* `isLikedByMe: false` EXPLICITE — c'est ce que la passerelle sert
     (`PostCommentService.ts:471-483`), et le rollback doit rendre la rangée
     TELLE QU'ELLE ÉTAIT, pas une rangée « à peu près pareille ». */
  test('404 ⇒ le compteur REVIENT à sa valeur EXACTE, et l’échec est annoncé', async () => {
    const queryClient = seeded([[comment({ isLikedByMe: false, likeCount: 3 })]]);
    const { transport } = scripted(async () => ({ ok: false, status: 404, error: 'Comment not found' }));

    const result = await performCommentLike({ postId: 'p1', commentId: 'cm1', on: true, deps: gatewayDeps(queryClient, transport) });

    /* UN REFUS PERMANENT PORTE SA RAISON ET N'OFFRE PAS DE REJEU — `issue`
       est ce que la rangée lit pour choisir entre « Réessayer » et la cause
       (défaut majeur 1). Un 404 hors audience et un 403 hors auteur disent la
       même chose au lecteur : ce geste ne lui est pas ouvert. */
    expect(result).toEqual({
      ok: false,
      message: COMMENT_LIKE_FAILED_MESSAGE,
      issue: 'refused',
      reason: 'comment.refused.right',
    });
    expect(cached(queryClient)?.likeCount).toBe(3);
    expect(cached(queryClient)?.isLikedByMe).toBe(false);
  });

  /**
   * **LE PLAFOND DES CINQ RÉACTIONS SE NOMME** — un 409 `ConflictError` est un
   * refus permanent comme un autre pour le transport, mais c'est le SEUL que
   * le lecteur ne puisse pas deviner : rien à l'écran ne dit qu'il vient
   * d'atteindre une limite. « Réessayer » y rendait la même alerte
   * indéfiniment.
   */
  test('409 ⇒ le refus NOMME le plafond des cinq réactions, et n’offre aucun rejeu', async () => {
    const queryClient = seeded([[comment({ likeCount: 2 })]]);
    const { transport } = scripted(async () => ({ ok: false, status: 409, error: 'Reaction limit reached' }));

    const result = await performCommentLike({ postId: 'p1', commentId: 'cm1', on: true, deps: gatewayDeps(queryClient, transport) });

    expect(result).toEqual({
      ok: false,
      message: COMMENT_LIKE_FAILED_MESSAGE,
      issue: 'refused',
      reason: 'comment.like.limit',
    });
  });

  test('401 ⇒ le refus dit la SESSION, pas un échec indistinct', async () => {
    const queryClient = seeded([[comment()]]);
    const { transport } = scripted(async () => ({ ok: false, status: 401, error: 'Unauthorized' }));

    expect(
      await performCommentLike({ postId: 'p1', commentId: 'cm1', on: true, deps: gatewayDeps(queryClient, transport) }),
    ).toEqual({ ok: false, message: COMMENT_LIKE_FAILED_MESSAGE, issue: 'refused', reason: 'comment.refused.session' });
  });

  test('panne réseau HORS LIGNE ⇒ l’optimiste RESTE, et le geste non confirmé OFFRE le rejeu', async () => {
    const queryClient = seeded([[comment({ likeCount: 1 })]]);
    const { transport } = scripted(() => Promise.reject(new TypeError('Failed to fetch')));

    const result = await horsLigne(() =>
      performCommentLike({ postId: 'p1', commentId: 'cm1', on: true, deps: gatewayDeps(queryClient, transport) }),
    );

    /* `issue: 'unconfirmed'` ⇒ la rangée pose « Réessayer ». C'est l'inverse
       exact de l'état d'avant, où le rejeu n'existait QUE sur les refus qui ne
       peuvent pas aboutir. */
    expect(result).toEqual({ ok: false, message: COMMENT_GESTURE_PENDING_MESSAGE, issue: 'unconfirmed' });
    expect(cached(queryClient)?.likeCount).toBe(2);
  });

  /**
   * **UNE PANNE DE PASSERELLE N'EST PAS UNE COUPURE RÉSEAU.** Le 500 EN LIGNE
   * est un rang AUTRE que le hors-ligne, seul cas couvert jusqu'ici : les deux
   * servaient le même « Geste non confirmé — hors ligne », et l'utilisateur
   * partait vérifier son wifi pendant que sa connexion était bonne.
   */
  test('500 EN LIGNE ⇒ le message ne nomme PAS le réseau', async () => {
    const queryClient = seeded([[comment({ likeCount: 1 })]]);
    const { transport } = scripted(async () => ({ ok: false, status: 500, error: 'Internal' }));

    expect(
      await performCommentLike({ postId: 'p1', commentId: 'cm1', on: true, deps: gatewayDeps(queryClient, transport) }),
    ).toEqual({ ok: false, message: COMMENT_GESTURE_UNCONFIRMED_MESSAGE, issue: 'unconfirmed' });
  });

  /** Miroir `commentHeartInFlightIds` (`PostDetailViewModel.swift:494`). */
  test('un second tap pendant l’appel est ignoré — une seule requête part', async () => {
    const queryClient = seeded([[comment({ likeCount: 0 })]]);
    let release: (r: ApiResult<unknown>) => void = () => undefined;
    const { requests, transport } = scripted(() => new Promise((resolve) => (release = resolve)));
    const deps = gatewayDeps(queryClient, transport);

    const first = performCommentLike({ postId: 'p1', commentId: 'cm1', on: true, deps });
    expect(await performCommentLike({ postId: 'p1', commentId: 'cm1', on: true, deps })).toEqual({ ok: true });

    expect(requests).toHaveLength(1);
    expect(cached(queryClient)?.likeCount).toBe(1);
    release({ ok: true, data: { liked: true, likeCount: 1 } });
    await first;
  });

  test('une rangée de la SECONDE page est aimée elle aussi — le geste ne connaît pas les pages', async () => {
    const queryClient = seeded([[comment()], [comment({ id: 'cm9', likeCount: 2 })]]);
    const { transport } = scripted(async () => ({ ok: true, data: { liked: true, likeCount: 3 } }));

    await performCommentLike({ postId: 'p1', commentId: 'cm9', on: true, deps: gatewayDeps(queryClient, transport) });

    expect(cached(queryClient, 'cm9')?.likeCount).toBe(3);
    expect(cached(queryClient, 'cm1')?.likeCount).toBe(0);
  });
});

describe('performCommentEdit — le texte change AVANT la réponse, et REVIENT au refus', () => {
  test('le texte est remplacé avant toute réponse, puis le servi prend sa place', async () => {
    const queryClient = seeded([[comment({ content: 'Superbe photo' })]]);
    let release: (r: ApiResult<unknown>) => void = () => undefined;
    const { transport } = scripted(() => new Promise((resolve) => (release = resolve)));

    const pending = performCommentEdit({
      postId: 'p1',
      commentId: 'cm1',
      content: 'Superbe photo !',
      deps: gatewayDeps(queryClient, transport),
    });
    expect(cached(queryClient)?.content).toBe('Superbe photo !');

    release({ ok: true, data: comment({ content: 'Superbe photo !', originalLanguage: 'fr' }) });
    expect(await pending).toEqual({ ok: true });
    expect(cached(queryClient)?.originalLanguage).toBe('fr');
  });

  test('modifier ⇒ `PATCH …/comments/:commentId`, corps et en-tête d’idempotence de la passerelle', async () => {
    const queryClient = seeded([[comment()]]);
    const { requests, transport } = scripted(async () => ({ ok: true, data: comment({ content: 'Corrigé' }) }));

    await performCommentEdit({
      postId: 'p1',
      commentId: 'cm1',
      content: 'Corrigé',
      originalLanguage: 'fr',
      deps: gatewayDeps(queryClient, transport),
    });

    expect(requests[0]?.method).toBe('PATCH');
    expect(requests[0]?.path).toBe('/api/v1/posts/p1/comments/cm1');
    expect(requests[0]?.body).toEqual({ content: 'Corrigé', originalLanguage: 'fr' });
    expect(requests[0]?.headers?.['X-Client-Mutation-Id']).toMatch(MUTATION_ID);
  });

  test('403 (pas l’auteur) ⇒ le texte d’ORIGINE revient, et l’échec est annoncé', async () => {
    const queryClient = seeded([[comment({ content: 'Superbe photo' })]]);
    const { transport } = scripted(async () => ({ ok: false, status: 403, error: 'Not authorized', code: 'FORBIDDEN' }));

    const result = await performCommentEdit({
      postId: 'p1',
      commentId: 'cm1',
      content: 'Autre chose',
      deps: gatewayDeps(queryClient, transport),
    });

    expect(result).toEqual({
      ok: false,
      message: COMMENT_EDIT_FAILED_MESSAGE,
      issue: 'refused',
      reason: 'comment.refused.right',
    });
    expect(cached(queryClient)?.content).toBe('Superbe photo');
  });

  test('un texte VIDE n’est pas un appel — la passerelle refuserait en 400 sans rien dire de précis', async () => {
    const queryClient = seeded([[comment({ content: 'Superbe photo' })]]);
    const { requests, transport } = scripted(async () => ({ ok: true, data: comment() }));

    const result = await performCommentEdit({
      postId: 'p1',
      commentId: 'cm1',
      content: '   ',
      deps: gatewayDeps(queryClient, transport),
    });

    expect(result).toEqual({ ok: false, message: COMMENT_EDIT_FAILED_MESSAGE, issue: 'refused' });
    expect(requests).toHaveLength(0);
    expect(cached(queryClient)?.content).toBe('Superbe photo');
  });

  /**
   * **CORRIGER UNE FAUTE NE CHANGE PAS LA LANGUE DU TEXTE** — le défaut que
   * #6600 a déjà coûté à iOS, mot pour mot : « ouverte sur le défaut "fr",
   * [la pastille] réécrirait la langue d'un commentaire espagnol à la première
   * faute corrigée » (`ComposerModels.swift:100-107`). La passerelle ÉCRIT ce
   * qu'on lui déclare — `updateData.originalLanguage = data.originalLanguage
   * ?? null` dès que le texte change (`PostCommentService.ts:314-316`) — et
   * purge les traductions dans le même mouvement : le pipeline retraduit alors
   * un texte espagnol en le croyant français, pour TOUS les lecteurs.
   *
   * LE TÉMOIN S'ÉCRIT SUR UN RANG AUTRE QUE LE PREMIER (leçon 261) : langue
   * d'interface `fr`, commentaire `es`. Les deux valeurs coïncident sur tout
   * commentaire français — c'est très exactement pourquoi ni les 46 témoins du
   * lot ni le corpus de fixtures (`cm-r2-0`, `originalLanguage: 'fr'`) ne
   * pouvaient le voir.
   */
  test('la langue DÉCLARÉE est celle du commentaire CORRIGÉ, jamais celle de l’interface', async () => {
    const queryClient = seeded([[comment({ content: 'Muy buena foto', originalLanguage: 'es' })]]);
    const { requests, transport } = scripted(async () => ({ ok: true, data: comment({ content: 'Muy buena foto!' }) }));

    await performCommentEdit({
      postId: 'p1',
      commentId: 'cm1',
      content: 'Muy buena foto!',
      originalLanguage: 'fr',
      deps: gatewayDeps(queryClient, transport),
    });

    expect(requests[0]?.body).toEqual({ content: 'Muy buena foto!', originalLanguage: 'es' });
  });

  /** Sans langue connue, la déclaration de l’appelant reste le meilleur
   * repli — c'est le `?? current` du miroir iOS, pas un silence. */
  test('un commentaire SANS langue connue retombe sur celle que l’appelant déclare', async () => {
    const queryClient = seeded([[comment({ content: 'Superbe photo', originalLanguage: null })]]);
    const { requests, transport } = scripted(async () => ({ ok: true, data: comment({ content: 'Superbe photo !' }) }));

    await performCommentEdit({
      postId: 'p1',
      commentId: 'cm1',
      content: 'Superbe photo !',
      originalLanguage: 'fr',
      deps: gatewayDeps(queryClient, transport),
    });

    expect(requests[0]?.body).toEqual({ content: 'Superbe photo !', originalLanguage: 'fr' });
  });

  /** Fail-closed, comme tout ce que `compose-language.ts` rend : un code que
   * Meeshy ne SUPPORTE pas n'est pas transmis — la passerelle le refuserait en
   * 400 (`CommonSchemas.language`), et un refus sur une faute d'orthographe
   * corrigée serait incompréhensible. */
  test('une langue stockée que Meeshy ne supporte pas n’est pas retransmise', async () => {
    const queryClient = seeded([[comment({ content: 'Superbe photo', originalLanguage: 'zz' })]]);
    const { requests, transport } = scripted(async () => ({ ok: true, data: comment({ content: 'Superbe photo !' }) }));

    await performCommentEdit({
      postId: 'p1',
      commentId: 'cm1',
      content: 'Superbe photo !',
      originalLanguage: 'fr',
      deps: gatewayDeps(queryClient, transport),
    });

    expect(requests[0]?.body).toEqual({ content: 'Superbe photo !', originalLanguage: 'fr' });
  });

  test('un texte INCHANGÉ n’est pas un appel non plus', async () => {
    const queryClient = seeded([[comment({ content: 'Superbe photo' })]]);
    const { requests, transport } = scripted(async () => ({ ok: true, data: comment() }));

    expect(
      await performCommentEdit({
        postId: 'p1',
        commentId: 'cm1',
        content: 'Superbe photo',
        deps: gatewayDeps(queryClient, transport),
      }),
    ).toEqual({ ok: true });
    expect(requests).toHaveLength(0);
  });

  /**
   * **UN GESTE DESTRUCTEUR NON CONFIRMÉ SE DÉFAIT** (défaut majeur 4). Le
   * texte modifié RESTAIT à l'écran sur une panne : la rangée affirmait une
   * correction que la passerelle n'avait jamais acceptée, le texte d'avant
   * revenait au prochain chargement, et aucune file ne rejouait rien. Le rejeu
   * est offert à la place — c'est LUI qui porte la reprise.
   */
  test('panne réseau ⇒ le texte d’ORIGINE revient, et le rejeu est OFFERT', async () => {
    const queryClient = seeded([[comment({ content: 'Superbe photo' })]]);
    const { transport } = scripted(() => Promise.reject(new TypeError('Failed to fetch')));

    expect(
      await performCommentEdit({
        postId: 'p1',
        commentId: 'cm1',
        content: 'Superbe photo !',
        deps: gatewayDeps(queryClient, transport),
      }),
    ).toEqual({ ok: false, message: COMMENT_GESTURE_UNCONFIRMED_MESSAGE, issue: 'unconfirmed' });
    expect(cached(queryClient)?.content).toBe('Superbe photo');
  });

  test('500 EN LIGNE ⇒ même chose, et le message ne nomme PAS le réseau', async () => {
    const queryClient = seeded([[comment({ content: 'Superbe photo' })]]);
    const { transport } = scripted(async () => ({ ok: false, status: 500, error: 'Internal' }));

    expect(
      await performCommentEdit({
        postId: 'p1',
        commentId: 'cm1',
        content: 'Superbe photo !',
        deps: gatewayDeps(queryClient, transport),
      }),
    ).toEqual({ ok: false, message: COMMENT_GESTURE_UNCONFIRMED_MESSAGE, issue: 'unconfirmed' });
    expect(cached(queryClient)?.content).toBe('Superbe photo');
  });
});

describe('performCommentDelete — la rangée part AVANT la réponse, et REVIENT à sa place au refus', () => {
  const trois = () => [comment({ id: 'a' }), comment({ id: 'b' }), comment({ id: 'c' })];

  test('la rangée disparaît avant toute réponse, et le compteur de la publication suit', async () => {
    const queryClient = seeded([trois()]);
    queryClient.setQueryData<FeedPost>(postQueryKey('p1'), { id: 'p1', type: 'POST', createdAt: '', commentCount: 3 });
    let release: (r: ApiResult<unknown>) => void = () => undefined;
    const { transport } = scripted(() => new Promise((resolve) => (release = resolve)));

    const pending = performCommentDelete({ postId: 'p1', commentId: 'b', deps: gatewayDeps(queryClient, transport) });
    expect(rows(queryClient).map((c) => c.id)).toEqual(['a', 'c']);
    expect(queryClient.getQueryData<FeedPost>(postQueryKey('p1'))?.commentCount).toBe(2);

    release({ ok: true, data: { deleted: true } });
    expect(await pending).toEqual({ ok: true });
    expect(rows(queryClient).map((c) => c.id)).toEqual(['a', 'c']);
  });

  test('supprimer ⇒ `DELETE …/comments/:commentId`, avec l’en-tête d’idempotence', async () => {
    const queryClient = seeded([trois()]);
    const { requests, transport } = scripted(async () => ({ ok: true, data: { deleted: true } }));

    await performCommentDelete({ postId: 'p1', commentId: 'b', deps: gatewayDeps(queryClient, transport) });

    expect(requests[0]?.method).toBe('DELETE');
    expect(requests[0]?.path).toBe('/api/v1/posts/p1/comments/b');
    expect(requests[0]?.headers?.['X-Client-Mutation-Id']).toMatch(MUTATION_ID);
  });

  /** LE CŒUR DE CE LOT : réinsérer « quelque part » passerait pour un rollback. */
  test('403 ⇒ la rangée est RÉINSÉRÉE À SA PLACE, et le compteur remonte', async () => {
    const queryClient = seeded([trois()]);
    queryClient.setQueryData<FeedPost>(postQueryKey('p1'), { id: 'p1', type: 'POST', createdAt: '', commentCount: 3 });
    const { transport } = scripted(async () => ({ ok: false, status: 403, error: 'Not authorized' }));

    const result = await performCommentDelete({ postId: 'p1', commentId: 'b', deps: gatewayDeps(queryClient, transport) });

    expect(result).toEqual({
      ok: false,
      message: COMMENT_DELETE_FAILED_MESSAGE,
      issue: 'refused',
      reason: 'comment.refused.right',
    });
    expect(rows(queryClient).map((c) => c.id)).toEqual(['a', 'b', 'c']);
    expect(queryClient.getQueryData<FeedPost>(postQueryKey('p1'))?.commentCount).toBe(3);
  });

  /**
   * **LE DÉFAUT MAJEUR 4, À SA FORME LA PLUS COÛTEUSE.** Un 500 laissait la
   * rangée PARTIE, le compteur de la publication DÉCRÉMENTÉ, aucune alerte
   * (la rangée n'existait plus pour la porter), aucun rejeu, aucune file — et
   * pour seule phrase « Geste non confirmé — hors ligne » pendant que
   * `navigator.onLine` valait `true`. L'utilisateur croyait son commentaire
   * supprimé ; il revenait au chargement suivant.
   *
   * LE TÉMOIN SE POSE SUR UN 500 EN LIGNE — un rang AUTRE que le hors-ligne,
   * seul cas que le corpus couvrait.
   */
  test('500 EN LIGNE ⇒ la rangée REVIENT, le compteur remonte, et le rejeu est OFFERT', async () => {
    const queryClient = seeded([trois()]);
    queryClient.setQueryData<FeedPost>(postQueryKey('p1'), { id: 'p1', type: 'POST', createdAt: '', commentCount: 3 });
    const { transport } = scripted(async () => ({ ok: false, status: 500, error: 'Internal' }));

    const result = await performCommentDelete({ postId: 'p1', commentId: 'b', deps: gatewayDeps(queryClient, transport) });

    expect(result).toEqual({ ok: false, message: COMMENT_GESTURE_UNCONFIRMED_MESSAGE, issue: 'unconfirmed' });
    expect(rows(queryClient).map((c) => c.id)).toEqual(['a', 'b', 'c']);
    expect(queryClient.getQueryData<FeedPost>(postQueryKey('p1'))?.commentCount).toBe(3);
  });

  test('panne réseau HORS LIGNE ⇒ la rangée REVIENT aussi, et le message NOMME le réseau', async () => {
    const queryClient = seeded([trois()]);
    const { transport } = scripted(() => Promise.reject(new TypeError('Failed to fetch')));

    const result = await horsLigne(() =>
      performCommentDelete({ postId: 'p1', commentId: 'b', deps: gatewayDeps(queryClient, transport) }),
    );

    expect(result).toEqual({ ok: false, message: COMMENT_GESTURE_PENDING_MESSAGE, issue: 'unconfirmed' });
    expect(rows(queryClient).map((c) => c.id)).toEqual(['a', 'b', 'c']);
  });

  test('une rangée de la SECONDE page revient DANS SA PAGE, pas en tête du fil', async () => {
    const queryClient = seeded([[comment({ id: 'a' })], [comment({ id: 'x' }), comment({ id: 'y' })]]);
    const { transport } = scripted(async () => ({ ok: false, status: 404, error: 'Comment not found' }));

    await performCommentDelete({ postId: 'p1', commentId: 'x', deps: gatewayDeps(queryClient, transport) });

    const data = queryClient.getQueryData<CommentInfiniteData>(commentsQueryKey('p1'));
    expect(data?.pages[0]?.comments.map((c) => c.id)).toEqual(['a']);
    expect(data?.pages[1]?.comments.map((c) => c.id)).toEqual(['x', 'y']);
  });

  test('un second geste sur la MÊME rangée pendant l’appel est ignoré', async () => {
    const queryClient = seeded([trois()]);
    let release: (r: ApiResult<unknown>) => void = () => undefined;
    const { requests, transport } = scripted(() => new Promise((resolve) => (release = resolve)));
    const deps = gatewayDeps(queryClient, transport);

    const first = performCommentDelete({ postId: 'p1', commentId: 'b', deps });
    expect(await performCommentDelete({ postId: 'p1', commentId: 'b', deps })).toEqual({ ok: true });

    expect(requests).toHaveLength(1);
    release({ ok: true, data: { deleted: true } });
    await first;
  });
});

describe('source `fixtures` — les trois gestes basculent sans jamais toucher au transport', () => {
  const fixtureDeps = (queryClient: QueryClient): CommentGestureDeps => ({
    source: 'fixtures',
    transport: {} as HttpTransport,
    queryClient,
  });

  test('aimer, modifier et supprimer aboutissent hors réseau', async () => {
    const queryClient = seeded([[comment({ likeCount: 1 })]]);

    expect(await performCommentLike({ postId: 'p1', commentId: 'cm1', on: true, deps: fixtureDeps(queryClient) })).toEqual({ ok: true });
    expect(cached(queryClient)?.likeCount).toBe(2);

    expect(
      await performCommentEdit({ postId: 'p1', commentId: 'cm1', content: 'Corrigé', deps: fixtureDeps(queryClient) }),
    ).toEqual({ ok: true });
    expect(cached(queryClient)?.content).toBe('Corrigé');

    expect(await performCommentDelete({ postId: 'p1', commentId: 'cm1', deps: fixtureDeps(queryClient) })).toEqual({ ok: true });
    expect(cached(queryClient)).toBeUndefined();
  });
});

/**
 * LE COMPTEUR D'UNE PUBLICATION NE PEUT PAS DIFFÉRER SELON L'ÉCRAN QUI LA
 * MONTRE (#7135, R1) — la carte du FIL lit `commentCount` depuis
 * `FEED_QUERY_KEY` (`feed-post-card.tsx:75`), le lecteur des Réels depuis ses
 * propres pages, la fiche depuis `postQueryKey`. `shiftCommentCount`
 * n'écrivait que dans la fiche et le rail de stories : on ouvrait le fil, on
 * tapait le compteur d'une carte, on supprimait son commentaire, on revenait —
 * et la carte affichait toujours l'ancien compte.
 *
 * C'est le défaut que `PostLikeMutation.swift` documente au-dessus de sa loi :
 * « un compteur serveur à 0 réaffiché après un retrait tardif passait à −1 sur
 * le second chemin et restait à 0 sur le premier ». Une règle recopiée diverge.
 */
describe('le compteur de commentaires bascule dans TOUS les caches qui le montrent', () => {
  const feedPost = (partial: Partial<FeedPost> = {}): FeedPost => ({
    id: 'p1',
    type: 'POST',
    createdAt: '2026-09-19T10:00:00.000Z',
    commentCount: 7,
    ...partial,
  });

  const feedPages = (posts: readonly FeedPost[]): FeedInfiniteData => ({
    pages: [{ posts, pagination: { limit: 20, hasMore: false, nextCursor: null } }],
    pageParams: [undefined],
  });

  const seedAllRoots = (queryClient: QueryClient, count: number): void => {
    queryClient.setQueryData(FEED_QUERY_KEY, feedPages([feedPost({ commentCount: count }), feedPost({ id: 'p2', commentCount: 99 })]));
    queryClient.setQueryData(reelsQueryKey('affinity'), feedPages([feedPost({ commentCount: count })]));
    queryClient.setQueryData<FeedPost>(postQueryKey('p1'), feedPost({ commentCount: count }));
  };

  const countIn = (queryClient: QueryClient, key: readonly unknown[], id = 'p1'): number | null | undefined =>
    queryClient.getQueryData<FeedInfiniteData>(key)?.pages.flatMap((p) => p.posts).find((p) => p.id === id)?.commentCount;

  const threeCounts = (queryClient: QueryClient) => ({
    feed: countIn(queryClient, FEED_QUERY_KEY),
    reels: countIn(queryClient, reelsQueryKey('affinity')),
    detail: queryClient.getQueryData<FeedPost>(postQueryKey('p1'))?.commentCount,
  });

  test('supprimer décrémente le compteur de la carte DANS LE FIL, pas seulement dans le détail', async () => {
    const queryClient = seeded([[comment({ id: 'b' })]]);
    seedAllRoots(queryClient, 7);
    const { transport } = scripted(async () => ({ ok: true, data: { deleted: true } }));

    await performCommentDelete({ postId: 'p1', commentId: 'b', deps: gatewayDeps(queryClient, transport) });

    expect(countIn(queryClient, FEED_QUERY_KEY)).toBe(6);
  });

  test('… et dans les pages de RÉELS', async () => {
    const queryClient = seeded([[comment({ id: 'b' })]]);
    seedAllRoots(queryClient, 7);
    const { transport } = scripted(async () => ({ ok: true, data: { deleted: true } }));

    await performCommentDelete({ postId: 'p1', commentId: 'b', deps: gatewayDeps(queryClient, transport) });

    expect(countIn(queryClient, reelsQueryKey('affinity'))).toBe(6);
  });

  test('le refus REMET le compteur à sa valeur exacte dans les TROIS caches', async () => {
    const queryClient = seeded([[comment({ id: 'b' })]]);
    seedAllRoots(queryClient, 7);
    const { transport } = scripted(async () => ({ ok: false, status: 403, error: 'Not authorized' }));

    await performCommentDelete({ postId: 'p1', commentId: 'b', deps: gatewayDeps(queryClient, transport) });

    expect(threeCounts(queryClient)).toEqual({ feed: 7, reels: 7, detail: 7 });
  });

  test('envoyer incrémente les TROIS', async () => {
    const queryClient = new QueryClient();
    seedAllRoots(queryClient, 7);
    const { transport } = scripted(async () => ({
      ok: true,
      data: { id: 'cm-servi', content: 'Bravo', createdAt: '2026-09-19T12:00:00.000Z', author: { id: 'u-moi', displayName: 'Vous' } },
    }));

    await performComment({
      postId: 'p1',
      content: 'Bravo',
      author: { id: 'u-moi', displayName: 'Vous' },
      deps: { source: 'gateway', transport, queryClient },
    });

    expect(threeCounts(queryClient)).toEqual({ feed: 8, reels: 8, detail: 8 });
  });

  /** LA LIGNE QU'ON OUBLIE — `mapCardPosts` opère sur des pages EXISTANTES ;
   * « incrémenter partout » sans cette garde ferait apparaître une ligne
   * fantôme dans un cache qui n'a jamais servi ce post. */
  test('une publication ABSENTE d’une racine n’y crée rien', async () => {
    const queryClient = seeded([[comment({ id: 'b' })]]);
    queryClient.setQueryData(FEED_QUERY_KEY, feedPages([feedPost({ id: 'p2', commentCount: 99 })]));
    const { transport } = scripted(async () => ({ ok: true, data: { deleted: true } }));

    await performCommentDelete({ postId: 'p1', commentId: 'b', deps: gatewayDeps(queryClient, transport) });

    const posts = queryClient.getQueryData<FeedInfiniteData>(FEED_QUERY_KEY)?.pages.flatMap((p) => p.posts) ?? [];
    expect(posts.map((p) => p.id)).toEqual(['p2']);
    expect(posts[0]?.commentCount).toBe(99);
  });

  /** La borne basse de `PostLikeMutation.swift` — un compteur servi à 0
   * réaffiché après un retrait tardif ne passe JAMAIS à −1. */
  test('un compteur déjà à zéro ne descend pas sous zéro', async () => {
    const queryClient = seeded([[comment({ id: 'b' })]]);
    seedAllRoots(queryClient, 0);
    const { transport } = scripted(async () => ({ ok: true, data: { deleted: true } }));

    await performCommentDelete({ postId: 'p1', commentId: 'b', deps: gatewayDeps(queryClient, transport) });

    expect(threeCounts(queryClient)).toEqual({ feed: 0, reels: 0, detail: 0 });
  });
});

/**
 * LA BORNE DE LONGUEUR EST UNE (#7135, R2) — elle était déclarée DEUX fois,
 * `publication-comments.ts:246` et `comment-gestures.ts:90`, toutes deux
 * exportées et toutes deux consommées. Les deux valaient 2000, donc rien ne se
 * voyait ; le jour où l'une bouge, le champ laisse taper ce que le port
 * refuse — et le lecteur reçoit un refus qu'il ne peut pas comprendre, parce
 * que « Enregistrer » était actif. Le compilateur ne dit rien : deux modules
 * ont le droit d'exporter le même nom.
 *
 * Un test d'identité de référence serait FAIBLE (il verdirait sur deux
 * constantes égales par hasard) : ces témoins mesurent l'EFFET du seuil, de
 * part et d'autre.
 */
describe('la borne de longueur est UNE — le champ et le port comptent la même chose', () => {
  test('un texte d’exactement COMMENT_MAX_LENGTH caractères est ACCEPTÉ par le port', async () => {
    const queryClient = seeded([[comment()]]);
    const { requests, transport } = scripted(async () => ({ ok: true, data: { id: 'cm1', content: 'x' } }));

    const result = await performCommentEdit({
      postId: 'p1',
      commentId: 'cm1',
      content: 'a'.repeat(COMMENT_MAX_LENGTH),
      deps: gatewayDeps(queryClient, transport),
    });

    expect(result).toEqual({ ok: true });
    expect(requests).toHaveLength(1);
  });

  test('un texte de COMMENT_MAX_LENGTH + 1 est REFUSÉ, et le port ne part pas', async () => {
    const queryClient = seeded([[comment()]]);
    const { requests, transport } = scripted(async () => ({ ok: true, data: {} }));

    const result = await performCommentEdit({
      postId: 'p1',
      commentId: 'cm1',
      content: 'a'.repeat(COMMENT_MAX_LENGTH + 1),
      deps: gatewayDeps(queryClient, transport),
    });

    expect(result).toEqual({ ok: false, message: COMMENT_EDIT_FAILED_MESSAGE, issue: 'refused' });
    expect(requests).toEqual([]);
    expect(cached(queryClient)?.content).toBe('Superbe photo');
  });
});
