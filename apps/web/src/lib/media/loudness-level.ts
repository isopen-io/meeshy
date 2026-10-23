import { useEffect, useMemo } from 'react';

import { mediaImageCrossOrigin } from '@/lib/net/api-runtime-cache';

import { loudnessPlan, type LoudnessPlan } from './loudness';

/**
 * **LE NIVEAU D'UN VOCAL, APPLIQUÉ À SON ÉLÉMENT** (#12285, web).
 *
 * - Atténuer : le volume de l'élément (≤ 1), sans graphe ni CORS.
 * - Amplifier : le graphe Web Audio (source → gain → limiteur → sortie). Le
 *   limiteur (seuil −1 dBFS, ratio 20) retient les crêtes que le gain
 *   ferait écrêter. L'élément n'est routé qu'UNE fois (le navigateur refuse une
 *   seconde source sur le même élément) ; un plan qui change ne fait que
 *   changer le gain. Le contexte, suspendu tant que la page n'a pas eu de
 *   geste, est repris à chaque `play`.
 * - Sans graphe (navigateur ancien, témoins) : rien, le son d'avant.
 *
 * L'amplification exige que l'élément demande le mode CORS
 * (`loudnessAttributes`) : la route de flux de la passerelle rend
 * `Access-Control-Allow-Origin: *` (`mediaImageCrossOrigin`, la même
 * affirmation que pour les images). Ailleurs, le plan n'amplifie pas.
 */
export type LoudnessRoute = {
  readonly setGain: (gain: number) => void;
  readonly resume: () => void;
  readonly release: () => void;
};

export type LoudnessGraph = { readonly route: (element: HTMLMediaElement, gain: number) => LoudnessRoute | null };

type Routed = { readonly route: LoudnessRoute; readonly onPlay: () => void };

export type LoudnessApplier = {
  readonly apply: (element: HTMLMediaElement, plan: LoudnessPlan) => void;
  readonly release: (element: HTMLMediaElement) => void;
};

const gainOf = (plan: LoudnessPlan): number => (plan.kind === 'boost' ? plan.gain : plan.kind === 'attenuate' ? plan.volume : 1);

export function createLoudnessApplier(graph: LoudnessGraph): LoudnessApplier {
  const routed = new WeakMap<HTMLMediaElement, Routed>();
  const apply = (element: HTMLMediaElement, plan: LoudnessPlan): void => {
    const existing = routed.get(element);
    if (existing !== undefined) {
      existing.route.setGain(gainOf(plan));
      return;
    }
    if (plan.kind !== 'boost') {
      element.volume = gainOf(plan);
      return;
    }
    const route = graph.route(element, plan.gain);
    if (route === null) return;
    const onPlay = (): void => route.resume();
    element.addEventListener('play', onPlay);
    routed.set(element, { route, onPlay });
  };
  const release = (element: HTMLMediaElement): void => {
    const existing = routed.get(element);
    if (existing === undefined) return;
    element.removeEventListener('play', existing.onPlay);
    existing.route.release();
    routed.delete(element);
  };
  return { apply, release };
}

type AudioContextCtor = new () => AudioContext;

const audioContextCtor = (): AudioContextCtor | null => {
  if (typeof window !== 'object') return null;
  const scope = window as unknown as { AudioContext?: AudioContextCtor; webkitAudioContext?: AudioContextCtor };
  return scope.AudioContext ?? scope.webkitAudioContext ?? null;
};

const shared: { context?: AudioContext } = {};

function sharedContext(): AudioContext | null {
  if (shared.context !== undefined) return shared.context;
  const Ctor = audioContextCtor();
  if (Ctor === null) return null;
  shared.context = new Ctor();
  return shared.context;
}

const LIMITER = { threshold: -1, knee: 0, ratio: 20, attack: 0.003, release: 0.1 } as const;

export const browserLoudnessGraph: LoudnessGraph = {
  route: (element, gain) => {
    const context = sharedContext();
    if (context === null) return null;
    try {
      const source = context.createMediaElementSource(element);
      const amplifier = context.createGain();
      amplifier.gain.value = gain;
      const limiter = context.createDynamicsCompressor();
      limiter.threshold.value = LIMITER.threshold;
      limiter.knee.value = LIMITER.knee;
      limiter.ratio.value = LIMITER.ratio;
      limiter.attack.value = LIMITER.attack;
      limiter.release.value = LIMITER.release;
      source.connect(amplifier).connect(limiter).connect(context.destination);
      return {
        setGain: (next) => {
          amplifier.gain.value = next;
        },
        resume: () => {
          if (context.state === 'suspended') void context.resume().catch(() => undefined);
        },
        release: () => {
          source.disconnect();
          amplifier.disconnect();
          limiter.disconnect();
        },
      };
    } catch {
      return null;
    }
  },
};

const browserApplier = createLoudnessApplier(browserLoudnessGraph);

export const loudnessAttributes = (plan: LoudnessPlan): { readonly crossOrigin?: 'anonymous' } =>
  plan.kind === 'boost' ? { crossOrigin: 'anonymous' } : {};

/**
 * Le plan d'un vocal monté, appliqué à son élément ; rend les attributs que
 * l'`<audio>` doit porter (le mode CORS quand il faut amplifier).
 */
export function useLoudnessLevel(params: {
  readonly element: HTMLMediaElement | null;
  readonly lufs: number | null | undefined;
  readonly playsOriginal: boolean;
  /** L'adresse RÉSOLUE que joue l'élément. */
  readonly src: string;
  readonly applier?: LoudnessApplier;
}): { readonly crossOrigin?: 'anonymous' } {
  const { element, lufs, playsOriginal, src } = params;
  const applier = params.applier ?? browserApplier;
  const boostable = mediaImageCrossOrigin(src) === 'anonymous';
  const plan = useMemo(() => loudnessPlan({ lufs, playsOriginal, boostable }), [lufs, playsOriginal, boostable]);

  useEffect(() => {
    if (element !== null) applier.apply(element, plan);
  }, [applier, element, plan]);

  useEffect(() => {
    if (element === null) return undefined;
    return () => applier.release(element);
  }, [applier, element]);

  return loudnessAttributes(plan);
}
