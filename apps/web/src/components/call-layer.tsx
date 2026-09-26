import { lazy, Suspense } from 'react';
import { useStore } from 'zustand/react';

import { callStore } from '@/lib/calls/call-store';

/**
 * **LA COUCHE D'APPEL** (#6382) — montée par la coquille sur TOUTES les
 * routes, comme `CallPresentationLayer.swift` au-dessus de la racine iOS : un
 * appel survit à la navigation, et un appel entrant s'affiche où que l'on
 * soit. Elle ne pèse qu'un abonnement au magasin ; l'écran d'appel est un
 * chunk à part, chargé quand un appel existe.
 */
const loadOverlay = () => import('./call-overlay').then((module) => ({ default: module.CallOverlay }));
const CallOverlay = lazy(loadOverlay);
/* « Reprendre l'appel » (#3586) — son propre chunk, chargé APRÈS la première
   peinture : la coquille n'en paie que l'`import()`. */
const CallResumeBanner = lazy(() => import('./call-resume-banner'));

export function CallLayer() {
  const active = useStore(callStore, (state) => state.call !== null || state.waiting !== null || state.notice !== null);
  return (
    <>
      <Suspense fallback={null}>
        <CallResumeBanner />
      </Suspense>
      {active ? (
        <Suspense fallback={null}>
          <CallOverlay />
        </Suspense>
      ) : null}
    </>
  );
}
