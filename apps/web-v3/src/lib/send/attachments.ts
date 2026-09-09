import {
  MAX_ATTACHMENTS_PER_MESSAGE,
  SMALL_FILE_THRESHOLD,
  isAudioMimeType,
  isImageMimeType,
  isVideoMimeType,
} from '@meeshy/shared/types/attachment';
import { messageTypeForClientAttachments, type AttachmentMessageType } from '@meeshy/shared/utils/attachment-message-type';
import type { ParticipantPermissions } from '@meeshy/shared/types/participant';

import { attachmentDefaults } from '@/lib/api/fixtures-base';
import type { Attachment } from '@/lib/api/types';

import { previewUrlFor } from './attachment-preview-url';

/**
 * LA SÉLECTION DU COMPOSEUR (#5668, étape b) — état PUR, hors DOM et hors
 * React : ce que `RecentMediaStrip`/`+ComposerAttachments.swift` appellent le
 * « tiroir » (`customAttachmentsPreview`). Une pièce en attente porte le
 * `File` du navigateur (jamais téléversé pour composer cet état — la vignette
 * et le nom viennent du fichier lui-même) et son GENRE, dérivé du MIME par la
 * MÊME règle que le serveur (`messageTypeFromMimeTypes`,
 * `@meeshy/shared/utils/attachment-message-type`) : aucune seconde table.
 */
export type PendingAttachment = {
  readonly localId: string;
  readonly file: File;
  readonly kind: AttachmentMessageType;
  readonly name: string;
  readonly size: number;
  /** Ko en MILLISECONDES — présent seulement pour un enregistrement vocal
   * (`use-recorder.ts`) : c'est ce que `duration` (`Attachment`) porte sur le
   * dépôt. */
  readonly durationMs?: number;
};

let counter = 0;

/** TÉMOIN SEUL — même discipline que `debounceEntryCountForTests`
 * (`perform-send.ts`) : l'identifiant vit pour la durée du PROCESSUS. */
export function resetPendingAttachmentIdsForTests(): void {
  counter = 0;
}

function kindOfMimeType(mimeType: string): AttachmentMessageType {
  if (isImageMimeType(mimeType)) return 'image';
  if (isAudioMimeType(mimeType)) return 'audio';
  if (isVideoMimeType(mimeType)) return 'video';
  return 'file';
}

export function pendingAttachmentOf(
  file: File,
  opts?: { readonly durationMs?: number },
): PendingAttachment {
  counter += 1;
  return {
    localId: `pending-${counter}`,
    file,
    kind: kindOfMimeType(file.type),
    name: file.name,
    size: file.size,
    ...(opts?.durationMs === undefined ? {} : { durationMs: opts.durationMs }),
  };
}

/**
 * LA BORNE EST ICI, ET NULLE PART AILLEURS (revue-correction #5668) —
 * `MAX_ATTACHMENTS_PER_MESSAGE` (`@meeshy/shared/types/attachment.ts:454`)
 * borne `attachmentIds` sur le schéma de la passerelle
 * (`messages-send.ts:75`, `z.array(z.string()).max(...)`) : au-delà, le corps
 * entier est refusé en 400 et le message est perdu APRÈS que les fichiers ont
 * déjà été téléversés. `api/messages.ts` déclarait ne pas revérifier la borne
 * « c'est `send/attachments.ts` qui compose la sélection » — et cette
 * fonction-ci ne la posait pas : deux absences qui se justifiaient l'une
 * l'autre. Elle est POSÉE, au seul endroit qui ajoute.
 */
export function addPendingAttachment(
  list: readonly PendingAttachment[],
  attachment: PendingAttachment,
): readonly PendingAttachment[] {
  if (list.length >= MAX_ATTACHMENTS_PER_MESSAGE) return list;
  return [...list, attachment];
}

/**
 * LE DROIT QUI GOUVERNE UN TYPE MIME — miroir EXACT de
 * `attachmentSendRightForMimeType` (`services/gateway/src/services/participantRights.ts:230-235`),
 * y compris son repli générique `canSendFiles`. C'est une JUMELLE ASSUMÉE :
 * la table vit dans la passerelle, pas dans `@meeshy/shared`, et la v3.1 ne
 * déplace rien côté serveur (§ « Conformité à la passerelle »). Elle est ici
 * pour que le composeur n'OFFRE pas une porte que la passerelle refusera
 * (loi 4) — l'issue compagnon qui hisse la table dans `@meeshy/shared` est
 * proposée à la clôture.
 */
export function attachmentRightFor(mimeType: string | undefined): keyof ParticipantPermissions {
  if (mimeType?.startsWith('image/')) return 'canSendImages';
  if (mimeType?.startsWith('video/')) return 'canSendVideos';
  if (mimeType?.startsWith('audio/')) return 'canSendAudios';
  return 'canSendFiles';
}

