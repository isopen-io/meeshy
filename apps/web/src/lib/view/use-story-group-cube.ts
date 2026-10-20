import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';

import type { ViewerHorizontalDrag } from '@/components/viewer-chrome-gestures';
import {
  CUBE_COMMIT_DURATION_MS,
  CUBE_EASING,
  CUBE_SETTLE_DURATION_MS,
  cubeFaces,
  cubicBezier,
  decideGroupSwipe,
  displayedTranslation,
  type CubeFace,
  type CubeSide,
} from '@/lib/stories/group-cube';
import { prefersReducedMotion } from '@/lib/view/reduced-motion';

/**
 * **LE CUBE DU LECTEUR, CÔTÉ DOM** (#11198) — la loi est pure
 * (`lib/stories/group-cube.ts`) ; ce crochet la branche sur le doigt
 * (`useViewerSwipe` → `horizontal`) et ÉCRIT les deux faces à chaque image,
 * hors de React : un glissé ne re-rend pas le lecteur soixante fois par
 * seconde. La face courante est la scène même ; les voisines sont posées à
 * côté d'elle par l'hôte (`StoryCubeFace`), une par CÔTÉ — la géométrie vit
 * en espace ÉCRAN, seule l'attribution côté → auteur se retourne en écriture
 * de droite à gauche.
 *
 * - Le glissé RETIENT la lecture (miroir de `gestureAxis != 0` d'iOS) : la
 *   pause est posée au premier déplacement et rendue au retour — jamais une
 *   pause que l'utilisateur avait déjà demandée.
 * - Commit : la face entrante finit À PLAT (340 ms), puis le contenu change
 *   et les faces reviennent à l'identité AVANT la peinture suivante.
 * - Retour : sans dépassement, la face du côté opposé ne se montre jamais.
 * - `prefers-reduced-motion` : aucune rotation, un fondu de la face voisine ;
 *   la loi de relâchement est la même.
 */
export type StoryCubeNeighbourTarget = { readonly storyId: string };

export type StoryCubeNeighbours<T extends StoryCubeNeighbourTarget> = {
  readonly next: T | null;
  readonly previous: T | null;
};

export type StoryGroupCube<T extends StoryCubeNeighbourTarget> = {
  readonly horizontal: ViewerHorizontalDrag;
  /** La scène courante — combinée par l'hôte avec ses propres refs. */
  readonly faceRef: (element: HTMLElement | null) => void;
  /** Les voisines, par côté d'écran. */
  readonly sides: { readonly left: T | null; readonly right: T | null };
  readonly sideRef: (side: CubeSide) => (element: HTMLElement | null) => void;
};

type Phase = 'idle' | 'dragging' | 'animating';

const ease = cubicBezier(...CUBE_EASING);

/** Une voisine : sa face de cube, ou — mouvement réduit — un fondu sans rotation ; `null` ⇒ masquée. */
function paintNeighbour(element: HTMLElement, face: CubeFace | null, fade: number | null): void {
  if (face === null) {
    element.style.visibility = 'hidden';
    return;
  }
  if (fade !== null) {
    element.style.transform = '';
    element.style.opacity = String(fade);
    element.style.visibility = 'visible';
    return;
  }
  element.style.opacity = '';
  element.style.transform = face.transform;
  element.style.setProperty('--cube-shade', String(face.shade));
  element.style.visibility = face.isFacingViewer ? 'visible' : 'hidden';
}

