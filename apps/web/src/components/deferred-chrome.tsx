import { lazy, Suspense } from 'react';

import { AppBadge } from './app-badge';
import { BatteryMount } from './battery-mount';
import { BringRingMount } from './bring-ring-mount';
import { GamePhotoAlertMount } from './game-photo-alert-mount';
import { ListeningMount } from './listening-mount';
import { PublicationImageHost } from './publication-image-host';
import { SceneExportTray } from './scene-export-tray';
import { SharedLocationSharingMount } from './shared-location-sharing-mount';
import { TalkieMount } from './talkie-mount';
import { TogetherMount } from './together-mount';

/**
 * LE CHROME DIFFÉRÉ DE LA COQUILLE (W4 #7221, #10174) — ce qui vaut sur TOUTES les routes sans peindre le premier
 * pixel, chargé en UN chunk à la demande : le badge des non-lus (`app-badge.tsx`) et l'hôte des invitations à
 * immortaliser, armé au repos (`game-photo-alert-mount.tsx`), et le bandeau des exports de publication en cours
 * (`scene-export-tray.tsx`, #13873), et l'atelier de carte d'« Imager » une publication
 * (`publication-image-host.tsx`, #16393), et l'écran de sonnerie du Bring (`bring-ring-mount.tsx`, #13936), et la voix d'un Proche qui parle
 * (`talkie-mount.tsx`, #16638), et ce qu'écoutent mes Proches et mes Sangs (`listening-mount.tsx`, #16729), et la séance « ensemble »
 * (`together-mount.tsx`, #17055), et mon partage de position qui reprend au chargement (`shared-location-sharing-mount.tsx`, #18345),
 * et le guet qui rappelle le bandeau du joueur quand un acte, l'Offrande ou la Flamme change (`use-banner-recall.ts`, #17366),
 * et la batterie de mes Proches et de mes Sangs (`battery-mount.tsx`, #14147).
 * L'entrée n'en connaît qu'un nom.
 */
/** Le guet du rappel emporte les lois du Jeu : son chunk se charge à part, et la coquille ne porte même pas son nom. */
const BannerRecallMount = lazy(() => import('@/lib/view/use-banner-recall').then((m) => ({ default: m.BannerRecallMount })));

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
      <TogetherMount signedIn={signedIn} />
      <SharedLocationSharingMount signedIn={signedIn} />
      <BatteryMount signedIn={signedIn} />
      <Suspense fallback={null}>
        <BannerRecallMount signedIn={signedIn} />
      </Suspense>
    </>
  );
}
