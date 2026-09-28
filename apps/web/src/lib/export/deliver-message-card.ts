import { currentGallerySaver, type GallerySaver } from '@/lib/gallery/gallery-saver';
import type { DeliverFileOutcome, FileDeliveryPortal } from '@/lib/media/deliver-file';
import { browserFileDeliveryHost } from '@/lib/media/file-delivery-host';

/**
 * **OÙ VA LA CARTE** — la photothèque d'abord, sans détour :
 *  - la coque ANDROID écrit directement dans l'album « Meeshy » de la galerie
 *    (`gallery-saver.ts`, aucune permission, aucune feuille) ;
 *  - la coque iOS et Safari mobile ouvrent la feuille de partage du système,
 *    dont la première entrée est « Enregistrer l'image » (Photos) ;
 *  - un navigateur de bureau télécharge le PNG.
 * Aucun de ces chemins n'est un second enregistreur : ce sont les portes que
 * « Enregistrer » d'une pièce jointe emprunte déjà.
 */

export type MessageCardDelivery = 'gallery' | Exclude<DeliverFileOutcome, 'delivered'> | 'shared';

type Doors = { readonly gallery: GallerySaver | null; readonly portal: () => Promise<FileDeliveryPortal | null> };

/* `deliver-file` n'est jamais importé statiquement (`budgets.json ›
   on_demand_chunks.story_export.dynamic_only`) : la porte ne se charge que si
   la galerie n'a pas déjà enregistré l'image. */
const currentDoors = (): Doors => ({
  gallery: currentGallerySaver(),
  portal: async () => (await import('@/lib/media/deliver-file')).fileDeliveryPortal(browserFileDeliveryHost()),
});

export async function deliverMessageCard(blob: Blob, fileName: string, doors: Doors = currentDoors()): Promise<MessageCardDelivery> {
  if (doors.gallery !== null) {
    const saved = await doors.gallery.save({ blob, fileName, mimeType: 'image/png' });
    if (saved === 'saved') return 'gallery';
  }
  const portal = await doors.portal();
  if (portal === null) return 'unavailable';
  const outcome = await portal.deliver(blob, fileName, 'image/png');
  return outcome === 'delivered' ? 'shared' : outcome;
}
