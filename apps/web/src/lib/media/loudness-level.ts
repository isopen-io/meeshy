import { useEffect, useMemo, useRef, useState } from 'react';

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

/**
 * **LA PREUVE CORS** (#12285, tour 5) — un élément audio branché sur un graphe
 * Web Audio alors que sa réponse n'est pas lisible en CORS sort du SILENCE. La
 * preuve se prend donc AVANT de demander le mode CORS à l'élément : une sonde
 * `HEAD` en mode `cors`, une fois par origine. Elle lève quand l'en-tête manque
 * (`refused`) ; elle répond quand il est là (`readable`). Un chargement en CORS
 * qui échoue ensuite retire la preuve pour l'origine.
 */
export type CorsVerdict = 'unknown' | 'readable' | 'refused';

export type CorsLedger = {
  readonly verdict: (src: string) => CorsVerdict;
  readonly probe: (src: string) => Promise<CorsVerdict>;
  readonly refuse: (src: string) => void;
};

const originOf = (src: string): string => {
  try {
    return new URL(src, typeof location === 'object' ? location.href : 'https://meeshy.invalid').origin;
  } catch {
    return src;
  }
};

export function createCorsLedger(check: (src: string) => Promise<boolean>): CorsLedger {
  const verdicts = new Map<string, CorsVerdict>();
  const pending = new Map<string, Promise<CorsVerdict>>();
  const verdict = (src: string): CorsVerdict => verdicts.get(originOf(src)) ?? 'unknown';
  const probe = (src: string): Promise<CorsVerdict> => {
    const origin = originOf(src);
    const known = verdicts.get(origin);
    if (known !== undefined) return Promise.resolve(known);
    const inFlight = pending.get(origin);
    if (inFlight !== undefined) return inFlight;
    const run = check(src)
      .catch(() => false)
      .then((readable) => {
        if (!verdicts.has(origin)) verdicts.set(origin, readable ? 'readable' : 'refused');
        pending.delete(origin);
        return verdicts.get(origin) ?? 'refused';
      });
    pending.set(origin, run);
    return run;
  };
  return { verdict, probe, refuse: (src) => verdicts.set(originOf(src), 'refused') };
}

const browserCorsLedger = createCorsLedger(async (src) => {
  if (typeof fetch !== 'function') return false;
  const response = await fetch(src, { method: 'HEAD', mode: 'cors', credentials: 'omit', cache: 'no-store' });
  return response.ok;
});

export type LoudnessLevel = {
  /** À répandre sur l'`<audio>` : le mode CORS, seulement quand la preuve est faite. */
  readonly attributes: { readonly crossOrigin?: 'anonymous' };
  /** À ajouter à la `key` de l'`<audio>` : change quand un chargement en CORS a échoué, pour remonter l'élément en lecture directe. */
  readonly remountKey: string;
};

type LoadState = { readonly corsAtLoad: boolean | null; readonly readable: boolean; readonly failed: boolean };

const FRESH: LoadState = { corsAtLoad: null, readable: false, failed: false };

/**
 * Le niveau d'un vocal monté, appliqué à son élément. SÛR PAR DÉFAUT : le
 * graphe Web Audio n'est branché qu'après DEUX preuves — la sonde CORS de
 * l'origine, puis les métadonnées lues par un élément PARTI en
 * `crossOrigin="anonymous"`. Un élément parti sans le mode CORS le garde, sans
 * gain ; un élément parti en CORS qui échoue est remonté en lecture directe.
 * L'atténuation, elle, ne passe que par le volume et n'attend rien.
 */
export function useLoudnessLevel(params: {
  readonly element: HTMLMediaElement | null;
  readonly lufs: number | null | undefined;
  readonly playsOriginal: boolean;
  /** L'adresse RÉSOLUE que joue l'élément. */
  readonly src: string;
  readonly applier?: LoudnessApplier;
  readonly ledger?: CorsLedger;
}): LoudnessLevel {
  const { element, lufs, playsOriginal, src } = params;
  const applier = params.applier ?? browserApplier;
  const ledger = params.ledger ?? browserCorsLedger;
  const [, setProbed] = useState(0);
  const [load, setLoad] = useState<LoadState>(FRESH);
  const [remounts, setRemounts] = useState(0);
  const loadRef = useRef<LoadState>(FRESH);

  const streamRoute = mediaImageCrossOrigin(src) === 'anonymous';
  const verdict = ledger.verdict(src);
  const plan = useMemo(() => loudnessPlan({ lufs, playsOriginal, boostable: streamRoute }), [lufs, playsOriginal, streamRoute]);
  const wantsCors = plan.kind === 'boost' && verdict === 'readable';
  const crossOrigin = load.corsAtLoad ?? wantsCors;

  useEffect(() => {
    if (plan.kind !== 'boost' || verdict !== 'unknown') return undefined;
    const alive = { current: true };
    void ledger.probe(src).then(() => {
      if (alive.current) setProbed((count) => count + 1);
    });
    return () => {
      alive.current = false;
    };
  }, [ledger, plan.kind, src, verdict]);

  useEffect(() => {
    if (element === null) return undefined;
    const update = (next: LoadState): void => {
      loadRef.current = next;
      setLoad(next);
    };
    update(FRESH);
    const onLoadStart = (): void => {
      if (loadRef.current.corsAtLoad === null) update({ ...loadRef.current, corsAtLoad: element.crossOrigin === 'anonymous' });
    };
    const onMetadata = (): void => {
      if (loadRef.current.corsAtLoad === true) update({ ...loadRef.current, readable: true });
    };
    const onError = (): void => {
      if (loadRef.current.corsAtLoad !== true || loadRef.current.readable) return;
      ledger.refuse(src);
      update({ ...loadRef.current, failed: true });
      setRemounts((count) => count + 1);
    };
    element.addEventListener('loadstart', onLoadStart);
    element.addEventListener('loadedmetadata', onMetadata);
    element.addEventListener('error', onError);
    return () => {
      element.removeEventListener('loadstart', onLoadStart);
      element.removeEventListener('loadedmetadata', onMetadata);
      element.removeEventListener('error', onError);
    };
  }, [element, ledger, src]);

  const applied: LoudnessPlan = plan.kind === 'boost' && !load.readable ? { kind: 'none' } : plan;

  useEffect(() => {
    if (element !== null) applier.apply(element, applied);
  }, [applier, element, applied.kind, gainOf(applied)]);

  useEffect(() => {
    if (element === null) return undefined;
    return () => applier.release(element);
  }, [applier, element]);

  return { attributes: crossOrigin && !load.failed ? { crossOrigin: 'anonymous' } : {}, remountKey: remounts === 0 ? '' : `:direct${remounts}` };
}
