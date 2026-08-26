/**
 * Canonical Prisma `select` / `include` shapes for Post-related queries.
 *
 * Single source of truth — every service that fetches Posts or PostMedia MUST
 * import these constants instead of redeclaring them. Drift between local
 * copies has caused production bugs (Prisme Linguistique fields silently
 * dropped from feed endpoints, etc.). See commit 42cae57 for the R1 fix that
 * motivated this consolidation.
 *
 * All exports are wrapped in `Prisma.validator<…Select>()` so a typo or a
 * stale field name fails the build instead of failing in production. The
 * `Prisma.<Model>GetPayload<...>` type exports give every consumer a fully
 * typed result without resorting to `as any`.
 */

import { Prisma } from '@meeshy/shared/prisma/client';

/**
 * MongoDB "live post" matcher for the `deletedAt` soft-delete column.
 *
 * Prisma's bare `{ deletedAt: null }` filter does NOT match documents where the
 * field is ABSENT on MongoDB — Prisma omits unset optional fields at insert
 * time, so every never-deleted Post stores no `deletedAt` key at all. The naive
 * `null` filter then silently drops EVERY live post, which emptied the feed /
 * reels / stories endpoints in production (all posts returned `data: []` while
 * the collection was full).
 *
 * Match on the field being unset instead — the same `isSet:false` pattern used
 * for `parentId` (commentsPreviewInclude below) and `expiresAt` (PostFeedService).
 * Soft-deleted posts always carry a real `deletedAt` date (`isSet:true`) and so
 * remain excluded.
 */
import { NOT_DELETED } from './softDelete';

// Ré-exporté ici : la plupart des appelants tiennent déjà `postIncludes` pour
// leurs formes de `select`/`include` et lisent le prédicat au même endroit.
export { NOT_DELETED };

export const authorSelect = Prisma.validator<Prisma.UserSelect>()({
  id: true,
  username: true,
  displayName: true,
  avatar: true,
});

/**
 * Story-scoped author shape — `authorSelect` + presence.
 *
 * The story viewer presents an identity interstitial (avatar, name, presence
 * badge) at every author switch; presence must ship WITH the feed payload so
 * the interstitial is complete the instant the switch happens (no lazy
 * resolution after the slide is already on screen). The general post feed
 * keeps the lean `authorSelect`.
 *
 * CHARGER ces deux champs est une décision produit ; les SERVIR bruts n'en est
 * pas une. Cette note a longtemps dit que « la visibilité de story gate déjà
 * l'audience (amis / contacts DM / co-membres de communauté) », ce qui est
 * FAUX de la branche la plus large : `buildPostVisibilityOrFilter` porte
 * `{ visibility: PUBLIC }` sans aucune condition d'audience — une story
 * publique est visible de n'importe quel compte authentifié, qui n'a posé
 * aucun lien. C'est cette phrase, pas le code, qui a laissé la présence sortir
 * brute pendant des mois (cycle 83).
 *
 * Le filtrage vit chez le SERVEUR de la donnée, pas chez sa forme :
 * `PostFeedService.resolveStoryAuthorPresence` passe CHAQUE auteur par
 * `resolveForTargets(viewer, ids)` — critère STRICT, sans exception par
 * audience (directive du 2026-08-25) : la présence d'un auteur n'est servie
 * qu'à lui-même, à ADMIN/BIGBOSS, ou à un ami ACCEPTÉ selon ses préférences.
 * Qu'une story soit adressée `FRIENDS` / `ONLY` / `COMMUNITY` prouve un LIEN
 * (l'auteur a choisi son audience), pas une AMITIÉ — et un lien ne vaut rien
 * pour la présence. Le régime « à deux vitesses » par ligne (strict en PUBLIC,
 * préférences seules dès qu'une ligne prouvait un lien) est SUPPRIMÉ.
 *
 * Derived by spread so any future `authorSelect` field flows through.
 */
export const storyAuthorSelect = Prisma.validator<Prisma.UserSelect>()({
  ...authorSelect,
  isOnline: true,
  lastActiveAt: true,
  // `banner` complète l'interstitiel : c'était le dernier élément encore
  // résolu paresseusement (GET /users/:id par auteur, cf.
  // StoryViewModel.resolveGroupIntro). Même raisonnement que la présence
  // ci-dessus — l'interstitiel doit être complet à l'instant du switch.
  banner: true,
});

/**
 * Canonical media select.
 *
 * Includes the Prisme Linguistique foundation fields:
 *   - language       : base language of this media
 *   - variantOf      : link to the source media when this is an auto-generated variant
 *   - transcription  : Whisper output for the base language
 *   - translations   : per-language TTS variants + sub-titles
 *
 * Adding a new field to PostMedia? Add it here ONCE.
 */
