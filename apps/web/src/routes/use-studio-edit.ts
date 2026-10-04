import type { ConversationsDeps } from '@/lib/api/conversations';
import { appQueryClient } from '@/lib/api/query-client';
import { STORIES_QUERY_PREFIX } from '@/lib/api/stories';
import type { StudioDraft } from '@/lib/stories/studio';
import type { StudioEditOrigin } from '@/lib/stories/studio-edit';
import { saveStudioEdit } from '@/lib/stories/studio-edit-flow';
import { studioEditSavePlan } from '@/lib/stories/studio-edit-plan';
import { createStudioDraftStore } from '@/lib/stories/studio-draft-store';
import type { SettledPage } from '@/lib/stories/studio-publish';
import { revokePageMedia } from '@/routes/story-compose-place';
import type { StudioPublishFailureNotice } from '@/routes/story-compose-footer';

/**
 * **LE STUDIO ROUVERT SUR UNE PUBLICATION** (#9317) — ce que la route
 * `/posts/:id/edit` (`publication-edit.tsx`) remet au studio : le brouillon
 * HYDRATÉ (`studioEditHydration`), l'origine que l'enregistrement compare, et
 * les deux sorties que la route décide (où revenir).
 */
export type StudioEdit = {
  readonly draft: StudioDraft;
  readonly origin: StudioEditOrigin;
  /** Enregistré : la route ramène l'auteur d'où il vient. */
  readonly onSaved: () => void;
  /** ✕ : abandonner la modification, rien ne part. */
  readonly onCancel: () => void;
};

/** Une modification ne touche AUCUN brouillon de création : le magasin est
 * en mémoire seule, et le studio l'ouvre sans lecteur (rien n'y est écrit). */
export const EDIT_DRAFTS = createStudioDraftStore(null);

/**
 * **« ENREGISTRER »** (#9317) — ce que `publish()` du studio fait en édition,
 * une fois les montées réglées : la loi pure (`studioEditSavePlan`) sur le
 * brouillon TEL QU'IL EST, puis l'envoi (`saveStudioEdit`). Les mêmes états
 * d'écran que la publication (capsule en vol, progression, échec dit au pied),
 * jamais un second vocabulaire. Sorti de `story-compose.tsx` (budget de taille).
 */
export function studioEditSaver(params: {
  readonly edit: StudioEdit;
  readonly api: ConversationsDeps;
  readonly language: string;
  readonly latest: { readonly current: StudioDraft };
  readonly sendRef: { current: AbortController | null };
  readonly setPublishing: (value: boolean) => void;
  readonly setPublishFailure: (value: StudioPublishFailureNotice | null) => void;
  readonly setPublishProgress: (value: { readonly published: number; readonly total: number } | null) => void;
  /** Une story NEUVE est partie : sa page quitte le brouillon (#7707). */
  readonly dropPublished: (pageIds: readonly string[]) => void;
}): (settled: ReadonlyMap<string, SettledPage>) => Promise<void> {
  const { edit, setPublishing, setPublishFailure, setPublishProgress } = params;
  return async (settled) => {
    const current = params.latest.current;
    const plan = studioEditSavePlan({ origin: edit.origin, draft: current, settled, language: params.language });
    if (plan.kind !== 'ready') {
      setPublishing(false);
      return;
    }
    const send = new AbortController();
    params.sendRef.current = send;
    setPublishProgress({ published: 0, total: 1 + (plan.creations?.publications.length ?? 0) });
    const outcome = await saveStudioEdit({
      plan,
      api: params.api,
      queryClient: appQueryClient,
      kind: edit.origin.kind,
      visibility: current.visibility,
      language: params.language,
      signal: send.signal,
      onPublished: ({ pageIds, published, total }) => {
        params.dropPublished(pageIds);
        setPublishProgress({ published, total });
      },
    });
    if (outcome.kind !== 'published') {
      setPublishProgress(null);
      setPublishing(false);
      if (outcome.kind === 'failed') setPublishFailure({ failure: outcome.failure, published: outcome.published, total: outcome.total });
      return;
    }
    current.pages.forEach(revokePageMedia);
    if (edit.origin.kind === 'STORY') await appQueryClient.invalidateQueries({ queryKey: STORIES_QUERY_PREFIX });
    if (!send.signal.aborted) edit.onSaved();
  };
}
