/**
 * **LA LIVRAISON D'UN FICHIER DÉJÀ TÉLÉCHARGÉ** (#7116) — miroir web de
 * l'écriture Photos d'iOS (`StoryPhotoSaveService`) : une fois le blob en
 * main, LE DÉPOSER quelque part que l'utilisateur retrouve.
 *
 * **AUCUNE PORTE ⇒ AUCUN BOUTON (loi 4).** Un hôte qui n'offre ni
 * `document`+`createObjectURL` (téléchargement navigateur) ni
 * `navigator.share({files})` (partage de fichier, où iOS propose
 * « Enregistrer dans Photos ») ne peut RIEN livrer : `fileDeliveryPortal`
 * rend `null`, jamais un portail qui échouerait au premier appel.
 *
 * Le partage de FICHIER est tenté d'abord — c'est la seule voie qui, sur une
 * coque mobile, propose d'enregistrer dans la pellicule — puis le
 * téléchargement `<a download>` sert de repli si l'hôte n'a pas l'un ou que
 * le partage échoue pour une raison qui n'est pas une annulation.
 */

export type FileDeliveryHost = {
  readonly document?: Pick<Document, 'createElement'> & { readonly body: Pick<HTMLElement, 'appendChild' | 'removeChild'> };
  readonly createObjectURL?: (blob: Blob) => string;
  readonly revokeObjectURL?: (url: string) => void;
  readonly canShareFiles?: (data: { readonly files: readonly File[] }) => boolean;
  readonly shareFiles?: (data: { readonly files: readonly File[] }) => Promise<void>;
};

export type DeliverFileOutcome = 'delivered' | 'cancelled';

export type FileDeliveryPortal = {
  readonly deliver: (blob: Blob, fileName: string, mimeType: string) => Promise<DeliverFileOutcome>;
};

function downloadAnchorPortal(host: Required<Pick<FileDeliveryHost, 'document' | 'createObjectURL' | 'revokeObjectURL'>>) {
  return async (blob: Blob, fileName: string): Promise<DeliverFileOutcome> => {
    const url = host.createObjectURL(blob);
    const anchor = host.document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    host.document.body.appendChild(anchor);
    anchor.click();
    host.document.body.removeChild(anchor);
    host.revokeObjectURL(url);
    return 'delivered';
  };
}

export function fileDeliveryPortal(host: FileDeliveryHost): FileDeliveryPortal | null {
  const hasDownloadAnchor = host.document !== undefined && host.createObjectURL !== undefined && host.revokeObjectURL !== undefined;
  const hasFileShare = host.canShareFiles !== undefined && host.shareFiles !== undefined;
  if (!hasDownloadAnchor && !hasFileShare) return null;

  const downloadFallback = hasDownloadAnchor
    ? downloadAnchorPortal({ document: host.document!, createObjectURL: host.createObjectURL!, revokeObjectURL: host.revokeObjectURL! })
    : null;

  return {
    deliver: async (blob, fileName, mimeType) => {
      if (hasFileShare) {
        const file = new File([blob], fileName, { type: mimeType });
        if (host.canShareFiles!({ files: [file] })) {
          try {
            await host.shareFiles!({ files: [file] });
            return 'delivered';
          } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') return 'cancelled';
            // Un refus qui n'est pas une annulation retombe sur le
            // téléchargement, s'il existe — jamais un échec muet.
          }
        }
      }
      if (downloadFallback !== null) return downloadFallback(blob, fileName);
      return 'cancelled';
    },
  };
}
