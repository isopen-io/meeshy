import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import type { CommentAddedEventData } from '@meeshy/shared/types/post';

import { applyCommentAdded, commentsQueryKey, isCommentAdded, type PostComment } from './publication-comments';

/**
 * LA CHARGE TELLE QUE LE FIL L'ÉMET. `PostComment` du paquet partagé et celui
 * du cache de web-v2 ne coïncident pas au type près (`createdAt: string | Date`
 * là-bas, `likeCount: number | null` ici) — c'est précisément la frontière que
 * `commentFromSocket` franchit côté production. Le témoin la franchit ici par
 * un cast NOMMÉ, plutôt qu'en fabriquant une troisième forme qui ne serait
 * celle de personne.
 */
const evenement = (partial: {
  readonly postId: string;
  readonly comment: PostComment;
  readonly commentCount: number;
  readonly clientMutationId?: string;
}): CommentAddedEventData => partial as unknown as CommentAddedEventData;

/**
 * **LA LISTE DES COMMENTAIRES SE MET À JOUR TOUTE SEULE** (#7151) — le septième
 * couple `is…` / `apply…` du site unique (`realtime-apply.ts`).
 *
 * L'événement `comment:added` EXISTE côté passerelle depuis toujours
 * (`event-names.ts:423`, émis par `SocialEventsHandler`) ; mesuré avant ce lot,
 * `grep -rn "comment:added" apps/web-v2/src/` rendait VIDE. Personne ne
 * l'écoutait : il fallait recharger pour voir le commentaire d'un tiers.
 *
 * ## LES TROIS PIÈGES, TOUS DÉJÀ PAYÉS PAR LE DÉPÔT
 *
 * 1. **l'idempotence** — `insertComment` pose en tête SANS regarder si l'id est
 *    déjà là. Un rejeu (reconnexion, double abonnement) dédoublerait la rangée
 *    ET ferait dériver le compteur. Le défaut a déjà été payé sur le cœur
 *    (`8893402442`).
 * 2. **son PROPRE envoi** — l'émetteur reçoit son écho. Sans réconciliation, il
 *    voit sa ligne deux fois : la provisoire et celle du serveur.
 * 3. **la forme** — une charge qui ne satisfait pas la garde doit être ignorée
 *    SANS lever : un événement inattendu ne casse pas l'écran.
 *
 * ## CE QUE LA RÉCONCILIATION A EXIGÉ DE CORRIGER EN AMONT
 *
 * `CommentAddedEventData.clientMutationId` existe précisément pour ça — son
 * doc-comment le dit : « ré-émis dans l'écho pour que l'ÉMETTEUR réconcilie sa
 * ligne optimiste (insérée sous cet id local) ».
 *
 * Mais côté web-v2 les deux identifiants étaient INDÉPENDANTS : la rangée
 * optimiste portait `newClientMessageId()` (`cid_…`) et l'en-tête envoyait un
 * SECOND appel au même générateur (`cmid_…`). L'écho revenait donc avec un
 * `clientMutationId` que rien ne rattachait à la rangée posée — la
 * réconciliation annoncée ne pouvait pas avoir lieu. Le lot dérive désormais le
 * cmid DU `tempId` : un seul identifiant, deux préfixes.
 */

const POST = 'p-commentaires';

const commentaire = (patch: Partial<PostComment> = {}): PostComment =>
  ({
    id: 'c-serveur',
    content: 'Un commentaire venu d’ailleurs',
    createdAt: '2026-09-20T10:00:00.000Z',
    author: { id: 'u-autre', displayName: 'Noa Berger', username: 'noa' },
    ...patch,
  }) as PostComment;

/** Le cache tel que `useInfiniteQuery` le tient — une page, ses commentaires. */
const cacheAvec = (comments: readonly PostComment[]) => ({
  pages: [{ comments, nextCursor: null }],
  pageParams: [undefined],
});

const clientAvec = (comments: readonly PostComment[]) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(commentsQueryKey(POST), cacheAvec(comments));
  return queryClient;
};

const rangees = (queryClient: QueryClient): readonly PostComment[] => {
  const data = queryClient.getQueryData(commentsQueryKey(POST)) as
    | { readonly pages: readonly { readonly comments: readonly PostComment[] }[] }
    | undefined;
  return data?.pages.flatMap((p) => p.comments) ?? [];
};