export const mediaSelect = Prisma.validator<Prisma.PostMediaSelect>()({
  id: true,
  fileName: true,
  originalName: true,
  mimeType: true,
  fileSize: true,
  fileUrl: true,
  width: true,
  height: true,
  thumbnailUrl: true,
  thumbHash: true,
  duration: true,
  order: true,
  caption: true,
  alt: true,
  language: true,
  variantOf: true,
  transcription: true,
  translations: true,
});

/**
 * Ordered media include block — the de facto way to attach media to any
 * Post query. Use as: `media: mediaInclude`.
 */
export const mediaInclude = Prisma.validator<Prisma.Post$mediaArgs>()({
  select: mediaSelect,
  orderBy: { order: 'asc' },
});

/**
 * Comment media include — the single media a comment may carry. Reuses
 * `mediaSelect` (same PostMedia shape, same Prisme fields) so a comment's
 * media is decoded identically to a post's media on every client.
 * A comment never holds more than one media, but the relation stays ordered.
 */
export const commentMediaInclude = Prisma.validator<Prisma.PostComment$mediaArgs>()({
  select: mediaSelect,
  orderBy: { order: 'asc' },
});

/**
 * Top-3 comments preview shape attached to every Post response.
 *
 * The `OR isSet:false` clause is REQUIRED — MongoDB documents that were
 * created before `parentId` existed in the schema don't have the field at all,
 * and a bare `parentId: null` filter silently drops them. Removing the OR
 * caused PostAudioService to broadcast `post:updated` payloads with empty
 * comment lists for older threads — see R3 of the stories media-model refactor.
 */
export const commentsPreviewInclude = Prisma.validator<Prisma.Post$commentsArgs>()({
  where: {
    deletedAt: NOT_DELETED,
    OR: [{ parentId: null }, { parentId: { isSet: false } }],
  },
  select: {
    id: true,
    content: true,
    originalLanguage: true,
    translations: true,
    likeCount: true,
    replyCount: true,
    createdAt: true,
    // Rappel projet : tout champ lu par un resolver doit figurer dans son
    // `select`. Sans `metadata` ici, un commentaire portant un lieu partagé
    // (`metadata.location`) l'affiche dans la liste complète des commentaires
    // mais pas dans cet aperçu embarqué sur le post — la position semble
    // disparaître selon la surface consultée par le client.
    metadata: true,
    author: { select: authorSelect },
    // A comment's single media (image/video/audio + Prisme transcription/TTS).
    // Without this the feed/reels comments sheet — which reads top-level
    // comments ONLY from this post-embedded preview, never re-fetching them —
    // loses every comment attachment on reload, and contacts receiving the
    // post:updated broadcast see comments stripped of their media. Reuses the
    // canonical commentMediaInclude so the preview decodes exactly like getComments.
    media: commentMediaInclude,
  },
  orderBy: { likeCount: 'desc' },
  take: 3,
});

/**
 * Les références VISIBLES d'un post — jamais les silencieuses.
 *
 * Le filtre vit dans le `select`, pas dans une projection applicative : une
 * charge utile identique pour tous les lecteurs ne peut pas fuiter. Le détail
 * du post, lui, projette (voir `postReferences.ts`) — mais c'est une lecture
 * unitaire, jamais un feed mis en cache sous une clé partagée.
 *
 * Piège Prisma-Mongo : `{ display: { not: 'SILENT' } }` ne matche PAS les
 * lignes où le champ est ABSENT — c'est-à-dire toutes celles écrites avant le
 * discriminant, qui se lisent pourtant INLINE et doivent donc apparaître. D'où
 * le `OR` explicite sur les trois modes visibles plus l'absence.
 *
 * La relation s'appelle `postMentions`, pas `mentions` : le schéma nomme
 * `Post.postMentions` là où `PostComment.mentions` et `Message.mentions`
 * portent le nom court. La clé EXPOSÉE au client reste `mentions`, via le
 * remappage `withMentions`.
 */
export const postMentionInclude = Prisma.validator<Prisma.Post$postMentionsArgs>()({
  where: {
    OR: [
      { display: { in: ['INLINE', 'PINNED', 'NOTE'] } },
      { display: { isSet: false } },
      { display: null },
    ],
  },
  select: {
    display: true,
    mentionedUser: { select: authorSelect },
  },
});

/**
 * Nested repost preview shape attached to every Post response.
 *
 * Includes `originalLanguage` + `translations` — required by the Prisme
 * Linguistique resolver on the client. Dropping either field strips a
 * repost down to its base language only, breaking translation rendering
 * for any user whose preferred language differs from the source.
 */