export function useStoryGroupCube<T extends StoryCubeNeighbourTarget>(params: {
  readonly neighbours: StoryCubeNeighbours<T>;
  /** La story à l'écran : son changement est le signal que le contenu a basculé. */
  readonly storyId: string | undefined;
  readonly rtl: boolean;
  readonly paused: boolean;
  readonly pause: () => void;
  readonly resume: () => void;
  /** Le cube a tourné : la story d'ENTRÉE de l'auteur voisin, et le sens du geste (la télémétrie le compte). */
  readonly onLand: (storyId: string, direction: 'next' | 'previous') => void;
}): StoryGroupCube<T> {
  const latest = useRef(params);
  latest.current = params;
  const sides = useMemo(
    () => (params.rtl ? { left: params.neighbours.next, right: params.neighbours.previous } : { left: params.neighbours.previous, right: params.neighbours.next }),
    [params.rtl, params.neighbours.next, params.neighbours.previous],
  );
  const sidesRef = useRef(sides);
  sidesRef.current = sides;

  const face = useRef<HTMLElement | null>(null);
  const sideElements = useRef<{ left: HTMLElement | null; right: HTMLElement | null }>({ left: null, right: null });
  const phase = useRef<Phase>('idle');
  const ignoring = useRef(false);
  const offset = useRef(0);
  const size = useRef({ width: 1, height: 1 });
  const reduced = useRef(false);
  const frame = useRef(0);
  const ownsPause = useRef(false);
  const awaitingSwap = useRef(false);

  const paint = useCallback((offsetX: number) => {
    const { width, height } = size.current;
    const faces = cubeFaces({ offsetX, width, height });
    for (const side of ['left', 'right'] as const) {
      const element = sideElements.current[side];
      if (element !== null) paintNeighbour(element, faces.incoming?.from === side ? faces.incoming.face : null, reduced.current ? Math.min(1, Math.abs(offsetX) / width) : null);
    }
    const current = face.current;
    if (current === null || reduced.current) return;
    current.style.transform = offsetX === 0 ? '' : faces.current.transform;
    current.style.setProperty('--cube-shade', String(faces.current.shade));
    current.style.visibility = faces.current.isFacingViewer ? '' : 'hidden';
  }, []);

  const stopFrames = useCallback(() => {
    cancelAnimationFrame(frame.current);
    frame.current = 0;
  }, []);

  const reset = useCallback(() => {
    stopFrames();
    offset.current = 0;
    paint(0);
    face.current?.style.removeProperty('--cube-shade');
    phase.current = 'idle';
  }, [paint, stopFrames]);

  const releaseHold = useCallback(() => {
    if (!ownsPause.current) return;
    ownsPause.current = false;
    latest.current.resume();
  }, []);

  const animateTo = useCallback(
    (target: number, durationMs: number, done: () => void) => {
      phase.current = 'animating';
      stopFrames();
      const from = offset.current;
      const start = performance.now();
      const step = () => {
        const progress = Math.min(1, Math.max(0, (performance.now() - start) / durationMs));
        offset.current = from + (target - from) * ease(progress);
        paint(offset.current);
        if (progress < 1) {
          frame.current = requestAnimationFrame(step);
          return;
        }
        frame.current = 0;
        done();
      };
      frame.current = requestAnimationFrame(step);
    },
    [paint, stopFrames],
  );

  const settle = useCallback(() => {
    animateTo(0, CUBE_SETTLE_DURATION_MS, () => {
      reset();
      releaseHold();
    });
  }, [animateTo, reset, releaseHold]);

  const begin = useCallback(() => {
    const current = face.current;
    size.current = { width: Math.max(current?.clientWidth ?? 1, 1), height: Math.max(current?.clientHeight ?? 1, 1) };
    reduced.current = prefersReducedMotion();
    phase.current = 'dragging';
    const { paused, pause } = latest.current;
    if (!paused) {
      ownsPause.current = true;
      pause();
    }
  }, []);

  const horizontal = useMemo<ViewerHorizontalDrag>(
    () => ({
      onMove: (dx) => {
        if (phase.current === 'animating' || ignoring.current) {
          ignoring.current = true;
          return;
        }
        if (phase.current === 'idle') begin();
        const side: CubeSide = dx < 0 ? 'right' : 'left';
        offset.current = displayedTranslation(dx, size.current.width, sidesRef.current[side] !== null);
        if (frame.current !== 0) return;
        frame.current = requestAnimationFrame(() => {
          frame.current = 0;
          paint(offset.current);
        });
      },
      onRelease: ({ dx, predictedDx }) => {
        if (ignoring.current) {
          ignoring.current = false;
          return;
        }
        if (phase.current !== 'dragging') return;
        stopFrames();
        const { rtl, neighbours } = latest.current;
        const outcome = decideGroupSwipe({
          translation: rtl ? -dx : dx,
          predictedEnd: rtl ? -predictedDx : predictedDx,
          width: size.current.width,
          hasNext: neighbours.next !== null,
          hasPrevious: neighbours.previous !== null,
        });
        const target = outcome === 'cancel' ? null : neighbours[outcome];
        if (outcome === 'cancel' || target === null) {
          settle();
          return;
        }
        const towardsLeft = (outcome === 'next') !== rtl;
        animateTo(towardsLeft ? -size.current.width : size.current.width, CUBE_COMMIT_DURATION_MS, () => {
          awaitingSwap.current = true;
          latest.current.onLand(target.storyId, outcome);
          releaseHold();
          /* Filet : une bascule qui n'a rien changé (même story) ne laisse pas la scène tournée. */
          requestAnimationFrame(() => {
            if (!awaitingSwap.current) return;
            awaitingSwap.current = false;
            reset();
          });
        });
      },
      onCancel: () => {
        if (ignoring.current) {
          ignoring.current = false;
          return;
        }
        if (phase.current === 'dragging') settle();
      },
    }),
    [animateTo, begin, paint, releaseHold, reset, settle, stopFrames],
  );

  /* LE CONTENU A BASCULÉ : les faces reviennent à l'identité dans le MÊME
     tour que la nouvelle story, avant que le navigateur ne peigne — la face
     entrante, déjà à plat, est remplacée sans saut. */
  useLayoutEffect(() => {
    if (!awaitingSwap.current) return;
    awaitingSwap.current = false;
    reset();
  }, [params.storyId, reset]);

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  const faceRef = useCallback((element: HTMLElement | null) => {
    face.current = element;
  }, []);
  const sideRefs = useMemo(
    () => ({
      left: (element: HTMLElement | null) => {
        sideElements.current.left = element;
      },
      right: (element: HTMLElement | null) => {
        sideElements.current.right = element;
      },
    }),
    [],
  );
  const sideRef = useCallback((side: CubeSide) => sideRefs[side], [sideRefs]);

  return { horizontal, faceRef, sides, sideRef };
}
