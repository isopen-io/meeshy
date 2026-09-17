import type { CanvasV3 } from '@meeshy/shared/types/canvas-v3';

import { unclaimedStoryMediaIds } from '@/lib/stories/story-document';

import type { ConversationsDeps } from './conversations';
import { CANVAS_CAPS_HEADERS } from './feed-pages';
import type { ApiResult } from './http';

/**
 * LE PORT DE PUBLICATION D'UNE STORY (#6900, § 3.3 de la spécification) —
 * `POST /api/v1/posts` (`services/gateway/src/routes/posts/core.ts:370-462`),
 * `type: 'STORY'`. `CANVAS_CAPS_HEADERS` part comme sur les trois autres ports
 * de `lib/api/stories.ts` ; `visibility` n'est PAS envoyée (la passerelle pose
 * `FRIENDS` pour une story, `core.ts:421`).
 *
 * **La garde `MEDIA_NOT_CLAIMED` est rejouée AVANT tout envoi** (`core.ts:146-158`) :
 * un objet qui adresse un `postMediaId` absent de `mediaIds` pointerait dans
 * le vide, drapeau serveur armé ou non — le port refuse, aucun octet ne part.
 *
 * **`CanvasV3Schema` n'est PAS rejoué à l'exécution (revue-correction)** :
 * il est déclaré avec le `zod` COMPLET, et Rollup range tout `zod` sous UN
 * chunk — celui que la vingtaine d'écrans validant en `zod/mini` (profil,
 * communautés, liens, appels…) téléchargent. Mesuré : ce chunk passait de
 * 5,53 à 18,75 Ko gzip pour tous ces écrans ; séparer `zod/v4/classic` n'en
 * sortait que 4,49 (le noyau partagé grossit avec ce que le complet utilise).
 * Le document ne vient d'aucune saisie structurelle : il sort d'UN composeur
 * TYPÉ (`composeStoryCanvas`, `CanvasV3`) dont CHAQUE forme possible est
 * prouvée contre `CanvasV3Schema` par `story-document.test.ts`. La passerelle
 * reste juge (`CANVAS_INVALID`, `core.ts:118-129`), et son refus se dit.
 */
export type PublishStoryParams = ConversationsDeps & {
  /**
   * La LÉGENDE — distincte du texte de scène (`storyEffects`, § modèle § 3).
   * Le studio (#6900) n'a AUCUN champ légende : il n'en envoie jamais. Un
   * futur appelant qui en gagne un l'y pose ; tant qu'aucun n'existe, ce
   * champ reste absent du corps (jamais une chaîne vide POSÉE quand même) —
   * miroir du `content: nil` iOS quand le texte vit dans le canevas
   * (`StoryViewModel+PublicationUpload.swift:378-391`).
   */
  readonly content?: string;
  readonly originalLanguage?: string;
  readonly storyEffects: CanvasV3;
  readonly mediaIds: readonly string[];
  readonly signal?: AbortSignal;
};

export type PublishStoryResult = { readonly id: string };

let fixturePublications = 0;

export async function publishStory(params: PublishStoryParams): Promise<ApiResult<PublishStoryResult>> {
  const unclaimed = unclaimedStoryMediaIds(params.storyEffects, params.mediaIds);
  if (unclaimed.length > 0) {
    return { ok: false, status: 0, error: 'Un média de la story n’a pas été référencé', code: 'MEDIA_NOT_CLAIMED' };
  }

  if (__FIXTURES__ && params.source === 'fixtures') {
    fixturePublications += 1;
    return { ok: true, data: { id: `fx-story-${fixturePublications}` } };
  }

  return params.transport.request<PublishStoryResult>({
    method: 'POST',
    path: '/api/v1/posts',
    headers: CANVAS_CAPS_HEADERS,
    body: {
      type: 'STORY',
      ...(params.content !== undefined && params.content !== '' ? { content: params.content } : {}),
      ...(params.originalLanguage !== undefined ? { originalLanguage: params.originalLanguage } : {}),
      storyEffects: params.storyEffects,
      mediaIds: params.mediaIds,
    },
    ...(params.signal !== undefined ? { signal: params.signal } : {}),
  });
}