export const repostOfInclude = Prisma.validator<Prisma.Post$repostOfArgs>()({
  select: {
    id: true,
    type: true,
    content: true,
    originalLanguage: true,
    translations: true,
    storyEffects: true,
    audioUrl: true,
    moodEmoji: true,
    originalRepostOfId: true,
    author: { select: authorSelect },
    media: mediaInclude,
    createdAt: true,
    likeCount: true,
    commentCount: true,
    // `metadata.location` du post SOURCE — sans ce select, `hoistLocationDeep`
    // n'a rien à hisser sur `repostOf` et un repost perd la position de
    // l'original (même porte que `commentsPreviewInclude.metadata`).
    metadata: true,
    // Compteurs de portée de l'ORIGINAL (chantier reposts cohérents & watermark,
    // tâche 1) — sans eux, un repost affiché ne peut jamais montrer combien de
    // fois l'original a été vu, reposté, partagé ou mis en favori. `PostService`
    // crédite désormais ces mêmes compteurs à travers la chaîne de reposts
    // (voir `recordView` / routes d'impression), ce select les rend visibles.
    viewCount: true,
    repostCount: true,
    shareCount: true,
    bookmarkCount: true,
    impressionCount: true,
    // Les références du post ORIGINAL, sous la MÊME forme que la racine. Sans
    // ce select, `repostOf.mentions` valait TOUJOURS `undefined` : le web, sans
    // jeu validé à opposer au texte cité, retombait sur sa regex locale et
    // linkifiait n'importe quel `@handle` vers un profil inexistant — le lien
    // mort que la validation serveur existe pour supprimer.
    //
    // La constante est PARTAGÉE, pas recopiée : un filtre dupliqué divergerait
    // au premier mode ajouté, et c'est lui qui garde les silencieuses hors
    // d'une charge utile servie à toute une audience.
    postMentions: postMentionInclude,
  },
});

/**
 * G1(b) — lean tray projection for `GET /posts/feed/stories?projection=tray`.
 *
 * The story TRAY renders rings + author + latest thumbnail + viewed state:
 * it needs ids, timestamps, the author and the media rows (thumbnailUrl /
 * thumbHash), NOT the canvas (`storyEffects`), the content translations or
 * the comments preview — which dominate the full-body payload (50 stories
 * shipped whole). Opt-in per request; the full body stays the default so
 * every existing client keeps decoding unchanged. Reposted stories keep a
 * minimal `repostOf` (the shell's own media is empty — the thumbnail lives
 * on the original, same resolution as `toStoryGroups` client-side).
 */
export const trayStorySelect = Prisma.validator<Prisma.PostSelect>()({
  id: true,
  type: true,
  visibility: true,
  createdAt: true,
  updatedAt: true,
  contentEditedAt: true,
  expiresAt: true,
  originalRepostOfId: true,
  viewCount: true,
  author: { select: storyAuthorSelect },
  media: mediaInclude,
  repostOf: {
    select: {
      id: true,
      type: true,
      createdAt: true,
      author: { select: authorSelect },
      media: mediaInclude,
    },
  },
});

/**
 * Canonical post include — single source of truth used by every service that
 * needs a fully-hydrated Post (PostService, PostFeedService, PostAudioService,
 * etc.). DO NOT redeclare a local copy: drift between copies is what caused
 * R1 (feed missing Prisme fields) and R3 (audio service stripping reposts).
 */
export const postInclude = Prisma.validator<Prisma.PostInclude>()({
  author: { select: authorSelect },
  media: mediaInclude,
  comments: commentsPreviewInclude,
  repostOf: repostOfInclude,
  postMentions: postMentionInclude,
});

/**
 * Story-scoped post include — `postInclude` with the presence-carrying
 * author shape (see `storyAuthorSelect`). Derived by spread: adding a
 * relation to `postInclude` flows through here automatically, so the two
 * shapes cannot drift apart.
 */
export const storyPostInclude = Prisma.validator<Prisma.PostInclude>()({
  ...postInclude,
  author: { select: storyAuthorSelect },
});

// ============================================================================
// Derived payload types — consumers get fully-typed results, no `as any`.
// ============================================================================

/** Public-author identity attached to every Post / Comment response. */
export type AuthorPayload = Prisma.UserGetPayload<{ select: typeof authorSelect }>;

/** Single PostMedia row as returned by every Post response. */
export type MediaPayload = Prisma.PostMediaGetPayload<{ select: typeof mediaSelect }>;

/** Fully-hydrated Post — author + media + top-3 comments + repostOf. */
export type PostPayload = Prisma.PostGetPayload<{ include: typeof postInclude }>;
