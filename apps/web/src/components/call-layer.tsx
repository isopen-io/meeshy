import { lazy, Suspense } from 'react';
import { useStore } from 'zustand/react';

import { callStore } from '@/lib/calls/call-store';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';

/**
 * **LA COUCHE D'APPEL** (#6382) — montée par la coquille sur TOUTES les
 * routes, comme `CallPresentationLayer.swift` au-dessus de la racine iOS : un
 * appel survit à la navigation, et un appel entrant s'affiche où que l'on
 * soit. Elle ne pèse qu'un abonnement au magasin ; l'écran d'appel est un
 * chunk à part, chargé quand un appel existe.
 */
const loadOverlay = () => import('./call-overlay').then((module) => ({ default: module.CallOverlay }));
const CallOverlay = lazy(loadOverlay);
/* #8046 — la bulle et l'image dans l'image sont des FRÈRES de l'écran, pas
   ses enfants : un chunk chargé par un autre chunk à la demande ne peut
   pas en partager les modules sans l'importer statiquement (budgets.json ›
   dynamic_only). Chargés d'ici, leurs modules communs (éléments média,
   glyphes) forment un chunk partagé. */
const CallBubbleLayer = lazy(() => import('./call-bubble').then((module) => ({ default: module.CallBubbleLayer })));
const CallPipLayer = lazy(() => import('./call-pip-window').then((module) => ({ default: module.CallPipLayer })));
/* « Reprendre l'appel » (#3586) — son propre chunk, chargé APRÈS la première
   peinture : la coquille n'en paie que l'`import()`. Monté sur toutes les
   routes, il peut précéder l'écran qui charge le catalogue : il l'attend
   avec son chunk, comme les menus flottants. */
const CallResumeBanner = lazy(() =>
  Promise.all([import('./call-resume-banner'), loadInterfaceCatalog(currentInterfaceLanguage())]).then(([module]) => module),
);

export function CallLayer() {
  const active = useStore(callStore, (state) => state.call !== null || state.waiting !== null || state.notice !== null);
  const hasCall = useStore(callStore, (state) => state.call !== null);
  const bubble = useStore(callStore, (state) => state.call?.display === 'bubble');
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
      {hasCall ? (
        <Suspense fallback={null}>
          <CallPipLayer />
          {bubble ? <CallBubbleLayer /> : null}
        </Suspense>
      ) : null}
    </>
  );
}
