/**
 * LE RÉEL REGARDÉ SE DÉCIDE GESTE FINI (iOS d'abord) — jamais à mi-balayage.
 *
 * Lire le réel visible à chaque image du défilement (`Math.round` sur la
 * position) le faisait basculer à MI-CHEMIN, doigt encore posé : au milieu de
 * l'élan, l'écran mettait un réel en pause, en lançait un autre, montait le
 * `<video>` du nouveau N+2 et réordonnait les préchargements — un travail de
 * fil principal posé exactement pendant les images que le compositeur doit
 * tenir. Sur un iPhone, c'est l'image perdue au milieu du geste.
 *
 * La décision attend donc :
 * - que le doigt se lève (un doigt immobile n'a pas fini son geste) ;
 * - puis `scrollend` là où il existe (Chromium), ou un court silence sans
 *   `scroll` (Safari, dont la WebView iOS de la coque, n'a pas `scrollend`).
 *
 * Pendant le geste, le réel quitté continue de jouer et le suivant montre sa
 * première image : rien ne s'arrête sous le doigt.
 */
export const PAGER_SETTLE_QUIET_MS = 90;

export type PagerSettle = {
  readonly scrolled: () => void;
  readonly scrollEnded: () => void;
  readonly touchStarted: () => void;
  readonly touchEnded: () => void;
  readonly dispose: () => void;
};

type TimerId = ReturnType<typeof setTimeout> | number;

export function createPagerSettle(params: {
  readonly onSettle: () => void;
  readonly schedule?: (run: () => void, ms: number) => TimerId;
  readonly cancel?: (id: TimerId) => void;
}): PagerSettle {
  const schedule = params.schedule ?? ((run, ms) => setTimeout(run, ms));
  const cancel = params.cancel ?? ((id) => clearTimeout(id as ReturnType<typeof setTimeout>));
  let touching = false;
  let pending: TimerId | null = null;

  const clear = (): void => {
    if (pending === null) return;
    cancel(pending);
    pending = null;
  };
  const settleAfterQuiet = (): void => {
    clear();
    if (touching) return;
    pending = schedule(() => {
      pending = null;
      params.onSettle();
    }, PAGER_SETTLE_QUIET_MS);
  };

  return {
    scrolled: settleAfterQuiet,
    scrollEnded: () => {
      clear();
      if (!touching) params.onSettle();
    },
    touchStarted: () => {
      touching = true;
      clear();
    },
    touchEnded: () => {
      touching = false;
      settleAfterQuiet();
    },
    dispose: clear,
  };
}
