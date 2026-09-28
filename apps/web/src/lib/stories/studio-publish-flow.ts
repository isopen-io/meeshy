import type { ConversationsDeps } from '@/lib/api/conversations';
import type { ApiResult } from '@/lib/api/http';
import { publishStory, type PublishStoryResult } from '@/lib/api/stories-publish';

import type { ChoosableAudience } from './publication-audience';
import type { PublicationKind } from './publication-kind';
import { studioFailureKey, type StudioFailureKey } from './studio-page';
import type { StudioPublication, StudioPublishPlan } from './studio-publish';

/** CE QU'UNE publication vient de commettre, et où en est la séquence —
 * `published` compte celle-ci : l'appelant retire ses pages du brouillon et
 * dit « Publication k/N… » sans tenir un second compteur. */
export type StudioPublishedEvent = {
  readonly pageIds: readonly string[];
  readonly postId: string;
  readonly published: number;
  readonly total: number;
};

/** L'issue d'un envoi — un type SOMME : `published`/`total` voyagent sur les
 * deux issues non terminales, qu'un bandeau ou une file hors ligne liraient de
 * la même façon. */
export type StudioPublishOutcome =
  | { readonly kind: 'published'; readonly postIds: readonly string[] }
  | { readonly kind: 'failed'; readonly failure: StudioFailureKey; readonly published: number; readonly total: number }
  | { readonly kind: 'aborted'; readonly published: number; readonly total: number };

/**
 * **L'ENVOI, SÉQUENTIEL, DANS L'ORDRE DES PAGES** (#7707, miroir
 * `StoryViewModel+PublicationUpload.swift:99-125`) — chaque publication du
 * plan (`studioPublishPlan`) part APRÈS que la précédente a RÉUSSI, jamais en
 * parallèle : l'ordre de `createdAt` est l'ordre de lecture du lecteur, et le
 * seau `social:write:create` (10/min, `socialRateLimit.ts:262-263`) se
 * consomme un par un.
 *
 * **Une panne ARRÊTE la séquence** : les publications déjà PARTIES restent
 * parties, celles qui restaient ne partent jamais. **Le signal ne coupe
 * jamais une requête en vol** — il n'est lu qu'ENTRE deux requêtes (miroir
 * `guard !Task.isCancelled`, `PublicationUpload.swift:120`) : une création
 * abandonnée en route peut avoir été commise côté serveur sans que l'écran le
 * sache, et un retry la publierait deux fois.
 */
export async function runStudioPublish(params: {
  readonly plan: Extract<StudioPublishPlan, { kind: 'ready' }>;
  /** UN envoi réseau — l'appelant y adresse le format, l'audience et la
   * langue, jamais cette fonction : elle ne connaît que l'ORDRE et l'ARRÊT. */
  readonly publish: (publication: StudioPublication) => Promise<ApiResult<{ readonly id: string }>>;
  readonly onPublished?: (event: StudioPublishedEvent) => void;
  readonly signal?: AbortSignal;
}): Promise<StudioPublishOutcome> {
  const total = params.plan.publications.length;
  const postIds: string[] = [];
  for (const publication of params.plan.publications) {
    if (params.signal?.aborted === true) return { kind: 'aborted', published: postIds.length, total };
    const result = await params.publish(publication);
    if (!result.ok) {
      return { kind: 'failed', failure: studioFailureKey(result, 'publish') ?? 'story.studio.failure.network', published: postIds.length, total };
    }
    postIds.push(result.data.id);
    params.onPublished?.({ pageIds: publication.pageIds, postId: result.data.id, published: postIds.length, total });
  }
  return { kind: 'published', postIds };
}

/**
 * **LE CORPS D'UNE PUBLICATION** (#8413) — le texte du post ne part que sous
 * un POST : une story et un réel n'ont pas de corps, tout leur texte vit dans
 * la scène (`storyEffects`, défaut 4 de #6900). Rogné, et absent s'il est
 * vide : la passerelle ne reçoit jamais un `content` blanc.
 */
export function studioPublicationContent(params: { readonly kind: PublicationKind; readonly postText: string }): string | undefined {
  if (params.kind !== 'POST') return undefined;
  const content = params.postText.trim();
  return content === '' ? undefined : content;
}

/**
 * **L'ENVOI RÉEL D'UN PLAN** (#7707) — construit la requête `POST
 * posts.root` de CHAQUE publication (`publishStory`, le port UNIQUE, qui
 * rejoue la garde `MEDIA_NOT_CLAIMED` par requête) et la fait passer par
 * `runStudioPublish`. `originalLanguage` suit `publication.hasText` : chaque
 * story d'une séquence ne dit la langue que de SA page. L'audience est celle
 * du BROUILLON, identique pour toutes (iOS : `upload.visibility`,
 * `PublicationUpload.swift:382-384`).
 */
export function publishStudioPlan(params: {
  readonly plan: Extract<StudioPublishPlan, { kind: 'ready' }>;
  readonly api: ConversationsDeps;
  readonly kind: PublicationKind;
  readonly visibility: ChoosableAudience | null;
  readonly language: string;
  /** Le texte du post du brouillon (#8413) — `studioPublicationContent`
   * décide s'il part. */
  readonly postText?: string;
  readonly onPublished?: (event: StudioPublishedEvent) => void;
  readonly signal?: AbortSignal;
}): Promise<StudioPublishOutcome> {
  const content = studioPublicationContent({ kind: params.kind, postText: params.postText ?? '' });
  return runStudioPublish({
    plan: params.plan,
    ...(params.onPublished !== undefined ? { onPublished: params.onPublished } : {}),
    ...(params.signal !== undefined ? { signal: params.signal } : {}),
    publish: (publication): Promise<ApiResult<PublishStoryResult>> =>
      publishStory({
        ...params.api,
        type: params.kind,
        // **RIEN CHOISI ⇒ LA CLÉ EST ABSENTE** (loi 1, D-111/D-115) : le
        // défaut reste une règle SERVEUR (`core.ts:421`) — jamais un défaut
        // recopié ici.
        ...(params.visibility !== null ? { visibility: params.visibility } : {}),
        // Le corps porte AUSSI une langue : un post dont seul le corps est
        // écrit la déclare, comme un post dont la scène porte du texte.
        ...(publication.hasText || content !== undefined ? { originalLanguage: params.language } : {}),
        ...(content !== undefined ? { content } : {}),
        ...(publication.mediaCaption !== undefined ? { mediaCaption: publication.mediaCaption } : {}),
        ...(publication.mediaAlt !== undefined ? { mediaAlt: publication.mediaAlt } : {}),
        storyEffects: publication.storyEffects,
        mediaIds: publication.mediaIds,
      }),
  });
}
