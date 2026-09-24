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
 * **QUATRE ISSUES, jamais trois** (revue #7116, deux passes) : `delivered`,
 * `cancelled` (l'utilisateur a fermé la feuille — une décision) et
 * `unavailable` (aucune porte n'a abouti). Le premier jet rendait `cancelled`
 * dans ce dernier cas, et le lecteur annonçait « Export annulé » pour un
 * échec.
 *
 * **`expired` REJOINT à la revue suivante** — une coque (pas d'ancre
 * `<a download>`, mesuré : ni `@capacitor/android` ni `@capacitor/ios` 8.5.1
 * ne branchent le téléchargement de leur WebView) dont la SEULE porte est le
 * partage de fichier peut voir `navigator.share` refuser par
 * `NotAllowedError` — l'activation du geste a expiré PENDANT le
 * téléchargement, qui se place entre le tap et l'appel. Un navigateur avec
 * ancre ne voit jamais cette issue : l'ancre ne dépend d'aucune activation, et
 * `shareFile` refusé y retombe toujours sur `downloadThroughAnchor`. Sans
 * ancre, rien ne peut réparer CE geste — mais rien ne dit que le SUIVANT
 * échouera : le prochain tap sur « Enregistrer » est une activation FRAÎCHE.
 * `unavailable` annoncerait un échec définitif ; `expired` dit au lecteur
 * « retapez », ce qui est vrai et ce que `unavailable` ne peut pas dire.
 */
export type DeliverFileOutcome = 'delivered' | 'cancelled' | 'unavailable' | 'expired';

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

/** `refused` — aucune porte, ou un refus qui n'est ni une annulation ni une
 * expiration d'activation : ces deux-là se disent au lecteur (`cancelled`,
 * `expired`), `refused` seul retombe sur l'ancre quand elle existe. */
async function shareFile(host: FileDeliveryHost, file: File): Promise<'delivered' | 'cancelled' | 'expired' | 'refused'> {
  if (host.canShareFiles === undefined || host.shareFiles === undefined || !host.canShareFiles({ files: [file] })) return 'refused';
  try {
    await host.shareFiles({ files: [file] });
    return 'delivered';
  } catch (error) {
    if (!(error instanceof Error)) return 'refused';
    if (error.name === 'AbortError') return 'cancelled';
    if (error.name === 'NotAllowedError') return 'expired';
    return 'refused';
  }
}

export function fileDeliveryPortal(host: FileDeliveryHost): FileDeliveryPortal | null {
  if (!hasFileDeliveryDoor(host)) return null;
  const { document, createObjectURL, revokeObjectURL } = host;
  const anchor = document !== undefined && createObjectURL !== undefined && revokeObjectURL !== undefined ? { document, createObjectURL, revokeObjectURL } : null;

  return {
    deliver: async (blob, fileName, mimeType) => {
      const shared = await shareFile(host, new File([blob], fileName, { type: mimeType }));
      if (shared === 'delivered' || shared === 'cancelled') return shared;
      if (anchor !== null) return downloadThroughAnchor(anchor, blob, fileName);
      /* Pas d'ancre : `refused` n'a plus de recours, `expired` n'en a jamais
         eu — mais dire lequel change ce que le lecteur ENTEND (doc ci-dessus). */
      return shared === 'expired' ? 'expired' : 'unavailable';
    },
  };
}
