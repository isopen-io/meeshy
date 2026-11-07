import type { TalkieCapture, TalkieCaptureFactory } from './talkie-sender';

/**
 * **LE MICRO DU TALKIE, ENCODÉ EN AAC ADTS PAR LE NAVIGATEUR** (#16641) — le
 * contrat ne relaie qu'un encodage (`aac-adts`, celui du vocal, lisible dès la
 * première trame). `MediaRecorder` rend du WebM/Opus ou du MP4 : il ne convient
 * pas. Ce module passe par WebCodecs :
 *
 * micro (`getUserMedia`) → `MediaStreamTrackProcessor` (des `AudioData`) →
 * `AudioEncoder` (`mp4a.40.2`, `aac.format = 'adts'`) → une trame ADTS par sortie.
 *
 * **Là où l'un des maillons manque** (Firefox n'encode pas l'AAC, Safari n'expose
 * le processeur de piste qu'aux workers), `talkieEncodingSupported` rend `false`
 * et l'interface propose le message vocal — jamais un bouton qui échoue.
 */

/** 64 kb/s mono : la voix, comme le vocal. */
export const TALKIE_AAC_BITRATE = 64_000;
const TALKIE_AAC_CODEC = 'mp4a.40.2';
const PROBE_SAMPLE_RATE = 48_000;

type AacConfig = {
  readonly codec: string;
  readonly sampleRate: number;
  readonly numberOfChannels: number;
  readonly bitrate: number;
  readonly aac: { readonly format: 'adts' };
};

type EncodedChunkLike = { readonly byteLength: number; readonly duration: number | null; copyTo(destination: Uint8Array): void };
type AudioDataLike = { readonly sampleRate: number; readonly numberOfChannels: number; close(): void };

type AudioEncoderLike = {
  readonly state: string;
  configure(config: AacConfig): void;
  encode(data: AudioDataLike): void;
  flush(): Promise<void>;
  close(): void;
};

type AudioEncoderCtor = {
  new (init: { readonly output: (chunk: EncodedChunkLike) => void; readonly error: (error: unknown) => void }): AudioEncoderLike;
  isConfigSupported(config: AacConfig): Promise<{ readonly supported?: boolean }>;
};

type TrackProcessorCtor = new (init: { readonly track: MediaStreamTrack }) => { readonly readable: ReadableStream<AudioDataLike> };

export type TalkieEncoderEnv = {
  readonly AudioEncoder?: AudioEncoderCtor | undefined;
  readonly MediaStreamTrackProcessor?: TrackProcessorCtor | undefined;
  readonly getUserMedia?: ((constraints: MediaStreamConstraints) => Promise<MediaStream>) | undefined;
};

export function browserTalkieEnv(): TalkieEncoderEnv {
  const scope = globalThis as unknown as { readonly AudioEncoder?: AudioEncoderCtor; readonly MediaStreamTrackProcessor?: TrackProcessorCtor; readonly navigator?: Navigator };
  const devices = scope.navigator?.mediaDevices;
  return {
    AudioEncoder: scope.AudioEncoder,
    MediaStreamTrackProcessor: scope.MediaStreamTrackProcessor,
    getUserMedia: typeof devices?.getUserMedia === 'function' ? (constraints) => devices.getUserMedia(constraints) : undefined,
  };
}

export const aacConfigFor = (sampleRate: number, numberOfChannels: number): AacConfig => ({
  codec: TALKIE_AAC_CODEC,
  sampleRate,
  numberOfChannels,
  bitrate: TALKIE_AAC_BITRATE,
  aac: { format: 'adts' },
});

/** Ce navigateur peut-il capter ET encoder l'AAC ADTS ? Une seule réponse par onglet. */
export async function talkieEncodingSupported(env: TalkieEncoderEnv = browserTalkieEnv()): Promise<boolean> {
  if (env.AudioEncoder === undefined || env.MediaStreamTrackProcessor === undefined || env.getUserMedia === undefined) return false;
  try {
    const probe = await env.AudioEncoder.isConfigSupported(aacConfigFor(PROBE_SAMPLE_RATE, 1));
    return probe.supported === true;
  } catch {
    return false;
  }
}

let cachedSupport: Promise<boolean> | null = null;
export const talkieEncodingSupportedOnce = (): Promise<boolean> => (cachedSupport ??= talkieEncodingSupported());

/** Une trame AAC dure 1024 échantillons : sa durée se déduit quand le navigateur ne la donne pas. */
const frameDurationMs = (chunk: EncodedChunkLike, sampleRate: number): number => (chunk.duration !== null && chunk.duration > 0 ? chunk.duration / 1_000 : (1_024 / sampleRate) * 1_000);

export function createTalkieCapture(env: TalkieEncoderEnv = browserTalkieEnv()): TalkieCaptureFactory {
  return async ({ onFrame }) => {
    const { AudioEncoder, MediaStreamTrackProcessor, getUserMedia } = env;
    if (AudioEncoder === undefined || MediaStreamTrackProcessor === undefined || getUserMedia === undefined) throw new Error('talkie-unsupported');
    const stream = await getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    const track = stream.getAudioTracks()[0];
    if (track === undefined) {
      stream.getTracks().forEach((t) => t.stop());
      throw new Error('talkie-no-track');
    }
    let sampleRate = PROBE_SAMPLE_RATE;
    const encoder = new AudioEncoder({
      output: (chunk) => {
        const bytes = new Uint8Array(chunk.byteLength);
        chunk.copyTo(bytes);
        onFrame(bytes, frameDurationMs(chunk, sampleRate));
      },
      error: () => track.stop(),
    });
    const reader = new MediaStreamTrackProcessor({ track }).readable.getReader();
    const pump = (async () => {
      for (;;) {
        const { value, done } = await reader.read().catch(() => ({ value: undefined, done: true as const }));
        if (done || value === undefined) return;
        if (encoder.state === 'unconfigured') {
          sampleRate = value.sampleRate;
          encoder.configure(aacConfigFor(value.sampleRate, value.numberOfChannels));
        }
        if (encoder.state === 'configured') encoder.encode(value);
        value.close();
      }
    })();
    const handle: TalkieCapture = {
      stop: async () => {
        track.stop();
        await reader.cancel().catch(() => undefined);
        await pump;
        if (encoder.state === 'configured') await encoder.flush().catch(() => undefined);
        if (encoder.state !== 'closed') encoder.close();
        stream.getTracks().forEach((t) => t.stop());
      },
    };
    return handle;
  };
}
