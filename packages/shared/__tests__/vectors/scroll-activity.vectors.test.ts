/**
 * Vecteurs inter-plateformes pour `scrollActivityLaw`
 * (`packages/shared/utils/scroll-activity.ts`, amendement A4).
 *
 * Fixtures : `packages/shared/fixtures/reading-modes/scroll-activity.vectors.json`.
 * Générées en EXÉCUTANT la loi TS (jamais à la main) — C-023,
 * `tasks/lentille-workshop-execution.md`.
 *
 * ── Sémantique de l'adaptateur (forme SÉQUENTIELLE, à reproduire à l'identique
 * côté Swift/Kotlin) ──
 * `input` = `{ events: ScrollActivityEvent[], probeAt: number }`. L'adaptateur
 * réduit `events` dans l'ordre depuis `initialState()` via `reduce`, PUIS
 * évalue `isVisible(state, probeAt)` — c'est la même séquence
 * initialState → reduce* → isVisible qu'une peau réelle rejoue à chaque
 * `tick`/`scrolled`. `expected` = `{ visible: boolean }`.
 *
 * Couverture de branche :
 *   - ouverture, zéro événement → invisible (état initial, `lastScrolledAt: null`)
 *   - premier `scrolled` → visible immédiatement (`0 < 900`)
 *   - `t + 899` après le dernier `scrolled` → toujours visible (borne EXCLUE)
 *   - `t + 900` après le dernier `scrolled` → déjà invisible (la borne
 *     `SCROLL_ACTIVITY_LINGER_MS` appartient à la fenêtre invisible)
 *   - `t + 901` → invisible
 *   - réarmement : un second `scrolled` avant expiration repousse la fenêtre
 *     — sans lui, la sonde serait invisible ; avec lui, elle est visible
 *   - un événement `tick` ne réarme JAMAIS (`reduce` l'ignore, `lastScrolledAt`
 *     inchangé) — visible retombe au moment prévu par le SEUL `scrolled`
 *   - plusieurs `scrolled` d'affilée : seul le DERNIER compte pour le calcul
 *     de la fenêtre (pas d'accumulation)
 */
import { scrollActivityLaw, type ScrollActivityEvent, type ScrollActivityState } from '../../utils/scroll-activity.js';
import { runVectors } from './harness.js';

type ScrollActivityVectorInput = {
  readonly events: readonly ScrollActivityEvent[];
  readonly probeAt: number;
};

type ScrollActivityVectorExpected = {
  readonly visible: boolean;
};

const runSequence = ({ events, probeAt }: ScrollActivityVectorInput): ScrollActivityVectorExpected => {
  const finalState = events.reduce<ScrollActivityState>(
    (state, event) => scrollActivityLaw.reduce(state, event),
    scrollActivityLaw.initialState(),
  );
  return { visible: scrollActivityLaw.isVisible(finalState, probeAt) };
};

runVectors<ScrollActivityVectorInput, ScrollActivityVectorExpected>('scroll-activity', runSequence);
