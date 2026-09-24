import { hasFileDeliveryDoor, type FileDeliveryHost } from './file-delivery-host';

/**
 * **LA LIVRAISON D'UN FICHIER DÉJÀ TÉLÉCHARGÉ** (#7116) — miroir web de
 * l'écriture Photos d'iOS (`StoryPhotoSaveService`) : une fois le blob en
 * main, LE DÉPOSER quelque part que l'utilisateur retrouve. Chargé À LA
 * DEMANDE au premier « Enregistrer » ; ce que l'hôte offre est décidé avant,
 * par `file-delivery-host.ts` (statique).
 *
 * **AUCUNE PORTE ⇒ AUCUN BOUTON (loi 4).** Un hôte sans porte rend `null`,
 * jamais un portail qui échouerait au premier appel.
 *
 * Le partage de FICHIER est tenté d'abord — c'est la seule voie qui, sur une
 * coque mobile, propose d'enregistrer dans la pellicule — puis l'ancre
 * `<a download>` sert de repli si le partage échoue pour une raison qui n'est
 * pas une annulation (typiquement `NotAllowedError` : l'activation du geste a
 * expiré pendant le téléchargement).
 *
 * **TROIS ISSUES, jamais deux** (revue #7116) : `delivered`, `cancelled`
 * (l'utilisateur a fermé la feuille — une décision) et `unavailable` (aucune
 * porte n'a abouti). Le premier jet rendait `cancelled` dans ce dernier cas, et
 * le lecteur annonçait « Export annulé » pour un échec.
 */
export type DeliverFileOutcome = 'delivered' | 'cancelled' | 'unavailable';

export type FileDeliveryPortal = {
  readonly deliver: (blob: Blob, fileName: string, mimeType: string) => Promise<DeliverFileOutcome>;
};

function downloadThroughAnchor(
  host: Required<Pick<FileDeliveryHost, 'document' | 'createObjectURL' | 'revokeObjectURL'>>,
  blob: Blob,
  fileName: string,
): DeliverFileOutcome {
  const url = host.createObjectURL(blob);
  const anchor = host.document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  host.document.body.appendChild(anchor);
  anchor.click();
  host.document.body.removeChild(anchor);
  host.revokeObjectURL(url);
  return 'delivered';
}

async function shareFile(host: FileDeliveryHost, file: File): Promise<DeliverFileOutcome | 'refused'> {
  if (host.canShareFiles === undefined || host.shareFiles === undefined || !host.canShareFiles({ files: [file] })) return 'refused';
  try {
    await host.shareFiles({ files: [file] });
    return 'delivered';
  } catch (error) {
    return error instanceof Error && error.name === 'AbortError' ? 'cancelled' : 'refused';
  }
}

export function fileDeliveryPortal(host: FileDeliveryHost): FileDeliveryPortal | null {
  if (!hasFileDeliveryDoor(host)) return null;
  const { document, createObjectURL, revokeObjectURL } = host;
  const anchor = document !== undefined && createObjectURL !== undefined && revokeObjectURL !== undefined ? { document, createObjectURL, revokeObjectURL } : null;

  return {
    deliver: async (blob, fileName, mimeType) => {
      const shared = await shareFile(host, new File([blob], fileName, { type: mimeType }));
      if (shared !== 'refused') return shared;
      return anchor === null ? 'unavailable' : downloadThroughAnchor(anchor, blob, fileName);
    },
  };
}
