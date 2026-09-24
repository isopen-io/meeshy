import type { FeedAuthor } from './feed-pages';
import { VIEWER_HANDLE, VIEWER_ID, minutesAgo } from './fixtures-base';
import type { ApiResult } from './http';
import { COMMENTS_PAGE_SIZE, type CommentPage, type PostComment } from './publication-comments';

/**
 * **LE BOUCHON DU FIL DE COMMENTAIRES** — MIME
 * `GET /api/v1/posts/:postId/comments` et `POST` du même chemin
 * (`services/gateway/src/routes/posts/comments.ts:66,179` ;
 * `PostCommentService.getComments`, `:402-455`) :
 *
 *  - commentaires de PREMIER NIVEAU seuls, `createdAt desc` ;
 *  - curseur OPAQUE (ici l'indice de la page suivante, encodé) ; `hasMore` et
 *    `nextCursor` bougent ENSEMBLE, comme la passerelle les rend ;
 *  - un post INCONNU du corpus rend une page VIDE, pas une erreur — la
 *    passerelle ne distingue jamais « pas de commentaire » d'un fil neuf ;
 *  - l'ajout rend **201** avec la ligne créée, comme `withMutationLog` la
 *    sert.
 *
 * AUCUN auteur ne reprend Kwame/Amina/Fatou/Bruno, mêmes raisons que
 * `fixtures-feed.ts` : ce sont les preuves « ceci est une fixture » du socle.
 */

const commentAuthor = (id: string, displayName: string, username: string): FeedAuthor => ({ id, displayName, username });

const NOA = commentAuthor('u-comment-noa', 'Noa Berger', 'noa.berger');
const TARIQ = commentAuthor('u-comment-tariq', 'Tariq Belkacem', 'tariq.belkacem');
const INES = commentAuthor('u-comment-ines', 'Inès Lefèvre', 'ines.lefevre');

export const FIXTURE_VIEWER_AUTHOR: FeedAuthor = { id: VIEWER_ID, displayName: 'Vous', username: VIEWER_HANDLE };

const comment = (
  id: string,
  author: FeedAuthor,
  content: string,
  minutes: number,
  patch: Partial<PostComment> = {},
): PostComment => ({
  id,
  author,
  content,
  createdAt: minutesAgo(minutes).toISOString(),
  likeCount: 0,
  replyCount: 0,
  ...patch,
});

/**
 * `post-image-en-translated` porte un fil où le Prisme a quelque chose à
 * faire : un commentaire ANGLAIS dont la traduction française existe, à côté
 * d'un commentaire déjà français. Un témoin de RANG se pose sur celui-là, pas
 * sur un fil monolingue où la règle juste et le court-circuit rendent le même
 * verdict (CLAUDE.md § Prisme, leçon 261).
 */
