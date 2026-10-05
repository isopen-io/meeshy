import { lazy, Suspense, useLayoutEffect, useRef } from 'react';
import { useStore } from 'zustand/react';

import { callStore } from '@/lib/calls/call-store';
import { useGamePrefs } from '@/lib/game/preferences';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { audioCarryStore } from '@/lib/view/audio-carry';
import { callResumeShownStore, showsPlayerBanner, topBandSlots, type TopBandSlots } from '@/lib/view/top-band';

import { CallResumeSlot } from './call-layer';

/**
 * LE MINI-LECTEUR (#9256) : le vocal que le lecteur plein écran jouait quand
 * on l'a fermé continue ici, sur toutes les routes, comme `MiniAudioPlayerBar`
 * au-dessus de la racine iOS. Rien n'est chargé tant qu'aucune lecture n'a été
 * confiée.
 */
const MiniAudioPlayerHost = lazy(() =>
  Promise.all([import('./mini-audio-player'), loadInterfaceCatalog(currentInterfaceLanguage())]).then(([m]) => m),
);

/**
 * LA BANNIÈRE DU JOUEUR (#9494) : son chunk et le catalogue du jeu, chargés
 * quand elle a sa place — jamais avec la première peinture.
 */
const PlayerBannerHost = lazy(() => import('./player-banner').then(async (m) => (await m.loadPlayerBannerCatalog(), m)));

const occupants = (slots: TopBandSlots): string =>
  (['call', 'audio', 'player'] as const).filter((slot) => slots[slot]).join(' ');

/**
 * LA PILE DU HAUT (#9279, #9494) — « Reprendre l'appel », le mini-lecteur
 * puis la bannière du joueur, dans UNE colonne fixe, comme le `VStack` de
 * `CallPresentationLayer` iOS. La loi de priorité est `topBandSlots` : l'appel
 * prime, puis l'audio ; la bannière du joueur n'a la place que quand ni l'un
 * ni l'autre ne la prend, et revient à la même place quand ils partent.
 *
 * Sur les routes qui portent la bannière, le bandeau RÉSERVE sa hauteur
 * (`onInset`) : la coquille la reporte dans `--safe-top` de l'arbre des
 * écrans, et l'en-tête descend sous le bandeau au lieu d'être recouvert —
 * comme iOS, où « seul le viewport bouge ». Ailleurs, la pile se pose
 * par-dessus, comme avant.
 */
export function TopBand({
  routeKey,
  signedIn,
  onInset,
}: {
  readonly routeKey: string;
  readonly signedIn: boolean;
  readonly onInset?: (pixels: number) => void;
}) {
  const audio = useStore(audioCarryStore, (state) => state.carried !== null);
  const localCall = useStore(callStore, (state) => state.call !== null || state.waiting !== null);
  const resumeShown = useStore(callResumeShownStore, (state) => state.shown);
  const prefs = useGamePrefs();
  const reserves = showsPlayerBanner(routeKey);
  const slots = topBandSlots({ call: localCall || resumeShown, audio, player: signedIn && !prefs.hidden && reserves });
  const column = useRef<HTMLDivElement | null>(null);
  useBandInset(column, reserves, onInset);

  return (
    <div
      ref={column}
      data-top-bars
      data-top-band={occupants(slots)}
      className="pointer-events-none fixed inset-x-0 z-40 flex flex-col gap-2 px-4"
      style={{ top: 'calc(env(safe-area-inset-top, 0px) + 8px)' }}
    >
      <CallResumeSlot />
      {slots.audio ? (
        <Suspense fallback={null}>
          <MiniAudioPlayerHost />
        </Suspense>
      ) : null}
      {slots.player ? (
        <Suspense fallback={null}>
          <PlayerBannerHost />
        </Suspense>
      ) : null}
    </div>
  );
}

/** La marge sous le bandeau : son décalage du haut (8 px) et une respiration (4 px). */
const BAND_MARGIN = 12;

/**
 * LA HAUTEUR DU BANDEAU, MESURÉE — avant la peinture (`useLayoutEffect`) : un
 * écran qui arrive ne se peint jamais une image sous un bandeau qu'il ignore.
 * Un bandeau vide ne réserve rien.
 */
function useBandInset(column: { readonly current: HTMLDivElement | null }, reserves: boolean, onInset: ((pixels: number) => void) | undefined): void {
  useLayoutEffect(() => {
    const node = column.current;
    if (onInset === undefined) return undefined;
    if (!reserves || node === null) {
      onInset(0);
      return undefined;
    }
    const apply = (): void => {
      const height = node.getBoundingClientRect().height;
      onInset(height > 0 ? Math.ceil(height) + BAND_MARGIN : 0);
    };
    apply();
    if (typeof ResizeObserver === 'undefined') return () => onInset(0);
    const observer = new ResizeObserver(apply);
    observer.observe(node);
    return () => {
      observer.disconnect();
      onInset(0);
    };
  }, [column, reserves, onInset]);
}
