import { messageTypeFromMimeTypes } from '@meeshy/shared/utils/attachment-message-type';

import type { AttachmentStatusRow } from '@/lib/api/attachments';
import type { ReceiptPersonRow } from '@/lib/api/receipts';
import type { Attachment } from '@/lib/api/types';

/**
 * LA FICHE « INFOS DU MESSAGE » — LOIS PURES (#7226, W7). Aucun réseau,
 * aucun DOM : la disposition vit dans `message-receipts-sheet.tsx`, ce
 * fichier ne fait que catégoriser et calculer.
 */

export type ReceiptCategories = {
  readonly readBy: readonly ReceiptPersonRow[];
  readonly receivedBy: readonly ReceiptPersonRow[];
  readonly notYet: readonly ReceiptPersonRow[];
};

/**
 * `readAt` PRIME sur `receivedAt` (un message lu a forcément été reçu, on ne
 * le compte pas deux fois) ; l'absence des deux ⇒ « Pas encore ». Miroir de
 * la lecture iOS (`viewsReadContent`/`viewsDeliveredContent`/
 * `viewsNotSeenContent`, `MessageViewsDetailView.swift:493-598`), réduite à
 * trois compartiments (web n'a pas de sous-filtre séparé « Envoyé »/« Non
 * vu » — les trois sections COHABITENT dans la même feuille, D-L de la
 * spécification #7226 n'en dit rien, ce lot choisit le défaut le plus
 * simple : tout affiché d'un coup, comme les trois autres feuilles de
 * `message-detail-sheet.tsx`).
 */
export function receiptCategoriesOf(people: readonly ReceiptPersonRow[]): ReceiptCategories {
  const readBy: ReceiptPersonRow[] = [];
  const receivedBy: ReceiptPersonRow[] = [];
  const notYet: ReceiptPersonRow[] = [];
  for (const person of people) {
    if (person.readAt !== null) readBy.push(person);
    else if (person.receivedAt !== null) receivedBy.push(person);
    else notYet.push(person);
  }
  return { readBy, receivedBy, notYet };
}

export type AttachmentAggregate = {
  readonly opens: number;
  readonly downloads: number;
};

/**
 * `opens` = Σ `viewCount` (ouvertures d'une image, doc-comment gateway) ;
 * `downloads` = nombre de PARTICIPANTS ayant téléchargé (`downloadedAt` est
 * un horodatage unique par ligne, pas un compteur — une ligne = un
 * téléchargeur, jamais un total d'événements). Générique : ne suppose RIEN
 * du type MIME, ne compte que ce que les lignes portent.
 */
export function attachmentAggregateOf(rows: readonly AttachmentStatusRow[]): AttachmentAggregate {
  return {
    opens: rows.reduce((sum, row) => sum + row.viewCount, 0),
    downloads: rows.filter((row) => row.downloadedAt !== null).length,
  };
}

/**
 * Mirror EXACT de `MessageViewsDetailView.positionFraction`
 * (`apps/ios/Meeshy/Features/Main/Components/MessageDetail/
 * MessageViewsDetailView.swift:1027-1031`) : `complete` gagne toujours ;
 * sans durée ou sans position connue, 0 ; sinon la fraction, bornée [0, 1].
 */
export function positionFraction(params: {
  readonly positionMs: number | null;
  readonly complete: boolean;
  readonly durationMs?: number;
}): number {
  if (params.complete) return 1;
  if (params.durationMs === undefined || params.durationMs <= 0) return 0;
  if (params.positionMs === null) return 0;
  return Math.min(1, Math.max(0, params.positionMs / params.durationMs));
}

/** Classe UNE pièce jointe — SSOT partagée (`attachment-message-type.ts`),
 * jamais une relecture manuelle de `mimeType`. */
export function attachmentKindOf(attachment: Pick<Attachment, 'mimeType'>): 'image' | 'audio' | 'video' | 'file' {
  return messageTypeFromMimeTypes([attachment.mimeType]) ?? 'file';
}

/** Le badge « Nx » — n'apparaît qu'à partir de DEUX écoutes/visionnages
 * (miroir iOS : `if let c = count, c > 1`, `:801`), sinon `null` (rien à
 * afficher, une seule lecture ne se compte pas elle-même). */
export function playCountLabel(count: number): string | null {
  return count > 1 ? `${count}x` : null;
}
