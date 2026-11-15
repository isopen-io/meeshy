import type { QueryClient } from '@tanstack/react-query';

import type { ConversationsDeps } from '@/lib/api/conversations';
import { updatePublication } from '@/lib/api/publication-update';

import type { ChoosableAudience } from './publication-audience';
import type { PublicationKind } from './publication-kind';
import type { StudioEditSavePlan } from './studio-edit-plan';
import { studioFailureKey } from './studio-page';
import { publishStudioPlan, type StudioPublishedEvent, type StudioPublishOutcome } from './studio-publish-flow';

/**
 * **L'ENVOI D'UN « ENREGISTRER »** (#9317) — le `PUT` de la publication
 * rouverte d'abord (`updatePublication`, optimiste sur les caisses), puis les
 * stories NEUVES des scènes ajoutées, par le chemin de publication ordinaire
 * (`publishStudioPlan` : séquentiel, une panne arrête la séquence, une page
 * partie quitte le brouillon par `onPublished`).
 *
 * **Un `PUT` refusé arrête tout** : aucune scène ajoutée ne part sur une story
 * qui n'a pas été modifiée. Rejouer après un échec PARTIEL renvoie le même
 * `PUT` (le même document : sans effet de plus) et seulement les stories qui
 * n'étaient pas parties — `onPublished` les a retirées du brouillon.
 *
 * L'issue est celle d'une publication (`StudioPublishOutcome`) : la capsule et
 * le pied du studio la disent sans un second vocabulaire. `postIds` ouvre par
 * la publication modifiée.
 */
export async function saveStudioEdit(params: {
  readonly plan: Extract<StudioEditSavePlan, { kind: 'ready' }>;
  readonly api: ConversationsDeps;
  readonly queryClient: QueryClient;
  readonly kind: PublicationKind;
  readonly visibility: ChoosableAudience | null;
  readonly language: string;
  readonly onPublished?: (event: StudioPublishedEvent) => void;
  readonly signal?: AbortSignal;
}): Promise<StudioPublishOutcome> {
  const { plan } = params;
  const total = 1 + (plan.creations?.publications.length ?? 0);
  const updated = await updatePublication({
    postId: plan.update.postId,
    body: plan.update.body,
    deps: { ...params.api, queryClient: params.queryClient },
    ...(params.signal !== undefined ? { signal: params.signal } : {}),
  });
  if (!updated.ok) {
    return { kind: 'failed', failure: studioFailureKey(updated, 'publish') ?? 'story.studio.failure.network', published: 0, total };
  }
  if (plan.creations === null) return { kind: 'published', postIds: [plan.update.postId] };
  const created = await publishStudioPlan({
    plan: plan.creations,
    api: params.api,
    kind: params.kind,
    visibility: params.visibility,
    language: params.language,
    ...(params.signal !== undefined ? { signal: params.signal } : {}),
    onPublished: (event) => params.onPublished?.({ ...event, published: event.published + 1, total }),
  });
  if (created.kind === 'published') return { kind: 'published', postIds: [plan.update.postId, ...created.postIds] };
  return { ...created, published: created.published + 1, total };
}
