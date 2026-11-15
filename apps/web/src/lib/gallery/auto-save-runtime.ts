import type { QueryClient } from '@tanstack/react-query';

import { APP_PREFERENCES_QUERY_KEY, type AppPreferences } from '@/lib/api/app-preferences';

import { createGalleryAutoSave, type GalleryAttachment, type GalleryMessage, type GalleryStorage } from './auto-save';
import { currentGallerySaver } from './gallery-saver';

/**
 * LE BRANCHEMENT DE L'ENREGISTREMENT AUTOMATIQUE (#8308) — appelé par le puits
 * `message:new` (`api/socket.ts`). Dans un navigateur, `currentGallerySaver()`
 * rend `null` et le geste s'arrête là : aucun téléchargement, aucun stockage lu.
 * Le téléchargement authentifié n'est chargé qu'à la première pièce qui part.
 */
export function browserGalleryStorage(): GalleryStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

async function fetchAttachmentBlob(attachment: GalleryAttachment): Promise<Blob | null> {
  const [{ downloadFile }, { attachmentSrc }, { currentCredential }] = await Promise.all([
    import('@/lib/media/download-file'),
    import('@/lib/api/media-url'),
    import('@/lib/api/client'),
  ]);
  const result = await downloadFile({
    url: attachmentSrc(attachment.fileUrl),
    fallbackMediaId: attachment.id,
    deps: { fetchImpl: (input, init) => fetch(input, init), credential: currentCredential },
    onProgress: () => undefined,
  });
  return result.status === 'ready' ? result.blob : null;
}

const autoSave = createGalleryAutoSave({
  isAndroidShell: () => currentGallerySaver() !== null,
  saver: currentGallerySaver,
  storage: browserGalleryStorage,
  fetchBlob: fetchAttachmentBlob,
});

/** « Sauvegarder média » (#14641), lu dans le cache des réglages synchronisés — absent ⇒ coupé. */
export const galleryConsentOf = (queryClient: QueryClient): boolean =>
  queryClient.getQueryData<AppPreferences>(APP_PREFERENCES_QUERY_KEY)?.saveMediaToGallery === true;

export function noteGalleryReception(message: GalleryMessage, viewerId: string, queryClient: QueryClient): void {
  autoSave(message, viewerId, galleryConsentOf(queryClient));
}
