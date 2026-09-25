import type { ConversationsDeps } from '@/lib/api/conversations';
import type { ApiResult } from '@/lib/api/http';
import { publishStory, type PublishStoryResult } from '@/lib/api/stories-publish';

import type { ChoosableAudience } from './publication-audience';
import type { PublicationKind } from './publication-kind';
import { studioFailureKey, type StudioFailureKey } from './studio-page';
import type { StudioPublication, StudioPublishPlan } from './studio-publish';

/**
 * **L'ENVOI, SÉQUENTIEL, DANS L'ORDRE DES PAGES** (#7707, miroir
 * `StoryViewModel+PublicationUpload.swift:99-125`) — chaque publication du
 * plan (`studioPublishPlan`) part APRÈS que la précédente a RÉUSSI, jamais en
 * parallèle : l'ordre de `createdAt` est l'ordre de lecture du lecteur, et le
 * seau `social:write:create` (10/min, `socialRateLimit.ts:262-263`) se
 * consomme un par un.
 *
 * **Une panne ARRÊTE la séquence** — miroir `guard !Task.isCancelled`
 * (`PublicationUpload.swift:120`) : les publications déjà PARTIES restent
 * parties (leurs identifiants sont rendus), celles qui restaient ne partent
 * jamais. Extrait de l'écran (`routes/story-compose.tsx`) pour que cette loi
 * s'éprouve sans monter un composant.
 */
export type StudioPublishedEvent = { readonly pageIds: readonly string[]; readonly postId: string };

export type StudioPublishOutcome =
  | { readonly kind: 'published'; readonly postIds: readonly string[] }
  | { readonly kind: 'failed'; readonly failure: StudioFailureKey; readonly published: number; readonly total: number }
  | { readonly kind: 'aborted'; readonly published: number; readonly total: number };

export async function runStudioPublish(params: {
  readonly plan: Extract<StudioPublishPlan, { kind: 'ready' }>;
  /** UN envoi réseau — l'appelant y adresse le format, l'audience et la
   * langue, jamais cette fonction : elle ne connaît que l'ORDRE et l'ARRÊT. */
  readonly publish: (publication: StudioPublication) => Promise<ApiResult<{ readonly id: string }>>;
  /** Le geste que CETTE publication vient de commettre — l'appelant y
   * accumule les pages parties (pour les retirer du brouillon) et met à jour
   * la progression affichée (« Publication k/N… »). */
  readonly onPublished?: (event: StudioPublishedEvent) => void;
  readonly signal?: AbortSignal;
}): Promise<StudioPublishOutcome> {
  const total = params.plan.publications.length;
  const postIds: string[] = [];
  for (const publication of params.plan.publications) {
    if (params.signal?.aborted === true) return { kind: 'aborted', published: postIds.length, total };
    const result = await params.publish(publication);
    if (!result.ok) {
      return { kind: 'failed', failure: studioFailureKey(result, 'publish') ?? 'story.studio.failure.unavailable', published: postIds.length, total };
    }
    postIds.push(result.data.id);
    params.onPublished?.({ pageIds: publication.pageIds, postId: result.data.id });
  }
  return { kind: 'published', postIds };
}

/**
 * **L'ENVOI RÉEL D'UN PLAN, EXTRAIT DE L'ÉCRAN** (#7707) — construit la
 * requête `POST /api/v1/posts` de CHAQUE publication (`publishStory`,
 * `lib/api/stories-publish.ts`) et la fait passer par `runStudioPublish`.
 * `originalLanguage` suit `publication.hasText`, jamais un `current.pages`
 * recopié : chaque publication d'une story ne porte SA propre page.
 */
export function publishStudioPlan(params: {
  readonly plan: Extract<StudioPublishPlan, { kind: 'ready' }>;
  readonly api: ConversationsDeps;
  readonly kind: PublicationKind;
  readonly visibility: ChoosableAudience | null;
  readonly language: string;
  readonly onPublished?: (event: StudioPublishedEvent) => void;
}): Promise<StudioPublishOutcome> {
  return runStudioPublish({
    plan: params.plan,
    ...(params.onPublished !== undefined ? { onPublished: params.onPublished } : {}),
    publish: (publication): Promise<ApiResult<PublishStoryResult>> =>
      publishStory({
        ...params.api,
        type: params.kind,
        // **RIEN CHOISI ⇒ LA CLÉ EST ABSENTE** (loi 1, D-111/D-115) : le
        // défaut reste une règle SERVEUR (`core.ts:421`) — jamais un défaut
        // recopié ici.
        ...(params.visibility !== null ? { visibility: params.visibility } : {}),
        ...(publication.hasText ? { originalLanguage: params.language } : {}),
        ...(publication.mediaCaption !== undefined ? { mediaCaption: publication.mediaCaption } : {}),
        storyEffects: publication.storyEffects,
        mediaIds: publication.mediaIds,
      }),
  });
}
