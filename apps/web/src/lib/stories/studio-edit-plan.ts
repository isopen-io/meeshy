import type { CanvasV3 } from '@meeshy/shared/types/canvas-v3';

import type { ChoosableAudience } from './publication-audience';
import { studioPublishRefusal, type PublicationRefusal } from './publication-kind';
import type { StudioDraft } from './studio';
import type { StudioEditOrigin } from './studio-edit';
import { studioPublishPlan, type SettledPage, type StudioPublication, type StudioPublishPlan } from './studio-publish';

/**
 * **CE QU'UN « ENREGISTRER » ENVOIE** (#9317, miroir
 * `StoryViewModel+PublicationUpload.swift#updateStoryInBackground`) — une loi
 * PURE, calculée UNE fois au geste comme `studioPublishPlan` dont elle reprend
 * la composition (« le PLAYER est l'aperçu » : la même projection pour créer
 * et pour modifier, jamais une seconde).
 *
 * Le contrat de `PUT /posts/:id` (`UpdatePostSchema`) en fixe la forme :
 *  - `storyEffects` porte le document ENTIER, réécrit ;
 *  - `mediaIds` ne porte QUE les médias MONTÉS pendant l'édition — un média
 *    déjà rattaché n'est pas réclamable une seconde fois ;
 *  - `removeMediaIds` porte ceux de la publication qu'aucune page ne
 *    référence plus (scène supprimée, fond remplacé) ;
 *  - `mediaCaption`/`mediaAlt` ne valent que pour les médias de `mediaIds`
 *    (la passerelle ignore les autres) ;
 *  - `content` ne part que CHANGÉ, et vide pour l'effacer — absent, la
 *    passerelle le garde ; jamais pour une story ni un réel, dont le texte
 *    vit dans la scène ;
 *  - `visibility` ne part que CHANGÉE ; `originalLanguage` seulement quand la
 *    publication n'en déclarait aucune et qu'elle porte désormais du texte.
 *
 * **UNE STORY EST UNE SCÈNE** (canal `scene`) : la PREMIÈRE page part en
 * `PUT` sur la story ouverte, chaque page AJOUTÉE devient une story NEUVE par
 * le chemin de publication ordinaire (`creations`, un plan `ready` que
 * `publishStudioPlan` envoie tel quel). La suppression d'une page s'arrête à
 * la dernière (`withoutPage`) : la story ouverte garde toujours une scène.
 */
export type StudioPostUpdateBody = {
  readonly storyEffects: CanvasV3;
  readonly content?: string;
  readonly originalLanguage?: string;
  readonly visibility?: ChoosableAudience;
  readonly mediaIds?: readonly string[];
  readonly removeMediaIds?: readonly string[];
  readonly mediaCaption?: Record<string, string>;
  readonly mediaAlt?: Record<string, string>;
};

export type StudioPostUpdate = {
  readonly postId: string;
  /** Les pages que ce `PUT` porte — celles des `creations` partent à part. */
  readonly pageIds: readonly string[];
  readonly body: StudioPostUpdateBody;
};

export type StudioEditSavePlan =
  | { readonly kind: 'unresolved' }
  | { readonly kind: 'empty' }
  | { readonly kind: 'refused'; readonly refusal: PublicationRefusal }
  | {
      readonly kind: 'ready';
      readonly update: StudioPostUpdate;
      readonly creations: Extract<StudioPublishPlan, { kind: 'ready' }> | null;
    };

/** Les entrées d'une carte `{ postMediaId → texte }` restreintes à `ids` —
 * absente quand il n'en reste aucune. */
function restricted(map: Record<string, string> | undefined, ids: readonly string[]): Record<string, string> | undefined {
  if (map === undefined) return undefined;
  const kept = Object.fromEntries(Object.entries(map).filter(([id]) => ids.includes(id)));
  return Object.keys(kept).length === 0 ? undefined : kept;
}

function updateBody(params: {
  readonly origin: StudioEditOrigin;
  readonly draft: StudioDraft;
  readonly publication: StudioPublication;
  readonly language: string;
}): StudioPostUpdateBody {
  const { origin, draft, publication } = params;
  const attached = publication.mediaIds.filter((id) => !origin.mediaIds.includes(id));
  const removed = origin.mediaIds.filter((id) => !publication.mediaIds.includes(id));
  const nextContent = draft.postText.trim();
  const content = origin.kind === 'POST' && nextContent !== origin.content.trim() ? nextContent : undefined;
  const declaresLanguage = origin.originalLanguage === null && (publication.hasText || (content !== undefined && content !== ''));
  const visibility = draft.visibility !== null && draft.visibility !== origin.visibility ? draft.visibility : undefined;
  const mediaCaption = restricted(publication.mediaCaption, attached);
  const mediaAlt = restricted(publication.mediaAlt, attached);
  return {
    storyEffects: publication.storyEffects,
    ...(content !== undefined ? { content } : {}),
    ...(declaresLanguage ? { originalLanguage: params.language } : {}),
    ...(visibility !== undefined ? { visibility } : {}),
    ...(attached.length > 0 ? { mediaIds: attached } : {}),
    ...(removed.length > 0 ? { removeMediaIds: removed } : {}),
    ...(mediaCaption !== undefined ? { mediaCaption } : {}),
    ...(mediaAlt !== undefined ? { mediaAlt } : {}),
  };
}

export function studioEditSavePlan(params: {
  readonly origin: StudioEditOrigin;
  readonly draft: StudioDraft;
  readonly settled: ReadonlyMap<string, SettledPage>;
  readonly language: string;
}): StudioEditSavePlan {
  const { origin, draft } = params;
  const refusal = studioPublishRefusal(draft, origin.kind);
  if (refusal !== null) return { kind: 'refused', refusal };
  const plan = studioPublishPlan({ pages: draft.pages, settled: params.settled, choice: { kind: origin.kind, layout: origin.layout } });
  if (plan.kind !== 'ready') return plan;
  const [publication, ...rest] = plan.publications;
  if (publication === undefined) return { kind: 'empty' };
  return {
    kind: 'ready',
    update: { postId: origin.postId, pageIds: publication.pageIds, body: updateBody({ origin, draft, publication, language: params.language }) },
    creations: rest.length === 0 ? null : { kind: 'ready', publications: rest },
  };
}
