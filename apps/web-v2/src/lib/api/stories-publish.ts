import { CanvasV3Schema, type CanvasV3 } from '@meeshy/shared/types/canvas-v3';

import { unclaimedStoryMediaIds } from '@/lib/stories/story-document';

import { CANVAS_CAPS_HEADERS } from './feed-pages';
import type { ApiResult, HttpTransport } from './http';

/**
 * LE PORT DE PUBLICATION D'UNE STORY (#6900, § 3.3 de la spécification) —
 * `POST /api/v1/posts` (`services/gateway/src/routes/posts/core.ts:370-462`),
 * `type: 'STORY'`. Le client REJOUE les DEUX gardes serveur AVANT tout envoi,
 * drapeau `CANVAS_V3_WRITE_STRICT` armé ou non (« le client valide lui-même
 * par CanvasV3Schema.safeParse et cite chaque postMediaId dans mediaIds,
 * drapeau armé ou non ») : un document invalide ou un média non réclamé ne
 * part jamais sur le réseau, jamais un aller-retour pour apprendre ce que ce
 * module savait déjà côté client.
 *
 * `CANVAS_CAPS_HEADERS` part comme sur les trois autres ports de
 * `lib/api/stories.ts` — une seule forme d'appel, même si ce port n'a besoin
 * que de `data.id` (§3.3 : « le client n'a besoin que de data.id, mais envoie
 * … comme les trois ports de stories.ts »).
 */
export type PublishStoryParams = {
  readonly transport: HttpTransport;
  readonly content: string;
  readonly originalLanguage?: string;
  readonly storyEffects: CanvasV3;
  readonly mediaIds: readonly string[];
  readonly signal?: AbortSignal;
};

export type PublishStoryResult = { readonly id: string };

export async function publishStory(params: PublishStoryParams): Promise<ApiResult<PublishStoryResult>> {
  const parsed = CanvasV3Schema.safeParse(params.storyEffects);
  if (!parsed.success) {
    return { ok: false, status: 0, error: 'Document de story invalide', code: 'CANVAS_INVALID' };
  }

  const unclaimed = unclaimedStoryMediaIds(parsed.data, params.mediaIds);
  if (unclaimed.length > 0) {
    return { ok: false, status: 0, error: 'Un média de la story n’a pas été référencé', code: 'MEDIA_NOT_CLAIMED' };
  }

  return params.transport.request<PublishStoryResult>({
    method: 'POST',
    path: '/api/v1/posts',
    headers: CANVAS_CAPS_HEADERS,
    body: {
      type: 'STORY',
      content: params.content,
      ...(params.originalLanguage !== undefined ? { originalLanguage: params.originalLanguage } : {}),
      storyEffects: parsed.data,
      mediaIds: params.mediaIds,
    },
    ...(params.signal !== undefined ? { signal: params.signal } : {}),
  });
}
