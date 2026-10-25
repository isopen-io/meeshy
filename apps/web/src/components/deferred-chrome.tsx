import { AppBadge } from './app-badge';
import { GamePhotoAlertMount } from './game-photo-alert-mount';

/**
 * LE CHROME DIFFÉRÉ DE LA COQUILLE (W4 #7221, #10174) — ce qui vaut sur TOUTES les routes sans peindre le premier
 * pixel, chargé en UN chunk à la demande : le badge des non-lus (`app-badge.tsx`) et l'hôte des invitations à
 * immortaliser, armé au repos (`game-photo-alert-mount.tsx`). L'entrée n'en connaît qu'un nom.
 */
export function DeferredChrome({ routeKey, signedIn }: { readonly routeKey: string; readonly signedIn: boolean }) {
  return (
    <>
      <AppBadge />
      <GamePhotoAlertMount routeKey={routeKey} signedIn={signedIn} />
    </>
  );
}
