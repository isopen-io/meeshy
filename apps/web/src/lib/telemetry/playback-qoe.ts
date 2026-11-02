import type { PlaybackExitReason, PlaybackSummary } from '@/lib/api/social-events-v2-types';

import type { PlaybackPageProbe } from './page-vitals';

/**
 * **LA QUALITÉ D'UNE SÉANCE DE LECTURE** (#10504, décision § 4) — le résumé
 * Mux/Conviva d'un `<video>` ou d'un `<audio>` : démarrage, attentes de
 * débit, erreurs (un CODE, jamais un message), pauses, sauts, son, boucles,
 * quartiles atteints. Un seul résumé, à la fin de la séance (fermeture,
 * glissement, arrière-plan) : rien ne part pendant la lecture, aucun
 * battement. `dwell` garde ses échantillons ; `playback` le complète.
 */
type At = { readonly at: number };

export type PlaybackSignal =
  | ['loadstart', At]
  | ['playing', At]
  | ['waiting', At]
  | ['stalled', At]
  | ['seeking', At]
  | ['seeked', At]
  | ['pause', At]
  | ['ended', At]
  | ['volumechange', At & { readonly muted: boolean }]
  | ['error', At & { readonly errorCode: number | null }]
  | ['timeupdate', At & { readonly currentTime: number; readonly duration: number }];

type SignalName = PlaybackSignal[0];
type SignalData<N extends SignalName> = Extract<PlaybackSignal, [N, unknown]>[1];

const MEDIA_ERRORS: Readonly<Record<number, string>> = {
  1: 'MEDIA_ERR_ABORTED',
  2: 'MEDIA_ERR_NETWORK',
  3: 'MEDIA_ERR_DECODE',
  4: 'MEDIA_ERR_SRC_NOT_SUPPORTED',
};

const QUARTILE_BITS = [
  [0.25, 1],
  [0.5, 2],
  [0.75, 4],
  [0.97, 8],
] as const;

export function createPlaybackAccumulator(params: { readonly playbackId: string; readonly mediaId: string; readonly mutedAtStart: boolean; readonly startedAt: number }) {
  let loadAt = params.startedAt;
  let firstFrameAt: number | null = null;
  let rebufferSince: number | null = null;
  let seeking = false;
  let rebufferCount = 0;
  let rebufferMs = 0;
  let pauses = 0;
  let seeks = 0;
  let loops = 0;
  let muted = params.mutedAtStart;
  let muteToggles = 0;
  let quartiles = 0;
  let playedMs = 0;
  let lastTime: number | null = null;
  let lastWall = params.startedAt;
  let ended = false;
  let errorCode: string | null = null;

  const closeRebuffer = (at: number) => {
    if (rebufferSince === null) return;
    rebufferMs += Math.max(0, at - rebufferSince);
    rebufferSince = null;
  };

  function on<N extends SignalName>(name: N, data: SignalData<N>): void {
    const { at } = data;
    switch (name) {
      case 'loadstart':
        if (firstFrameAt === null) loadAt = at;
        return;
      case 'playing':
        if (firstFrameAt === null) firstFrameAt = at;
        closeRebuffer(at);
        ended = false;
        return;
      case 'waiting':
      case 'stalled':
        if (firstFrameAt === null || seeking || rebufferSince !== null) return;
        rebufferCount += 1;
        rebufferSince = at;
        return;
      case 'seeking':
        seeks += 1;
        seeking = true;
        return;
      case 'seeked':
        seeking = false;
        return;
      case 'pause':
        if (!ended) pauses += 1;
        return;
      case 'ended':
        ended = true;
        return;
      case 'volumechange': {
        const next = (data as SignalData<'volumechange'>).muted;
        if (next !== muted) muteToggles += 1;
        muted = next;
        return;
      }
      case 'error': {
        const code = (data as SignalData<'error'>).errorCode;
        errorCode = code === null ? 'MEDIA_ERR_UNKNOWN' : MEDIA_ERRORS[code] ?? 'MEDIA_ERR_UNKNOWN';
        return;
      }
      case 'timeupdate': {
        const { currentTime, duration } = data as SignalData<'timeupdate'>;
        if (lastTime !== null) {
          const delta = currentTime - lastTime;
          const wall = Math.max(0, at - lastWall) / 1000;
          if (delta > 0 && delta <= wall + 0.5) playedMs += delta * 1000;
          if (delta < -1 && duration > 0 && lastTime >= duration * 0.9 && currentTime <= duration * 0.1) loops += 1;
        }
        if (duration > 0 && Number.isFinite(duration)) {
          QUARTILE_BITS.forEach(([fraction, bit]) => {
            if (currentTime >= duration * fraction) quartiles |= bit;
          });
        }
        lastTime = currentTime;
        lastWall = at;
        return;
      }
    }
  }

  function finish(params2: { readonly at: number; readonly exitReason: PlaybackExitReason; readonly durationMs: number }): PlaybackSummary {
    closeRebuffer(params2.at);
    const startupEnd = firstFrameAt ?? params2.at;
    return {
      playbackId: params.playbackId,
      mediaId: params.mediaId,
      mediaDurationMs: Math.max(0, Math.round(params2.durationMs)),
      startupMs: Math.max(0, Math.round(startupEnd - loadAt)),
      exitBeforeStart: firstFrameAt === null,
      playedMs: Math.round(playedMs),
      rebufferCount,
      rebufferMs: Math.round(rebufferMs),
      ...(errorCode === null ? {} : { errorCode, errorDomain: 'html5' }),
      renditionChanges: 0,
      loops,
      pauses,
      seeks,
      mutedAtStart: params.mutedAtStart,
      muteToggles,
      captionsOn: false,
      quartiles,
      exitReason: params2.exitReason,
    };
  }

  return { on, finish };
}