const FILS: Readonly<Record<string, readonly PostComment[]>> = {
  'post-image-en-translated': [
    comment('cm-en-1', NOA, 'Great shot, where was it taken?', 7, {
      originalLanguage: 'en',
      translations: { fr: { text: 'Superbe photo, où a-t-elle été prise ?', translationModel: 'nllb-200' } },
      likeCount: 3,
    }),
    comment('cm-en-2', TARIQ, 'La lumière est incroyable sur cette prise.', 24, { likeCount: 1, originalLanguage: 'fr' }),
  ],
  'post-text-rank2': [
    /* UNE RANGÉE À SOI DANS LE CORPUS (#7135) — sans elle, « Modifier » et
       « Supprimer » ne sont atteignables sur AUCUN écran de fixture : la
       passerelle garde ces deux gestes sur l'AUTEUR (`comments.ts:500-523`),
       donc la rangée ne les offre qu'à lui, et une recette manuelle n'aurait
       eu aucun moyen de les voir. Elle porte aussi un cœur DÉJÀ posé, l'autre
       moitié du geste d'aimer. */
    comment('cm-r2-0', FIXTURE_VIEWER_AUTHOR, 'Je l’ai testé ce matin, ça tient.', 4, {
      originalLanguage: 'fr',
      isLikedByMe: true,
      likeCount: 2,
    }),
    comment('cm-r2-1', INES, 'Merci pour le partage, c’est très clair.', 12, { originalLanguage: 'fr' }),
    comment('cm-r2-2', NOA, 'Je garde ça sous le coude.', 40, { originalLanguage: 'fr' }),
    comment('cm-r2-3', TARIQ, 'Une source à recommander ?', 95, { originalLanguage: 'fr', replyCount: 2 }),
  ],
  /* Une STORY porte le même fil qu'une publication — c'est ce qui permet au
     rail du lecteur d'ouvrir des commentaires sans second port. */
  'st-amie-2': [
    comment('cm-st-1', INES, 'Trop belle, cette lumière sur le lac !', 3, { originalLanguage: 'fr', likeCount: 2 }),
    comment('cm-st-2', NOA, 'Which lake is this?', 18, {
      originalLanguage: 'en',
      translations: { fr: { text: 'C’est quel lac ?', translationModel: 'nllb-200' } },
    }),
    comment('cm-st-3', TARIQ, 'On y retourne quand ?', 52, { originalLanguage: 'fr' }),
  ],
  'st-mienne': [comment('cm-mienne-1', NOA, 'Ça fait plaisir de te lire !', 9, { originalLanguage: 'fr' })],
  /* LE RÉEL DU GATE NAVIGATEUR (#6484, `scripts/check-reels.mjs`, `SEED =
     'reel-portrait'`) — DEUX commentaires, jamais onze : `REEL_PORTRAIT.
     commentCount` (`fixtures-feed.ts`) est passé de 11 à 2 dans le MÊME lot,
     pour qu'un compteur annonçant onze ne surplombe plus un fil qui n'en
     porte aucun (cycle 122 du CLAUDE.md racine : « qui AFFICHE ce qu'il
     élit ? »). Auteurs du corpus EXISTANT (Noa, Tariq) — jamais Kwame/Amina/
     Fatou/Bruno, les preuves « ceci est une fixture » du socle. */
  'reel-portrait': [
    comment('cm-reel-portrait-1', NOA, 'La reprise du refrain est parfaite.', 6, { originalLanguage: 'fr' }),
    comment('cm-reel-portrait-2', TARIQ, 'On sent que le groupe est chaud ce soir.', 22, { originalLanguage: 'fr' }),
  ],
};

const EMPTY_PAGE: CommentPage = {
  comments: [],
  pagination: { limit: COMMENTS_PAGE_SIZE, hasMore: false, nextCursor: null },
};

/** Les commentaires AJOUTÉS pendant la session de fixtures, par publication —
 * même portée que `mine` dans `fixtures-reactions.ts` : la durée du
 * processus, remise à zéro explicite pour qu'aucun fichier de test ne dépende
 * de l'ordre d'exécution. */
const ajoutes = new Map<string, PostComment[]>();
let compteur = 0;

export function resetFixtureCommentsForTests(): void {
  ajoutes.clear();
  compteur = 0;
}

const filOf = (postId: string): readonly PostComment[] => [...(ajoutes.get(postId) ?? []), ...(FILS[postId] ?? [])];

export function pageOfComments(postId: string, cursor: string | undefined): CommentPage {
  const fil = filOf(postId);
  if (fil.length === 0) return EMPTY_PAGE;
  const start = cursor === undefined ? 0 : Number.parseInt(cursor, 10);
  if (!Number.isFinite(start) || start < 0) return EMPTY_PAGE;
  const comments = fil.slice(start, start + COMMENTS_PAGE_SIZE);
  const hasMore = start + COMMENTS_PAGE_SIZE < fil.length;
  return {
    comments,
    pagination: {
      limit: COMMENTS_PAGE_SIZE,
      hasMore,
      nextCursor: hasMore ? String(start + COMMENTS_PAGE_SIZE) : null,
    },
  };
}

/** Miroir `POST /posts/:postId/comments` (`:179-260`) — 201 et la ligne créée. */
export function fixtureAddComment(postId: string, body: Readonly<Record<string, unknown>>): ApiResult<PostComment> {
  compteur += 1;
  const content = typeof body.content === 'string' ? body.content : '';
  const created: PostComment = {
    id: `cm-fx-${compteur}`,
    author: FIXTURE_VIEWER_AUTHOR,
    content,
    createdAt: new Date().toISOString(),
    likeCount: 0,
    replyCount: 0,
    ...(typeof body.originalLanguage === 'string' ? { originalLanguage: body.originalLanguage } : {}),
  };
  ajoutes.set(postId, [created, ...(ajoutes.get(postId) ?? [])]);
  return { ok: true, status: 201, data: created };
}
