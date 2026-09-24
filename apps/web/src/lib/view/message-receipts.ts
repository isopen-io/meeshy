import type { AttachmentStatusRow } from '@/lib/api/attachments';
import type { ReceiptPersonRow } from '@/lib/api/receipts';

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
  return {
    readBy: people.filter((person) => person.readAt !== null),
    receivedBy: people.filter((person) => person.readAt === null && person.receivedAt !== null),
    notYet: people.filter((person) => person.readAt === null && person.receivedAt === null),
  };
}

/**
 * UN MESSAGE ENCORE OPTIMISTE N'A RIEN À RACONTER — miroir de
 * `MessageViewsDetailView.messageHasServerId`
 * (`apps/ios/Meeshy/Features/Main/Components/MessageDetail/
 * MessageViewsDetailView.swift:927-933`), qui garde `loadReadStatus()` par
 * la MÊME question. Tant que l'envoi n'est pas confirmé, `Message.id` EST
 * `clientMessageId` (`cid_<uuid>`, `api/client-message-id.ts`) : aucune
 * ligne de la base ne porte cet identifiant, et
 * `GET /conversations/:id/receipts?detail=people&messageIds=cid_…` se fait
 * refuser par la validation ObjectId de la passerelle
 * (`resolveRequestedMessageIds`, `routes/conversations/receipts.ts`). Sans
 * cette garde, ouvrir « Plus… » sur le message qu'on vient d'envoyer
 * lançait une requête vouée au 400 puis peignait « Impossible de charger
 * ces informations » — un ÉCHEC affiché là où il n'y a, simplement, encore
 * rien à lire.
 */
export function hasServerMessageId(messageId: string): boolean {
  return /^[0-9a-f]{24}$/i.test(messageId);
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

/** Le badge « Nx » — n'apparaît qu'à partir de DEUX écoutes/visionnages
 * (miroir iOS : `if let c = count, c > 1`, `:801`), sinon `null` (rien à
 * afficher, une seule lecture ne se compte pas elle-même). */
export function playCountLabel(count: number): string | null {
  return count > 1 ? `${count}x` : null;
}

/**
 * QUI A OUVERT UNE IMAGE/UN DOCUMENT (#7363, W6) — filtre sur `viewedAt`
 * SEUL (jamais `downloadedAt` : télécharger n'est pas ouvrir, § critère de
 * fin de l'issue). Miroir `MessageViewsConsumption.attachments(…, in: .opened)`
 * au niveau LIGNE plutôt que pièce : la carte reste montée pour toute pièce
 * (agrégats déjà rendus), seules les RANGÉES nominatives se filtrent ici.
 */
export function openedRowsOf(rows: readonly AttachmentStatusRow[]): readonly AttachmentStatusRow[] {
  return rows.filter((row) => row.viewedAt !== null);
}
