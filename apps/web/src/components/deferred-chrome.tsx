import { AppBadge } from './app-badge';
import { BringRingMount } from './bring-ring-mount';
import { GamePhotoAlertMount } from './game-photo-alert-mount';
import { ListeningMount } from './listening-mount';
import { PublicationImageHost } from './publication-image-host';
import { SceneExportTray } from './scene-export-tray';
import { TalkieMount } from './talkie-mount';

/**
 * LE CHROME DIFFÉRÉ DE LA COQUILLE (W4 #7221, #10174) — ce qui vaut sur TOUTES les routes sans peindre le premier
 * pixel, chargé en UN chunk à la demande : le badge des non-lus (`app-badge.tsx`) et l'hôte des invitations à
 * immortaliser, armé au repos (`game-photo-alert-mount.tsx`), et le bandeau des exports de publication en cours
 * (`scene-export-tray.tsx`, #13873), et l'atelier de carte d'« Imager » une publication
 * (`publication-image-host.tsx`, #16393), et l'écran de sonnerie du Bring (`bring-ring-mount.tsx`, #13936), et la voix d'un Proche qui parle
 * (`talkie-mount.tsx`, #16638), et ce qu'écoutent mes Proches et mes Sangs (`listening-mount.tsx`, #16729).
 * L'entrée n'en connaît qu'un nom.
 */
export function DeferredChrome({ routeKey, signedIn }: { readonly routeKey: string; readonly signedIn: boolean }) {
  return (
    <>
      <AppBadge />
      <GamePhotoAlertMount routeKey={routeKey} signedIn={signedIn} />
      <SceneExportTray />
      <PublicationImageHost />
      <BringRingMount signedIn={signedIn} />
      <TalkieMount signedIn={signedIn} />
      <ListeningMount signedIn={signedIn} />
    </>
  );
}
