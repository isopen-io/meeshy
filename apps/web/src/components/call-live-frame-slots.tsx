import { lazy, Suspense, useRef } from 'react';
import { useStore } from 'zustand/react';

import { liveFrameDuo, toggledHold } from '@/lib/calls/call-live-frame';
import { callLiveFrame } from '@/lib/calls/call-live-frame-live';
import { callLiveFrameStore, type CallLiveFrameState } from '@/lib/calls/call-live-frame-store';
import type { ActiveCall } from '@/lib/calls/call-store';
import type { InterfaceLanguage } from '@/lib/interface-language';

import type { LiveFrameHold } from './call-montage-mode';
import type { ShownFrame } from './call-live-frame-layer';
import type { FrameStudioLoader } from './use-montage-frames';

/**
 * **LES PLACES DU CADRE EN DIRECT DANS L'ÉCRAN D'APPEL** (#16943) — léger, et
 * statique : il lit l'état de la session et ne charge le chunk du cadre
 * (`call-live-frame-layer.tsx`, avec l'atelier) que lorsqu'il y a quelque
 * chose à montrer. L'écran d'appel n'y gagne que trois lignes.
 */

const loadLayer = () => import('./call-live-frame-layer');

const Status = lazy(() =>
  loadLayer().then((module) => ({
    default: function LiveFrameStatus({ language, state, load }: { readonly language: InterfaceLanguage; readonly state: CallLiveFrameState; readonly load: FrameStudioLoader }) {
      const studio = module.useLiveFrameStudio(load);
      return (
        <module.CallLiveFrameStatus
          language={language}
          state={state}
          nameOf={module.frameNameOf(studio, language)}
          onAccept={() => void callLiveFrame.accept()}
          onDecline={() => void callLiveFrame.decline()}
          onDismissAnswer={callLiveFrame.dismissAnswer}
          onDismissNotice={callLiveFrame.dismissNotice}
        />
      );
    },
  })),
);

type SurfaceProps = { readonly language: InterfaceLanguage; readonly call: ActiveCall; readonly shown: ShownFrame | null; readonly stage: () => Element | null; readonly load: FrameStudioLoader };

const Surface = lazy(() =>
  loadLayer().then((module) => ({
    default: function LiveFrameSurface({ load, ...props }: SurfaceProps) {
      const studio = module.useLiveFrameStudio(load);
      return studio === null ? null : <module.CallLiveFrameSurface {...props} studio={studio} />;
    },
  })),
);

export const useLiveFrameState = (): CallLiveFrameState => useStore(callLiveFrameStore, (state) => state);

/** Un avis du cadre en direct (proposition, réponse, notice) attend-il sa place dans la pile des bandeaux ? */
export const liveFrameStatusPresent = (state: CallLiveFrameState): boolean => state.proposal !== null || state.answer !== null || state.notice !== null;

/**
 * La proposition, la réponse, ou le cadre resté chez moi — sous l'en-tête, jamais rangé avec les commandes (loi 11).
 * Sa case (`data-call-live-frame-slot`, pleine largeur) est posée par le chunk du cadre, qui la fait entrer et repartir en
 * mouvement : l'écran ne monte le chunk qu'au premier avis, et le garde monté ensuite, le temps de laisser repartir le dernier.
 */
export function CallLiveFrameStatusSlot({ language, state, load }: { readonly language: InterfaceLanguage; readonly state: CallLiveFrameState; readonly load: FrameStudioLoader }) {
  const engaged = useRef(false);
  if (liveFrameStatusPresent(state)) engaged.current = true;
  if (!engaged.current) return null;
  return (
    <Suspense fallback={null}>
      <Status language={language} state={state} load={load} />
    </Suspense>
  );
}

/** Le cadre gardé se montre-t-il ? À deux, en vidéo, hors des modes. */
export const liveFrameShown = (call: ActiveCall, state: CallLiveFrameState, available: boolean): boolean => available && state.frameId !== null && liveFrameDuo(call);

/** Le cadre gardé, autour des deux vidéos — monté au premier cadre, puis gardé le temps de s'effacer en fondu. */
export function CallLiveFrameSurfaceSlot({ shown, state, ...props }: Omit<SurfaceProps, 'shown'> & { readonly shown: boolean; readonly state: CallLiveFrameState }) {
  const engaged = useRef(false);
  const frame: ShownFrame | null = shown && state.frameId !== null ? { frameId: state.frameId, remoteSharedName: state.remoteSharedName } : null;
  if (frame !== null) engaged.current = true;
  if (!engaged.current) return null;
  return (
    <Suspense fallback={null}>
      <Surface {...props} shown={frame} />
    </Suspense>
  );
}

/** L'interrupteur « Cadre » du Montage (C1) : offert à deux, en vidéo. */
export const liveFrameHold = (call: ActiveCall, state: CallLiveFrameState): LiveFrameHold => ({
  heldFrameId: state.frameId,
  offered: liveFrameDuo(call),
  toggle: (tapped: string) => void callLiveFrame.apply(toggledHold(state.frameId, tapped)),
});

