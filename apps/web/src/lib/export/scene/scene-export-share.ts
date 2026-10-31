import { fileDeliveryPortal, shareFileOnce, type DeliverFileOutcome } from '@/lib/media/deliver-file';
import type { FileDeliveryHost } from '@/lib/media/file-delivery-host';

import type { SceneDelivery } from './scene-export-run';

/**
 * **« PARTAGER » D'UNE STORY LIVRE LE FICHIER COMPOSÉ** (#13881) — la vidéo
 * rendue part dans la feuille de partage : Web Share Level 2
 * (`navigator.share({ files })`) quand le navigateur accepte le fichier, le
 * pont `MeeshyShare` dans la coque (`browserFileDeliveryHost`), sinon le
 * téléchargement.
 *
 * Le rendu dure au moins la longueur de la story : l'activation du geste qui
 * l'a lancé a expiré, et le navigateur refuse le partage (`expired`). Le
 * fichier attend alors un toucher NEUF (`awaitTap`, le bouton « Partager » du
 * bandeau), dans lequel la livraison part — partage d'abord, téléchargement
 * si le partage est refusé. Retomber tout de suite sur l'ancre aurait rendu
 * un téléchargement là où la feuille du système était à un toucher.
 */

export const sceneDeliveryOf = (outcome: DeliverFileOutcome): SceneDelivery =>
  outcome === 'delivered' || outcome === 'cancelled' ? outcome : outcome === 'expired' ? 'retry' : 'failed';

export async function shareSceneFile(params: {
  readonly blob: Blob;
  readonly fileName: string;
  readonly mimeType: string;
  readonly host: FileDeliveryHost;
  readonly awaitTap: (deliver: () => Promise<SceneDelivery>) => Promise<SceneDelivery>;
}): Promise<SceneDelivery> {
  const { blob, fileName, mimeType, host } = params;
  const portal = fileDeliveryPortal(host);
  if (portal === null) return 'failed';
  const first = await shareFileOnce(host, blob, fileName, mimeType);
  if (first === 'delivered' || first === 'cancelled') return first;
  const deliver = () => portal.deliver(blob, fileName, mimeType).then(sceneDeliveryOf);
  return first === 'expired' ? params.awaitTap(deliver) : deliver();
}
