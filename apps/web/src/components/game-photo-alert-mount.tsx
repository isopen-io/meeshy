import { lazy, Suspense, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import { browserIdle, type IdleScheduler } from '@/lib/view/screen-preload';

/**
 * L'HÔTE DES INVITATIONS À IMMORTALISER, ARMÉ HORS DE L'ENTRÉE (#10174, L18) — la bande du haut est dans le module
 * d'entrée : y poser la porte paresseuse de l'hôte (sa liste `__vite__mapDeps`) et l'horloge de repos coûtait
 * +0,2 Ko gzip à la première peinture (mesuré, `scripts/measure-weight.mjs`), au-dessus du plafond de
 * `budgets.json › first_paint.kb`. L'hôte est donc armé ici, dans le chrome DIFFÉRÉ de la coquille
 * (`deferred-chrome.tsx`), au repos, pour un compte connecté — et il se pose DANS la colonne de la bande
 * (`[data-top-bars]`), où l'on attend une bannière, par un portail : la bande n'en apprend pas même le nom.
 */
const Host = lazy(() => import('./game-photo-alert-host').then((m) => ({ default: m.GamePhotoAlertHost })));

const TOP_BAND_COLUMN = '[data-top-bars]';

export function GamePhotoAlertMount({
  routeKey,
  signedIn,
  idle = browserIdle,
}: {
  readonly routeKey: string;
  readonly signedIn: boolean;
  /** L'horloge de repos, injectable pour les témoins. */
  readonly idle?: IdleScheduler;
}) {
  const [column, setColumn] = useState<Element | null>(null);
  useEffect(() => {
    if (!signedIn || column !== null) return;
    idle(() => setColumn(document.querySelector(TOP_BAND_COLUMN)));
  }, [signedIn, column, idle]);
  if (!signedIn || column === null) return null;
  return createPortal(
    <div data-photo-alert-host="" className="contents">
      <Suspense fallback={null}>
        <Host routeKey={routeKey} />
      </Suspense>
    </div>,
    column,
  );
}