type MediaLike = {
  readonly currentTime: number;
  readonly duration: number;
  readonly muted: boolean;
  readonly error: { readonly code: number } | null;
  addEventListener(type: string, run: () => void, options?: { passive: true }): void;
  removeEventListener(type: string, run: () => void): void;
};

const EVENTS = ['loadstart', 'playing', 'waiting', 'stalled', 'seeking', 'seeked', 'pause', 'ended', 'volumechange', 'error', 'timeupdate'] as const;

/**
 * L'accumulateur branché sur un élément média. `finish` rend le résumé UNE
 * fois (au plus) et retire les écoutes ; un second appel ne fait rien.
 *
 * `probe` (W11, #11317) : ouverte avec la séance, fermée avec elle — le tier
 * de l'appareil, les Web Vitals de la page et les longues images survenues
 * PENDANT la séance rejoignent le résumé, sans jamais en réécrire un champ.
 */
export function bindPlaybackQoe(
  media: MediaLike,
  params: {
    readonly playbackId: string;
    readonly mediaId: string;
    readonly now: () => number;
    readonly probe?: PlaybackPageProbe;
    readonly onSummary: (summary: PlaybackSummary) => void;
  },
): { readonly finish: (exitReason: PlaybackExitReason) => void } {
  const page = params.probe?.open();
  const accumulator = createPlaybackAccumulator({ playbackId: params.playbackId, mediaId: params.mediaId, mutedAtStart: media.muted, startedAt: params.now() });
  const handlers = EVENTS.map((name) => {
    const run = (): void => {
      const at = params.now();
      if (name === 'volumechange') accumulator.on(name, { at, muted: media.muted });
      else if (name === 'error') accumulator.on(name, { at, errorCode: media.error?.code ?? null });
      else if (name === 'timeupdate') accumulator.on(name, { at, currentTime: media.currentTime, duration: media.duration });
      else accumulator.on(name, { at });
    };
    media.addEventListener(name, run, { passive: true });
    return [name, run] as const;
  });
  let done = false;
  return {
    finish(exitReason) {
      if (done) return;
      done = true;
      handlers.forEach(([name, run]) => media.removeEventListener(name, run));
      const durationMs = Number.isFinite(media.duration) ? media.duration * 1000 : 0;
      const summary = accumulator.finish({ at: params.now(), exitReason, durationMs });
      params.onSummary(page === undefined ? summary : { ...page.close(), ...summary });
    },
  };
}