describe('isCommentAdded — la garde de FORME', () => {
  test('accepte la charge que la passerelle émet', () => {
    expect(isCommentAdded({ postId: POST, comment: commentaire(), commentCount: 3 })).toBe(true);
  });

  test('accepte le `clientMutationId` optionnel', () => {
    expect(isCommentAdded({ postId: POST, comment: commentaire(), commentCount: 3, clientMutationId: 'cmid_x' })).toBe(true);
  });

  /**
   * LE CONTRE-TÉMOIN — sans lui, une garde qui rendrait `true` sur tout
   * laisserait `apply…` lire des champs absents. Chaque cas retire UNE chose,
   * pour que le verdict désigne ce qui manque.
   */
  test('refuse ce qui n’est pas cette charge', () => {
    expect(isCommentAdded(null)).toBe(false);
    expect(isCommentAdded({})).toBe(false);
    expect(isCommentAdded({ postId: POST })).toBe(false);
    expect(isCommentAdded({ postId: POST, comment: commentaire() })).toBe(false);
    expect(isCommentAdded({ postId: 42, comment: commentaire(), commentCount: 1 })).toBe(false);
    expect(isCommentAdded({ postId: POST, comment: { id: 1 }, commentCount: 1 })).toBe(false);
  });
});

describe('applyCommentAdded — la rangée APPARAÎT sans rechargement', () => {
  test('un commentaire d’un tiers entre dans la liste', () => {
    const queryClient = clientAvec([commentaire({ id: 'c-ancien', content: 'déjà là' })]);

    applyCommentAdded(queryClient, evenement({ postId: POST, comment: commentaire(), commentCount: 2 }));

    expect(rangees(queryClient).map((c) => c.id)).toEqual(['c-serveur', 'c-ancien']);
  });

  /** LE PIÈGE 1 — `insertComment` pose en tête sans regarder l'id. */
  test('IDEMPOTENCE : deux fois le même id n’insèrent qu’une rangée', () => {
    const queryClient = clientAvec([]);
    const rejeu = evenement({ postId: POST, comment: commentaire(), commentCount: 1 });

    applyCommentAdded(queryClient, rejeu);
    applyCommentAdded(queryClient, rejeu);

    expect(rangees(queryClient).map((c) => c.id)).toEqual(['c-serveur']);
  });

  /**
   * LE PIÈGE 2 — l'émetteur reçoit son propre écho. La rangée provisoire porte
   * `cid_…` ; l'écho porte le `cmid_…` qui en DÉRIVE.
   */
  test('SON PROPRE envoi réconcilie la ligne optimiste au lieu de la dédoubler', () => {
    const queryClient = clientAvec([commentaire({ id: 'cid_abc', content: 'écrit à l’instant', pending: true })]);

    applyCommentAdded(
      queryClient,
      evenement({
        postId: POST,
        comment: commentaire({ id: 'c-serveur', content: 'écrit à l’instant' }),
        commentCount: 1,
        clientMutationId: 'cmid_abc',
      }),
    );

    const vues = rangees(queryClient);
    expect(vues.map((c) => c.id)).toEqual(['c-serveur']);
    expect(vues[0]?.pending).toBeUndefined();
  });

  /**
   * ET IL NE TOUCHE PAS À CE QUI N'EST PAS À LUI : un `cmid_` qui ne désigne
   * aucune rangée locale est un écho d'un AUTRE client — la rangée s'insère
   * normalement, elle ne remplace rien.
   */
  test('un `clientMutationId` inconnu insère, il n’écrase aucune rangée', () => {
    const queryClient = clientAvec([commentaire({ id: 'cid_moi', content: 'le mien', pending: true })]);

    applyCommentAdded(
      queryClient,
      evenement({
        postId: POST,
        comment: commentaire({ id: 'c-autre' }),
        commentCount: 2,
        clientMutationId: 'cmid_quelquun-dautre',
      }),
    );

    expect(rangees(queryClient).map((c) => c.id)).toEqual(['c-autre', 'cid_moi']);
  });

  /** LE PIÈGE 3 — un cache absent n'est pas une erreur : rien à mettre à jour. */
  test('sans cache pour ce post, il ne lève pas', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    expect(() =>
      applyCommentAdded(queryClient, evenement({ postId: 'p-jamais-ouvert', comment: commentaire(), commentCount: 1 })),
    ).not.toThrow();
  });
});