/** `rights` absent ⇒ tout est permis (aucun participant chargé encore) ;
 * `canViewHistory` mis à part, une permission absente vaut PERMISE. */
export function mayAttach(rights: ParticipantPermissions | undefined, mimeType: string | undefined): boolean {
  return rights === undefined || rights[attachmentRightFor(mimeType)] !== false;
}

/**
 * CE QUE LE COMPOSEUR ACCEPTE, ET CE QU'IL REFUSE EN LE DISANT
 * (revue-correction #5668) — un refus SILENCIEUX est le pire des deux mondes :
 * le fichier ne s'affiche pas et rien n'explique pourquoi. Trois causes, dans
 * l'ordre où elles se décident :
 *
 * 1. **Le droit** — la passerelle rend 403 `ATTACHMENT_RIGHT_NOT_PERMITTED`
 *    (`MessagingService.ts:284-298`) APRÈS que les octets sont partis ; le
 *    dire AVANT coûte une comparaison.
 * 2. **La taille** — au-delà de `SMALL_FILE_THRESHOLD`
 *    (`attachment.ts:487`, « below this, use direct REST upload »), le chemin
 *    REST de ce lot n'est PAS celui du dépôt : il faut la reprise TUS
 *    (`routes/uploads/tus-handler.ts`), issue compagnon.
 * 3. **Le nombre** — `MAX_ATTACHMENTS_PER_MESSAGE`.
 */
export function acceptPendingFiles(params: {
  readonly current: readonly PendingAttachment[];
  readonly files: readonly File[];
  readonly rights?: ParticipantPermissions;
}): { readonly list: readonly PendingAttachment[]; readonly refusal?: string } {
  const denied = params.files.find((file) => !mayAttach(params.rights, file.type));
  if (denied !== undefined) {
    return { list: params.current, refusal: `« ${denied.name} » : ce type de pièce jointe ne vous est pas autorisé ici` };
  }
  const tooLarge = params.files.find((file) => file.size > SMALL_FILE_THRESHOLD);
  if (tooLarge !== undefined) {
    return { list: params.current, refusal: `« ${tooLarge.name} » dépasse 50 Mo — trop lourd pour un envoi direct` };
  }
  const list = params.files.reduce(
    (acc, file) => addPendingAttachment(acc, pendingAttachmentOf(file)),
    params.current,
  );
  if (list.length < params.current.length + params.files.length) {
    return { list, refusal: `Pas plus de ${MAX_ATTACHMENTS_PER_MESSAGE} pièces jointes par message` };
  }
  return { list };
}

export function removePendingAttachment(
  list: readonly PendingAttachment[],
  localId: string,
): readonly PendingAttachment[] {
  return list.filter((a) => a.localId !== localId);
}

/**
 * LE TYPE QUE LE COMPOSEUR DOIT DÉCLARER (§0 de la spécification #5668) —
 * projette `messageTypeForClientAttachments` sur la sélection courante.
 * `'text'` dès que la liste est vide, jamais un type de média inventé.
 */
export function messageTypeOfPending(list: readonly PendingAttachment[]): 'text' | AttachmentMessageType {
  return messageTypeForClientAttachments({
    hasAttachments: list.length > 0,
    mimeTypes: list.map((a) => a.file.type),
  });
}

/**
 * LA BULLE OPTIMISTE PORTE UN `Attachment` DU DOMAINE, jamais son `File` cru
 * (revue-correction, miroir `ConversationView+AttachmentHandlers.swift:217-300`,
 * « tempId »). `fileUrl` est un URL D'OBJET LOCAL : il vit tant que la bulle
 * optimiste vit, jamais persisté, jamais envoyé au serveur — c'est
 * `attachmentIds` (obtenus par `uploadAttachments`) qui voyage sur le POST.
 *
 * `previewUrlFor` (défaut 7, revue #5668) — PARTAGE l'URL avec la tuile du
 * plateau (`composer-tray.tsx § PreviewTile`) au lieu d'en créer une SECONDE
 * pour le même fichier : avant ce partage, une photo choisie fuyait deux
 * blobs, un seul jamais révoqué.
 */
export function attachmentPreviewOf(pending: PendingAttachment): Attachment {
  return {
    ...attachmentDefaults,
    id: pending.localId,
    messageId: '',
    fileName: pending.name,
    originalName: pending.name,
    mimeType: pending.file.type,
    fileSize: pending.size,
    fileUrl: previewUrlFor(pending.localId, pending.file),
    // `uploadedBy`/`createdAt` : le domaine les exige (`Attachment.uploadedBy`,
    // `.createdAt: string`) mais AUCUN écran ne les lit sur une pièce en
    // ATTENTE (`message-blocks.tsx` ne consulte ni l'un ni l'autre) — posés
    // pour que le type soit habité, jamais pour être affichés.
    uploadedBy: '',
    createdAt: new Date().toISOString(),
    ...(pending.durationMs === undefined ? {} : { duration: pending.durationMs }),
  };
}
