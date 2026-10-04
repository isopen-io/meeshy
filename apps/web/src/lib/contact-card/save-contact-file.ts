import { currentCredential } from '@/lib/api/client';
import { attachmentSrc } from '@/lib/api/media-url';
import type { Attachment } from '@/lib/api/types';
import { browserFileDeliveryHost, type FileDeliveryHost } from '@/lib/media/file-delivery-host';

/**
 * **« TÉLÉCHARGER LA CARTE »** (#9263) — le dernier `<a download>` de l'app
 * menait à la passerelle : la coque Android le remettait au navigateur du
 * système (l'utilisateur quittait l'app, et le navigateur, sans la session,
 * n'avait pas le fichier), et un navigateur ignorait `download` pour une
 * autre origine. La carte suit désormais le chemin de la visionneuse : le
 * téléchargement avec la session, puis la porte de fichiers partagée — le
 * téléchargement d'un navigateur, la feuille de partage de la coque, d'où
 * Contacts importe la carte. Chargés à la demande, comme pour la story.
 */
export type ContactFileOutcome = 'saved' | 'cancelled' | 'failed';

export async function saveContactFile(params: {
  readonly attachment: Attachment;
  readonly fetchImpl?: typeof fetch;
  readonly host?: FileDeliveryHost;
}): Promise<ContactFileOutcome> {
  const { attachment } = params;
  const fetchImpl = params.fetchImpl ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));
  try {
    const [{ downloadFile }, { fileDeliveryPortal }] = await Promise.all([
      import('@/lib/media/download-file'),
      import('@/lib/media/deliver-file'),
    ]);
    const result = await downloadFile({
      url: attachmentSrc(attachment.fileUrl),
      fallbackMediaId: attachment.id,
      deps: { fetchImpl, credential: currentCredential },
      onProgress: () => undefined,
    });
    if (result.status !== 'ready') return 'failed';
    const portal = fileDeliveryPortal(params.host ?? browserFileDeliveryHost());
    if (portal === null) return 'failed';
    const fileName = attachment.originalName !== '' ? attachment.originalName : result.fileName;
    const outcome = await portal.deliver(result.blob, fileName, result.blob.type !== '' ? result.blob.type : attachment.mimeType);
    if (outcome === 'delivered') return 'saved';
    return outcome === 'cancelled' ? 'cancelled' : 'failed';
  } catch {
    return 'failed';
  }
}
