import { appelNatifMethode, coqueCourante } from '@/lib/native-shell';
import { cameraVideoMime, type CameraFacing } from '@/lib/stories/studio-quick-capture';

/**
 * **LA CAMÉRA DU COMPOSER, DERRIÈRE UNE INTERFACE BOUCHONNABLE** (#8654) —
 * même discipline que le micro (`use-recorder.ts`) : le moteur RÉEL
 * (`createBrowserCameraEngine`) n'est appelé par AUCUN témoin ; ils injectent
 * un `CameraEngine` de test.
 */
export type CameraOpenResult =
  | { readonly ok: true; readonly stream: MediaStream; readonly torch: boolean }
  | { readonly ok: false };

export type CameraEngine = {
  readonly open: (facing: CameraFacing) => Promise<CameraOpenResult>;
  /** Résout quand l'image est VIVANTE et l'exposition posée : une photo
   * prise sur la première image sortirait sombre. */
  readonly live: (video: HTMLVideoElement) => Promise<void>;
  /** Le temps que la lumière du flash (écran blanc, torche) atteigne le
   * capteur — deux images peintes, puis un court palier d'exposition. */
  readonly lit: () => Promise<void>;
  readonly setTorch: (stream: MediaStream, on: boolean) => Promise<void>;
  readonly photo: (video: HTMLVideoElement, mirrored: boolean) => Promise<File | null>;
  readonly startRecording: (stream: MediaStream) => void;
  /** `null` : rien d'enregistré (arrêt immédiat, format refusé). */
  readonly stopRecording: () => Promise<File | null>;
  readonly release: (stream: MediaStream) => void;
  /** La luminosité de l'écran au maximum, quand la coque la sert ; rend la
   * fonction qui RESTITUE celle d'avant, ou `null` (un navigateur). */
  readonly maxBrightness: () => Promise<(() => void) | null>;
};

/** Après l'ouverture de la session (miroir `exposureSettle` iOS, 0,35 s). */
const EXPOSURE_SETTLE_MS = 350;
/** La lumière du flash sur le capteur. */
const FLASH_SETTLE_MS = 150;

const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const frames = () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

function stamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

/** `-1` rend la main au réglage du système (`ScreenBrightness`, Android). */
function brightnessOf(value: unknown): number {
  if (typeof value !== 'object' || value === null || !('brightness' in value)) return -1;
  return typeof value.brightness === 'number' ? value.brightness : -1;
}

/** `torch` n'est pas encore dans la bibliothèque DOM de TypeScript : la
 * contrainte (et la capacité) sont déclarées ici, lues telles quelles. */
type TorchConstraint = MediaTrackConstraintSet & { readonly torch?: boolean };

export function createBrowserCameraEngine(): CameraEngine {
  let recorder: MediaRecorder | null = null;
  let chunks: Blob[] = [];

  return {
    async open(facing) {
      if (typeof navigator === 'undefined' || navigator.mediaDevices?.getUserMedia === undefined) return { ok: false };
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facing, width: { ideal: 1080 }, height: { ideal: 1920 } },
          audio: true,
        });
        const track = stream.getVideoTracks()[0];
        const capabilities = (track?.getCapabilities?.() ?? {}) as { readonly torch?: boolean };
        return { ok: true, stream, torch: capabilities.torch === true };
      } catch {
        return { ok: false };
      }
    },
    async live(video) {
      if (video.readyState < 2) {
        await new Promise<void>((resolve) => video.addEventListener('loadeddata', () => resolve(), { once: true }));
      }
      await pause(EXPOSURE_SETTLE_MS);
    },
    async lit() {
      await frames();
      await pause(FLASH_SETTLE_MS);
    },
    async setTorch(stream, on) {
      const track = stream.getVideoTracks()[0];
      const torch: TorchConstraint = { torch: on };
      await track?.applyConstraints({ advanced: [torch] }).catch(() => undefined);
    },
    async photo(video, mirrored) {
      const width = video.videoWidth;
      const height = video.videoHeight;
      if (width === 0 || height === 0) return null;
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (context === null) return null;
      if (mirrored) {
        context.translate(width, 0);
        context.scale(-1, 1);
      }
      context.drawImage(video, 0, 0, width, height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
      return blob === null ? null : new File([blob], `photo-${stamp()}.jpg`, { type: 'image/jpeg' });
    },
    startRecording(stream) {
      const mimeType = typeof MediaRecorder.isTypeSupported === 'function' ? cameraVideoMime((type) => MediaRecorder.isTypeSupported(type)) : undefined;
      chunks = [];
      recorder = new MediaRecorder(stream, mimeType !== undefined ? { mimeType } : undefined);
      recorder.addEventListener('dataavailable', (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      });
      recorder.start();
    },
    stopRecording() {
      const active = recorder;
      recorder = null;
      if (active === null || active.state === 'inactive') return Promise.resolve(null);
      return new Promise((resolve) => {
        active.addEventListener(
          'stop',
          () => {
            const type = (active.mimeType || 'video/webm').split(';')[0] ?? 'video/webm';
            const blob = new Blob(chunks, { type });
            chunks = [];
            resolve(blob.size === 0 ? null : new File([blob], `video-${stamp()}.${type === 'video/mp4' ? 'mp4' : 'webm'}`, { type }));
          },
          { once: true },
        );
        active.stop();
      });
    },
    release(stream) {
      if (recorder !== null && recorder.state !== 'inactive') recorder.stop();
      recorder = null;
      stream.getTracks().forEach((track) => track.stop());
    },
    async maxBrightness() {
      const coque = coqueCourante();
      const set = appelNatifMethode(coque, 'ScreenBrightness', 'setBrightness');
      const get = appelNatifMethode(coque, 'ScreenBrightness', 'getBrightness');
      if (set === null) return null;
      const previous = brightnessOf(get === null ? null : await get({}).catch(() => null));
      await set({ brightness: 1 }).catch(() => undefined);
      return () => void set({ brightness: previous }).catch(() => undefined);
    },
  };
}
