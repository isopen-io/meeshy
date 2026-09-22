import { qualifiesAsReel } from '@meeshy/shared/utils/reel-composition';

import type { ConversationsDeps } from './conversations';
import type { ApiResult } from './http';

/**
 * **LE PORT DE PUBLICATION D'UN POST ET D'UN RÉEL** (#7449) — `POST /api/v1/posts`
 * (`services/gateway/src/routes/posts/core.ts`), `type: 'POST' | 'REEL'`.
 *
 * C'est la JUMELLE DÉCLARÉE de `stories-publish.ts` : même route, même
 * transport, autre `type` — et rien d'autre en commun, parce qu'une story
 * publie un CANEVAS (`storyEffects`) quand un post publie un TEXTE et des
 * MÉDIAS. Les fondre aurait demandé un paramètre pour chaque moitié absente.
 *
 * **`visibility` n'est PAS envoyée**, pour la même raison qu'en story : le
 * défaut est une règle SERVEUR (`defaultVisibilityForPostType`, PUBLIC hors
 * story), et un défaut recopié côté client est exactement ce qui avait laissé
 * les stories web à FRIENDS pendant que les posts naissaient publics
 * (`DEFAULT_PUBLICATION_VISIBILITY`, `packages/shared/types/post.ts`). Le jour
 * où ce composeur offrira une audience, elle partira parce que l'auteur l'aura
 * CHOISIE, jamais parce qu'un littéral la répète.
 */
export type PublishPostType = 'POST' | 'REEL';

/**
 * **CE QUI FAIT QU'UN RÉEL EST UN RÉEL** — `qualifiesAsReel`
 * (`packages/shared/utils/reel-composition.ts`), la SOURCE UNIQUE que le
 * gateway lui-même consomme (`PostService.createPost`) : une vidéo ou un audio
 * d'au moins trois secondes, ou au moins deux images.
 *
 * Il est réexporté ici plutôt que réécrit, et c'est tout le sujet : sans lui,
 * un réel de texte seul partait et le serveur le DÉGRADAIT en post
 * (`createPost: REEL non qualifiant dégradé en POST`) — l'auteur choisissait un
 * format et en obtenait un autre, sans un mot. iOS refuse en le DISANT
 * (`ComposerDocumentSendRefusal.reelWithoutQualifyingMedia`) ; le web fait
 * pareil, par la même règle.
 */
export { qualifiesAsReel } from '@meeshy/shared/utils/reel-composition';

/** Un média DÉJÀ MONTÉ, tel que la qualification et la publication le lisent. */
export type PublishableMedia = {
  readonly postMediaId: string;
  readonly mimeType: string;
  /** MILLISECONDES — l'unité de `PostMedia.duration`, et celle que
   * `qualifiesAsReel` compare à ses trois secondes. `null` quand le navigateur
   * n'a pas su décoder les métadonnées : une durée INCONNUE ne qualifie jamais
   * (jamais de repli permissif). */
  readonly durationMs?: number | null;
};

export type PublishPostParams = ConversationsDeps & {
  readonly type: PublishPostType;
  /** `Post.content` — le corps de la publication, jamais « la légende » d'un
   * média (`PostMedia.caption`, un troisième contenu du dépôt). Borné à 5000
   * par `CreatePostSchema`. */
  readonly content?: string;
  readonly originalLanguage?: string;
  readonly media: readonly PublishableMedia[];
  readonly signal?: AbortSignal;
};

export type PublishPostResult = { readonly id: string };

/** La borne de `CreatePostSchema.content` — relue ici pour que la saisie
 * s'arrête AVANT l'envoi plutôt qu'après un 400. */
export const POST_CONTENT_MAX_LENGTH = 5000;

/**
 * **CE QU'UN POST DOIT PORTER POUR PARTIR** — miroir de `hasAnyContentCarrier`
 * (`CreatePostSchema`, qui refuse un post vide en 400) : un texte non blanc ou
 * au moins un média. Rejoué ici pour que le bouton s'éteigne plutôt que de
 * promettre un envoi que le serveur refusera.
 */
export function carriesSomething(params: { readonly content: string; readonly media: readonly PublishableMedia[] }): boolean {
  return params.content.trim() !== '' || params.media.length > 0;
}

export type PublishRefusal = 'empty' | 'reel-without-qualifying-media';

/**
 * Pourquoi un brouillon ne part PAS — `null` quand il part. Une VALEUR, jamais
 * un booléen : « ça ne part pas » ne se traduit pas, « il manque une vidéo de
 * trois secondes ou deux images » se traduit.
 */
export function publishRefusalOf(params: {
  readonly type: PublishPostType;
  readonly content: string;
  readonly media: readonly PublishableMedia[];
}): PublishRefusal | null {
  if (!carriesSomething(params)) return 'empty';
  if (params.type === 'REEL' && !qualifiesAsReel(params.media.map((m) => ({ mimeType: m.mimeType, duration: m.durationMs ?? null })))) {
    return 'reel-without-qualifying-media';
  }
  return null;
}

let fixturePublications = 0;

export async function publishPost(params: PublishPostParams): Promise<ApiResult<PublishPostResult>> {
  const content = params.content ?? '';
  const refusal = publishRefusalOf({ type: params.type, content, media: params.media });
  if (refusal !== null) {
    return {
      ok: false,
      status: 0,
      error:
        refusal === 'empty'
          ? 'Une publication doit porter un texte ou un média'
          : 'Un réel demande une vidéo, un son, ou au moins deux images',
      code: refusal === 'empty' ? 'POST_EMPTY' : 'REEL_NOT_QUALIFYING',
    };
  }

  if (__FIXTURES__ && params.source === 'fixtures') {
    fixturePublications += 1;
    return { ok: true, data: { id: `fx-post-${fixturePublications}` } };
  }

  return params.transport.request<PublishPostResult>({
    method: 'POST',
    path: '/api/v1/posts',
    body: {
      type: params.type,
      ...(content.trim() === '' ? {} : { content }),
      ...(params.originalLanguage !== undefined ? { originalLanguage: params.originalLanguage } : {}),
      ...(params.media.length === 0 ? {} : { mediaIds: params.media.map((m) => m.postMediaId) }),
    },
    ...(params.signal !== undefined ? { signal: params.signal } : {}),
  });
}
