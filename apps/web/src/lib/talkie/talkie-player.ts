/**
 * **LE LECTEUR DE FRAGMENTS DU TALKIE** (#16638, sous-lot `proche-talkie@web`).
 *
 * Le lecteur des vocaux lit des FICHIERS entiers ; le talkie arrive en fragments
 * AAC ADTS de 200 à 500 ms, à jouer DÈS leur arrivée (D-4). Chaque fragment se
 * décode aussitôt (en parallèle des autres) et se planifie À LA SUITE du
 * précédent, dans l'ordre d'arrivée, derrière un tampon de gigue minimal
 * ({@link JITTER_LEAD_S}) : ni trou entre deux fragments, ni chevauchement.
 *
 * L'audio est un PORT ({@link TalkieAudio}) : le navigateur le sert par
 * `AudioContext` ({@link browserTalkieAudio}), les témoins par un double. Sans
 * audio (navigateur sans Web Audio), rien ne joue et rien ne casse : la copie en
 * message vocal, envoyée après la prise de parole, prend le relais.
 */

import { talkieLevelMeters, talkieWaveRms, type TalkieLevelMeter } from './talkie-header-law';

/** Le tampon de gigue : assez pour absorber l'écart entre deux fragments, trop peu pour s'entendre. */
export const JITTER_LEAD_S = 0.08;

export type DecodedChunk = { readonly duration: number };

export type TalkieAudio<B extends DecodedChunk = DecodedChunk> = {
  readonly currentTime: () => number;
  readonly resume: () => void;
  readonly decode: (bytes: Uint8Array) => Promise<B>;
  /** Démarre `buffer` à l'instant `at` de l'horloge audio ; rend de quoi le couper. */
  readonly start: (buffer: B, at: number) => () => void;
};

/** Ce que la liaison socket demande au lecteur. */
export type TalkieSink = {
  readonly play: (talkieId: string, bytes: Uint8Array) => void;
  /** Coupe SUR-LE-CHAMP : ce qui sonne s'arrête, ce qui se décodait est jeté. */
  readonly silence: (talkieId: string) => void;
  /** La prise de parole est finie : ce qui est en file finit de sonner, puis le lecteur l'oublie. */
  readonly release: (talkieId: string) => void;
};

export type TalkiePlayer = TalkieSink & { readonly size: () => number };

type Track = { chain: Promise<void>; nextAt: number; silenced: boolean; readonly stops: Set<() => void> };

export function createTalkiePlayer<B extends DecodedChunk>({ audio }: { readonly audio: () => TalkieAudio<B> | null }): TalkiePlayer {
  const tracks = new Map<string, Track>();

  const trackOf = (talkieId: string): Track => {
    const known = tracks.get(talkieId);
    if (known !== undefined) return known;
    const created: Track = { chain: Promise.resolve(), nextAt: 0, silenced: false, stops: new Set() };
    tracks.set(talkieId, created);
    return created;
  };

  const schedule = (port: TalkieAudio<B>, track: Track, buffer: B): void => {
    if (track.silenced) return;
    const at = Math.max(port.currentTime() + JITTER_LEAD_S, track.nextAt);
    track.nextAt = at + buffer.duration;
    track.stops.add(port.start(buffer, at));
  };

  return {
    play: (talkieId, bytes) => {
      const port = audio();
      if (port === null) return;
      port.resume();
      const track = trackOf(talkieId);
      const decoded = port.decode(bytes).then(
        (buffer) => buffer,
        () => null,
      );
      track.chain = track.chain.then(async () => {
        const buffer = await decoded;
        if (buffer !== null) schedule(port, track, buffer);
      });
    },
    silence: (talkieId) => {
      const track = tracks.get(talkieId);
      if (track === undefined) return;
      track.silenced = true;
      track.stops.forEach((stop) => stop());
      track.stops.clear();
      tracks.delete(talkieId);
    },
    release: (talkieId) => {
      const track = tracks.get(talkieId);
      if (track === undefined) return;
      void track.chain.then(() => {
        if (tracks.get(talkieId) === track) tracks.delete(talkieId);
      });
    },
    size: () => tracks.size,
  };
}

type AudioContextConstructor = new () => AudioContext;

const contextConstructor = (): AudioContextConstructor | null => {
  if (typeof window === 'undefined') return null;
  const legacy = (window as Window & { readonly webkitAudioContext?: AudioContextConstructor }).webkitAudioContext;
  return window.AudioContext ?? legacy ?? null;
};

/** La fenêtre de l'analyseur : ~21 ms à 48 kHz, assez pour un niveau, trop peu pour retarder l'onde. */
const ANALYSER_FFT_SIZE = 1_024;

/**
 * L'audio du navigateur, créé au premier fragment (jamais au chargement) et gardé pour les suivants. Chaque fragment
 * passe par un analyseur que l'onde de l'en-tête lit à la demande (#17338) : le niveau de la voix qui arrive.
 */
export function browserTalkieAudio({
  Context: resolveContext = contextConstructor,
  meter = talkieLevelMeters.incoming,
}: { readonly Context?: () => AudioContextConstructor | null; readonly meter?: Pick<TalkieLevelMeter, 'probe'> } = {}): () => TalkieAudio<AudioBuffer> | null {
  let port: TalkieAudio<AudioBuffer> | null = null;
  return () => {
    if (port !== null) return port;
    const Context = resolveContext();
    if (Context === null) return null;
    const context = new Context();
    const analyser = context.createAnalyser();
    analyser.fftSize = ANALYSER_FFT_SIZE;
    analyser.connect(context.destination);
    const frame = new Float32Array(ANALYSER_FFT_SIZE);
    meter.probe(() => {
      analyser.getFloatTimeDomainData(frame);
      return talkieWaveRms(frame);
    });
    port = {
      currentTime: () => context.currentTime,
      resume: () => {
        if (context.state === 'suspended') void context.resume().catch(() => undefined);
      },
      decode: (bytes) => context.decodeAudioData(bytes.slice().buffer),
      start: (buffer, at) => {
        const source = context.createBufferSource();
        source.buffer = buffer;
        source.connect(analyser);
        source.start(at);
        return () => {
          try {
            source.stop();
          } catch {
            return;
          }
        };
      },
    };
    return port;
  };
}

export const talkiePlayer: TalkiePlayer = createTalkiePlayer({ audio: browserTalkieAudio() });
