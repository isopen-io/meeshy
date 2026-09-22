import { MAX_POST_MEDIA } from '@meeshy/shared/types/attachment';

import { publishRefusalOf, type PublishPostType, type PublishRefusal, type PublishableMedia } from '@/lib/api/posts-publish';

/**
 * **LE BROUILLON D'UNE PUBLICATION** (#7449) — l'état PUR du composeur, hors
 * de l'écran qui le peint.
 *
 * Il vit ici, et pas dans `routes/post-compose.tsx`, pour la raison qui a fait
 * naître `lib/stories/studio.ts` : ce qu'on veut éprouver d'un composeur —
 * « ajouter puis retirer un média rend le brouillon vide », « un réel d'une
 * seule image est refusé », « un envoi raté ne compte pas dans la
 * qualification » — sont des LOIS sans DOM. Les tenir dans l'écran obligerait
 * à monter un navigateur pour prouver de l'arithmétique.
 */

/** Réexporté depuis la SOURCE UNIQUE du dépôt (`@meeshy/shared`), jamais un
 * `10` recopié : le plafond a déjà vécu en cinq exemplaires. */
export { MAX_POST_MEDIA };

export type DraftUpload =
  | { readonly phase: 'sending' }
  | { readonly phase: 'ready'; readonly postMediaId: string }
  | { readonly phase: 'failed' };

export type DraftMedia = {
  /** L'identité LOCALE de la ligne — stable dès la sélection, bien avant que
   * la passerelle n'ait rendu un `postMediaId`. C'est elle que la clé de rendu
   * et le retrait emploient : un index se décale au premier retrait. */
  readonly key: string;
  readonly name: string;
  readonly mimeType: string;
  /** `blob:` — à révoquer au retrait ET au démontage. */
  readonly previewUrl: string;
  /** MILLISECONDES, mesurées sur le fichier LOCAL. `null` quand le navigateur
   * n'a pas su décoder les métadonnées : une durée inconnue ne qualifie jamais
   * un réel (`qualifiesAsReel`). */
  readonly durationMs: number | null;
  readonly upload: DraftUpload;
};

export type PostDraft = {
  readonly type: PublishPostType;
  readonly content: string;
  readonly media: readonly DraftMedia[];
};

export function emptyDraft(type: PublishPostType): PostDraft {
  return { type, content: '', media: [] };
}

export function withType(draft: PostDraft, type: PublishPostType): PostDraft {
  return { ...draft, type };
}

export function withContent(draft: PostDraft, content: string): PostDraft {
  return { ...draft, content };
}

/** Ajoute en RESPECTANT le plafond — ce qui dépasse est écarté ici, jamais
 * envoyé pour être refusé en 400. */
export function withMediaAdded(draft: PostDraft, added: readonly DraftMedia[]): PostDraft {
  const room = Math.max(0, MAX_POST_MEDIA - draft.media.length);
  return { ...draft, media: [...draft.media, ...added.slice(0, room)] };
}

export function withMediaRemoved(draft: PostDraft, key: string): PostDraft {
  return { ...draft, media: draft.media.filter((item) => item.key !== key) };
}

export function withUpload(draft: PostDraft, key: string, upload: DraftUpload): PostDraft {
  return { ...draft, media: draft.media.map((item) => (item.key === key ? { ...item, upload } : item)) };
}

/**
 * CE QUI COMPTE POUR QUALIFIER UN RÉEL — tout ce qui n'a pas ÉCHOUÉ, y compris
 * ce qui est encore en vol : son type et sa durée sont connus du FICHIER LOCAL
 * dès la sélection, et la publication attend les envois en cours de toute
 * façon. Éteindre le bouton pendant la montée d'une vidéo de huit secondes
 * dirait « ce réel ne qualifie pas » d'un réel qui qualifie.
 */
export function qualifyingMedia(draft: PostDraft): readonly PublishableMedia[] {
  return draft.media
    .filter((item) => item.upload.phase !== 'failed')
    .map((item) => ({
      postMediaId: item.upload.phase === 'ready' ? item.upload.postMediaId : item.key,
      mimeType: item.mimeType,
      durationMs: item.durationMs,
    }));
}

/** Ce qui peut réellement PARTIR : les médias dont la passerelle a rendu un id. */
export function publishableMedia(draft: PostDraft): readonly PublishableMedia[] {
  return draft.media.flatMap((item) =>
    item.upload.phase === 'ready'
      ? [{ postMediaId: item.upload.postMediaId, mimeType: item.mimeType, durationMs: item.durationMs }]
      : [],
  );
}

/** Un envoi est-il encore en vol ? La publication l'ATTEND (elle ne le refuse
 * pas) — même discipline que le studio des stories. */
export function hasPendingUpload(draft: PostDraft): boolean {
  return draft.media.some((item) => item.upload.phase === 'sending');
}

/** Un envoi a-t-il ÉCHOUÉ ? L'écran le DIT — un média qui ne partira pas sans
 * que rien ne le signale est une publication amputée en silence. */
export function hasFailedUpload(draft: PostDraft): boolean {
  return draft.media.some((item) => item.upload.phase === 'failed');
}

/**
 * Pourquoi ce brouillon ne part pas — la MÊME loi que le port
 * (`publishRefusalOf`), appliquée à la composition qualifiante ci-dessus.
 * `null` ⇒ le bouton s'allume.
 */
export function draftRefusal(draft: PostDraft): PublishRefusal | null {
  return publishRefusalOf({ type: draft.type, content: draft.content, media: qualifyingMedia(draft) });
}

export function draftIsEmpty(draft: PostDraft): boolean {
  return draft.content.trim() === '' && draft.media.length === 0;
}
