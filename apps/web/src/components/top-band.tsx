import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useStore } from 'zustand/react';

import { callStore } from '@/lib/calls/call-store';
import { prefersReducedMotion } from '@/lib/game/haptics';
import { useGamePrefs } from '@/lib/game/preferences';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { audioCarryStore } from '@/lib/view/audio-carry';
import {
  PLAYER_BANNER_EXIT_MS,
  PLAYER_BANNER_EXIT_REDUCED_MS,
  PLAYER_BANNER_HOLD_MS,
  playerBannerVisitStore,
  watchPlayerBannerAbsence,
} from '@/lib/view/player-banner-visit';
import {
  BANNER_EXIT_MS,
  callResumeShownStore,
  miniPlayerReadyStore,
  nextBannerPhase,
  reportMiniPlayerReady,
  showsPlayerBanner,
  topBandSlots,
  type BannerPhase,
  type TopBandSlots,
} from '@/lib/view/top-band';

import { CallResumeSlot } from './call-layer';

/**
 * LE MINI-LECTEUR (#9256) : le vocal que le lecteur plein écran jouait quand
 * on l'a fermé continue ici, sur toutes les routes, comme `MiniAudioPlayerBar`
 * au-dessus de la racine iOS. Rien n'est chargé tant qu'aucune lecture n'a été
 * confiée.
 */
const MiniAudioPlayerHost = lazy(() =>
  Promise.all([import('./mini-audio-player'), loadInterfaceCatalog(currentInterfaceLanguage())]).then(([m]) => {
    reportMiniPlayerReady();
    return m;
  }),
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
 * La bannière du joueur ne paraît qu'à l'OUVERTURE de l'application, 30 s,
 * puis remonte et s'efface (#9536, `lib/view/player-banner-visit.ts`) : cela
 * supplante le « toujours visible » de #9494.
 *
 * Sur les routes qui portent la bannière, le bandeau RÉSERVE sa hauteur
 * (`onInset`) : la coquille la reporte dans `--safe-top` de l'arbre des
 * écrans, et l'en-tête descend sous le bandeau au lieu d'être recouvert —
 * comme iOS, où « seul le viewport bouge ». Ailleurs, la pile se pose
 * par-dessus, comme avant.
 */
export type VisitTiming = { readonly holdMs: number; readonly exitMs: number };

const DEFAULT_TIMING: VisitTiming = { holdMs: PLAYER_BANNER_HOLD_MS, exitMs: PLAYER_BANNER_EXIT_MS };

export function TopBand({
  routeKey,
  signedIn,
  onInset,
  timing = DEFAULT_TIMING,
}: {
  readonly routeKey: string;
  readonly signedIn: boolean;
  readonly onInset?: (pixels: number) => void;
  /** Les durées de la visite : injectables pour les témoins. */
  readonly timing?: VisitTiming;
}) {
  const audio = useStore(audioCarryStore, (state) => state.carried !== null);
  const localCall = useStore(callStore, (state) => state.call !== null || state.waiting !== null);
  const resumeShown = useStore(callResumeShownStore, (state) => state.shown);
  const miniPlayerReady = useStore(miniPlayerReadyStore, (state) => state.ready);
  const prefs = useGamePrefs();
  const reserves = showsPlayerBanner(routeKey);
  const visit = useStore(playerBannerVisitStore, (state) => state.phase);
  useBannerVisitClock(timing, signedIn);
  const eligible = signedIn && !prefs.hidden && reserves && visit !== 'gone';
  const slots = topBandSlots({ call: localCall || resumeShown, audio, player: eligible });
  const column = useRef<HTMLDivElement | null>(null);
  useBandInset(column, reserves, onInset);
  const banner = useBannerPresence({
    wanted: slots.player,
    occupied: eligible && (slots.call || slots.audio),
    occupantReady: slots.call || !slots.audio || miniPlayerReady,
  });

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
      {banner === 'gone' ? null : (
        <div
          data-player-slot={visit === 'leaving' ? 'expiring' : banner === 'leaving' ? 'leaving' : 'shown'}
          {...(visit === 'leaving'
            ? { inert: true, 'aria-hidden': 'true' as const, className: 'player-banner-slot-expiring' }
            : banner === 'leaving'
              ? { inert: true, 'aria-hidden': 'true' as const, className: 'player-banner-slot-leaving' }
              : {})}
        >
          <Suspense fallback={null}>
            <PlayerBannerHost />
          </Suspense>
        </div>
      )}
    </div>
  );
}

