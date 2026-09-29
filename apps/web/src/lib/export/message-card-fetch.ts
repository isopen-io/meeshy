import { currentCredential } from '@/lib/api/client';
import { attachmentSrc } from '@/lib/api/media-url';

/**
 * UN MÉDIA DE CARTE, EN BLOB (#8693) — par la porte de téléchargement des
 * pièces jointes (`download-file.ts`), qui porte l'authentification et la
 * reprise d'une adresse périmée. Un blob se peint sans « salir » le canvas.
 * `null` : hors ligne, refusé ou introuvable — la carte garde un cadre neutre.
 */
export async function fetchCardMediaBlob(url: string, id: string): Promise<Blob | null> {
  const { downloadFile } = await import('@/lib/media/download-file');
  const result = await downloadFile({
    url: attachmentSrc(url),
    fallbackMediaId: id,
    deps: { fetchImpl: (input, init) => fetch(input, init), credential: currentCredential },
    onProgress: () => undefined,
  });
  return result.status === 'ready' ? result.blob : null;
}
