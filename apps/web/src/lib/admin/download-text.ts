import type { DeliverFileOutcome } from '@/lib/media/deliver-file';
import { browserFileDeliveryHost, type FileDeliveryHost } from '@/lib/media/file-delivery-host';

/**
 * **ENREGISTRER UN TEXTE COMME FICHIER** (#10232) — l'export `store.app_events` se télécharge. Le texte est déjà là
 * (la passerelle le sert dans le JSON de l'export) : un `Blob`, sans second appel réseau.
 *
 * Par le PORTAIL de livraison (#10563), comme l'export de données (#7864) : la WebView de `@capacitor/android` ne
 * branche aucun `DownloadListener`, l'ancre y était un clic sans effet suivi d'un « fichier téléchargé ». La coque
 * remet le fichier à son pont de partage ; un navigateur garde l'ancre, sans feuille de partage. L'issue rendue dit
 * ce qui s'est réellement passé : sans porte, l'écran propose de copier, il ne ment pas.
 */
export async function downloadTextFile({
  name,
  text,
  mime = 'text/yaml;charset=utf-8',
  host = browserFileDeliveryHost(),
}: {
  readonly name: string;
  readonly text: string;
  readonly mime?: string;
  readonly host?: FileDeliveryHost;
}): Promise<DeliverFileOutcome> {
  const { fileDeliveryPortal } = await import('@/lib/media/deliver-file');
  const portal = fileDeliveryPortal(anchorFirst(host));
  if (portal === null) return 'unavailable';
  try {
    return await portal.deliver(new Blob([text], { type: mime }), name, mime);
  } catch {
    return 'unavailable';
  }
}

function anchorFirst(host: FileDeliveryHost): FileDeliveryHost {
  const { document, createObjectURL, revokeObjectURL } = host;
  return document === undefined || createObjectURL === undefined || revokeObjectURL === undefined ? host : { document, createObjectURL, revokeObjectURL };
}

/** Copie dans le presse-papiers ; `false` quand il est indisponible ou refusé (contexte non sûr, permission). */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