/**
 * L'HORLOGE DE LA VISITE (#9536) — la bannière n'apparaît qu'à l'ouverture de
 * l'application : 30 s après sa première peinture elle remonte et s'efface
 * (`PLAYER_BANNER_EXIT_MS`, un simple fondu plus court sous
 * `prefers-reduced-motion`), puis reste retirée jusqu'à la prochaine ouverture
 * — le retour au premier plan après une vraie absence. Jamais peinte dans la
 * fenêtre d'ouverture (un appel qui dure, un fil, un cache vide), la visite se
 * ferme : la bannière ne surgit pas en pleine session. Sans session la fenêtre
 * n'est pas entamée — la connexion ouvre la visite. Les durées vivent dans
 * `lib/view/player-banner-visit.ts` ; l'horloge, ici, parce qu'elle suit la
 * vie du bandeau.
 */
function useBannerVisitClock({ holdMs, exitMs }: VisitTiming, signedIn: boolean): void {
  const phase = useStore(playerBannerVisitStore, (state) => state.phase);
  const visit = useStore(playerBannerVisitStore, (state) => state.visit);
  useEffect(() => watchPlayerBannerAbsence(), []);
  useEffect(() => {
    const { send } = playerBannerVisitStore.getState();
    if (phase === 'armed' && signedIn) {
      const id = setTimeout(() => send('missed'), holdMs);
      return () => clearTimeout(id);
    }
    if (phase === 'shown') {
      const id = setTimeout(() => send('expired'), holdMs);
      return () => clearTimeout(id);
    }
    if (phase === 'leaving') {
      const id = setTimeout(() => send('exited'), prefersReducedMotion() ? Math.min(exitMs, PLAYER_BANNER_EXIT_REDUCED_MS) : exitMs);
      return () => clearTimeout(id);
    }
    return undefined;
  }, [phase, visit, signedIn, holdMs, exitMs]);
}

/**
 * LA PRÉSENCE DE LA BANNIÈRE (#9494) — la phase que `nextBannerPhase` décide,
 * posée AVANT la peinture (`useLayoutEffect`) : une bannière qui doit sortir ne
 * se peint jamais une image de trop dans la pile. La sortie dure
 * `BANNER_EXIT_MS` (aucune sous `prefers-reduced-motion`), puis la bannière est
 * retirée. Pendant qu'elle glisse, elle est INERTE : posée par-dessus
 * l'occupant qui arrive, elle ne prend ni son clic, ni le focus, ni le lecteur
 * d'écran.
 */
function useBannerPresence(input: { readonly wanted: boolean; readonly occupied: boolean; readonly occupantReady: boolean }): BannerPhase {
  const { wanted, occupied, occupantReady } = input;
  const [phase, setPhase] = useState<BannerPhase>(wanted ? 'shown' : 'gone');
  useLayoutEffect(() => {
    setPhase((current) => nextBannerPhase({ phase: current, wanted, occupied, occupantReady }));
  }, [wanted, occupied, occupantReady]);
  useEffect(() => {
    if (phase !== 'leaving') return undefined;
    if (prefersReducedMotion()) {
      setPhase('gone');
      return undefined;
    }
    const id = setTimeout(() => setPhase('gone'), BANNER_EXIT_MS);
    return () => clearTimeout(id);
  }, [phase]);
  return wanted ? 'shown' : phase;
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
