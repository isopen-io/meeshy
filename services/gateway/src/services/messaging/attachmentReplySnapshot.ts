/**
 * LA PIÈCE NOMMÉE D'UNE RÉPONSE — la forme figée, et la liste de ce qui ne peut
 * PAS l'être (#6164, arbitrage porteur du 2026-09-12 sur #6123, voie C hybride).
 *
 * Répondre à une conversation ne cite plus seulement un MESSAGE : on peut viser
 * la troisième photo d'un carrousel de cinq. Ce que la réponse GRAVE, elle le
 * grave pour toujours — donc elle ne grave que ce qui ne peut jamais devenir un
 * secret :
 *
 * | FIGÉ dans `metadata.attachmentReplyTo` | RELU à chaque service, via `mediaMayTravel` |
 * |---|---|
 * | `attachmentId` — l'ancre du saut | la vignette / `fileUrl` / le ThumbHash |
 * | `kind` — la NATURE du média | le nom de fichier, la taille |
 * | | la **DURÉE**, la transcription, la forme d'onde |
 *
 * Le PRÉCÉDENT du dépôt est `protectedPreview()`
 * (`services/notifications/NotificationService.ts`) : d'un contenu protégé, il
 * ne divulgue QUE l'icône de protection et l'icône de TYPE
 * (`contentTypeIcon`). La nature est donc le seul fait qu'on ait le droit de
 * figer. **La DURÉE ne peut pas l'être** — le cycle 125 la NOMME dans ce qu'une
 * protection doit garder (« texte, fichier, nom de fichier, taille, durée,
 * vignette, URL »).
 *
 * La voie A (instantané intégral, comme `postReplyTo`) est EXCLUE : un
 * instantané ne se relit pas, donc il survivrait à une protection posée APRÈS
 * la réponse et à la suppression de la pièce. `postReplyTo` a le droit de
 * survivre à l'expiration de son post — c'est sa fonctionnalité ; une vignette
 * de pièce jointe, non.
 *
 * **La liste des champs RÉVOCABLES vit ICI, à côté de la forme**, jamais
 * dispersée chez ses lecteurs : sans ce voisinage, le premier lecteur qui fige
 * un champ de plus le ferait sans qu'aucun témoin tombe.
 *
 * AUCUNE MIGRATION : `Message.metadata Json?` existe déjà
 * (`packages/shared/prisma/schema.prisma:781`), et `postReplySnapshot.ts` est
 * le motif éprouvé du même rangement.
 */

/** La NATURE du média cité — le seul fait, avec l'ancre, qui a le droit d'être figé. */
export type AttachmentReplyKind = 'image' | 'video' | 'audio' | 'location' | 'file';

const KINDS: readonly AttachmentReplyKind[] = ['image', 'video', 'audio', 'location', 'file'];

/** Ce que `metadata.attachmentReplyTo` porte, et RIEN d'autre. */
export type AttachmentReplyTo = {
  readonly attachmentId: string;
  readonly kind: AttachmentReplyKind;
};

/**
 * Les DEUX champs figés. Une liste, pas un commentaire : `parseAttachmentReplyTo`
 * la projette, si bien qu'un champ de plus ajouté à la forme sans être ajouté
 * ici ne franchit jamais la frontière.
 */
export const ATTACHMENT_REPLY_FROZEN_FIELDS = ['attachmentId', 'kind'] as const;

/**
 * Ce qui se RELIT à chaque service et que `mediaMayTravel` retient pièce par
 * pièce — jamais figé dans l'instantané. Énumérée ici pour que le témoin qui
 * garde la frontière puisse la lire : une liste que personne ne peut consulter
 * n'est pas une frontière.
 */
export const ATTACHMENT_REPLY_REVOCABLE_FIELDS = [
  'fileUrl',
  'thumbnailUrl',
  'thumbHash',
  'fileName',
  'originalName',
  'fileSize',
  'duration',
  'width',
  'height',
  'transcription',
  'waveform',
] as const;

/**
 * La nature d'une pièce depuis son MIME — la MÊME lecture que
 * `contentTypeIcon` (`NotificationService.ts`) et que `AttachmentKind(mimeType:)`
 * côté iOS. Un MIME absent vaut `file` : on ne sait pas, mais on sait que c'est
 * une pièce jointe.
 */
export function attachmentReplyKindFor(mimeType: string | null | undefined): AttachmentReplyKind {
  if (!mimeType) return 'file';
  if (mimeType === 'application/x-location') return 'location';
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  return 'file';
}

/**
 * La frontière, appliquée : un objet quelconque devient un instantané VALIDE ou
 * `null`. La projection est explicite — tout champ qui n'est pas figé est
 * laissé dehors, y compris (et surtout) quand l'appelant l'a envoyé.
 */
export function parseAttachmentReplyTo(input: unknown): AttachmentReplyTo | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const row = input as Record<string, unknown>;
  const attachmentId = typeof row['attachmentId'] === 'string' ? row['attachmentId'].trim() : '';
  if (attachmentId.length === 0) return null;
  const declared = row['kind'];
  const kind = KINDS.find((k) => k === declared);
  if (!kind) return null;
  return { attachmentId, kind };
}

/** Relit l'instantané gravé sur le message qui CITE. */
export function attachmentReplyToFromMetadata(metadata: unknown): AttachmentReplyTo | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  return parseAttachmentReplyTo((metadata as Record<string, unknown>)['attachmentReplyTo']);
}
