import { loadPlanSources, paintCompositePlan, studioCompositePlan } from './studio-composite-plan';
import { cameraVideoMime } from './studio-quick-capture';
import { studioPageVideo, type StudioPage, type StudioVisualAsset } from './studio-page';
import { paintText, studioTextOps, withMeasuredImages, type StudioRetouchCanvas } from './studio-retouch';

/**
 * **UNE VIDÉO RETOUCHÉE REPART EN VIDÉO** (#9124, miroir de
 * `ComposerSceneExportController.bakeForMessage` iOS) — la scène est repeinte
 * à chaque image d'un `<video>` qui joue, dans un canvas enregistré
 * (`MediaRecorder`) avec le SON de la vidéo ; le fichier rendu remplace la
 * pièce en attente. Sans habillage : la vidéo ne sort pas de Meeshy.
 *
 * L'enregistrement dure le temps de la vidéo — c'est le prix d'un rendu sans
 * encodeur natif dans le navigateur.
 */
export const STUDIO_RETOUCH_VIDEO_SIZE = { width: 720, height: 1280 } as const;

export type StudioRetouchVideoSource = {
  readonly frame: CanvasImageSource;
  readonly aspectRatio: number;
  readonly audioTracks: readonly MediaStreamTrack[];
  /** Joue la vidéo de bout en bout, `onFrame` à chaque image ; résolue à la fin. */
  readonly play: (onFrame: () => void) => Promise<void>;
  readonly release: () => void;
};

export type StudioRetouchVideoDeps = {
  readonly createSurface: (width: number, height: number) => { readonly context: StudioRetouchCanvas['context']; readonly videoTracks: () => readonly MediaStreamTrack[] } | null;
  readonly loadImage: (src: string) => Promise<CanvasImageSource | null>;
  readonly loadVideo: (src: string) => Promise<StudioRetouchVideoSource | null>;
  readonly record: (tracks: readonly MediaStreamTrack[]) => { readonly mimeType: string; readonly stop: () => Promise<Blob | null> } | null;
};

function withVideoRatio(page: StudioPage, src: string, aspectRatio: number): StudioPage {
  const measured = (asset: StudioVisualAsset | null) => (asset !== null && asset.previewUrl === src && asset.aspectRatio === undefined ? { ...asset, aspectRatio } : asset);
  return { ...page, background: measured(page.background), overlay: measured(page.overlay) };
}

export async function renderStudioRetouchVideo(unmeasured: StudioPage, deps: StudioRetouchVideoDeps): Promise<{ readonly blob: Blob; readonly mimeType: string } | null> {
  const asset = studioPageVideo(unmeasured);
  if (asset === null) return null;
  const source = await deps.loadVideo(asset.previewUrl);
  if (source === null) return null;
  try {
    const page = withVideoRatio(await withMeasuredImages(unmeasured, deps.loadImage), asset.previewUrl, source.aspectRatio);
    const plan = studioCompositePlan(page, { video: true });
    const { width, height } = STUDIO_RETOUCH_VIDEO_SIZE;
    const surface = plan === null ? null : deps.createSurface(width, height);
    if (plan === null || surface === null) return null;
    const sources = await loadPlanSources(plan, (src) => (src === asset.previewUrl ? Promise.resolve(source.frame) : deps.loadImage(src)));
    if (sources === null) return null;
    const recorder = deps.record([...surface.videoTracks(), ...source.audioTracks]);
    if (recorder === null) return null;
    const texts = studioTextOps(page);
    const paint = () => {
      paintCompositePlan(surface.context, plan, sources, STUDIO_RETOUCH_VIDEO_SIZE);
      texts.forEach((op) => paintText(surface.context, op, width, height));
    };
    paint();
    await source.play(paint);
    const blob = await recorder.stop();
    return blob === null ? null : { blob, mimeType: recorder.mimeType };
  } finally {
    source.release();
  }
}

export function retouchedVideoFileName(name: string, mimeType: string): string {
  const dot = name.lastIndexOf('.');
  return `${dot > 0 ? name.slice(0, dot) : name}-retouche.${mimeType.startsWith('video/mp4') ? 'mp4' : 'webm'}`;
}

/** Le navigateur réel : un canvas capturé à 30 images/s, le son de la vidéo
 * tiré par Web Audio (jamais vers les haut-parleurs), `MediaRecorder` dans le
 * premier conteneur que le navigateur sait écrire (`cameraVideoMime`). */
export const browserRetouchVideoDeps: StudioRetouchVideoDeps = {
  createSurface: (width, height) => {
    if (typeof document === 'undefined') return null;
    const element = document.createElement('canvas');
    element.width = width;
    element.height = height;
    const context = element.getContext('2d');
    if (context === null || typeof element.captureStream !== 'function') return null;
    const stream = element.captureStream(30);
    return { context, videoTracks: () => stream.getVideoTracks() };
  },
  loadImage: async (src) => {
    if (typeof Image === 'undefined') return null;
    const image = new Image();
    image.src = src;
    try {
      await image.decode();
      await document.fonts?.ready;
      return image;
    } catch {
      return null;
    }
  },
  loadVideo: async (src) => {
    if (typeof document === 'undefined') return null;
    const video = document.createElement('video');
    video.playsInline = true;
    video.preload = 'auto';
    video.src = src;
    const loaded = await new Promise<boolean>((resolve) => {
      video.onloadeddata = () => resolve(true);
      video.onerror = () => resolve(false);
    });
    if (!loaded || video.videoWidth === 0) return null;
    const audio = typeof AudioContext === 'undefined' ? null : new AudioContext();
    const destination = audio?.createMediaStreamDestination() ?? null;
    if (audio !== null && destination !== null) audio.createMediaElementSource(video).connect(destination);
    return {
      frame: video,
      aspectRatio: video.videoWidth / video.videoHeight,
      audioTracks: destination?.stream.getAudioTracks() ?? [],
      play: (onFrame) =>
        new Promise<void>((resolve) => {
          const finish = () => {
            onFrame();
            resolve();
          };
          const tick = () => {
            if (video.ended) return finish();
            onFrame();
            requestAnimationFrame(tick);
          };
          video.onended = finish;
          video.play().then(() => requestAnimationFrame(tick), finish);
        }),
      release: () => {
        video.pause();
        video.removeAttribute('src');
        video.load();
        void audio?.close();
      },
    };
  },
  record: (tracks) => {
    if (typeof MediaRecorder === 'undefined') return null;
    const mimeType = cameraVideoMime((type) => MediaRecorder.isTypeSupported(type));
    if (mimeType === undefined) return null;
    const recorder = new MediaRecorder(new MediaStream([...tracks]), { mimeType });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    recorder.start(250);
    return {
      mimeType,
      stop: () =>
        new Promise<Blob | null>((resolve) => {
          recorder.onstop = () => resolve(chunks.length > 0 ? new Blob(chunks, { type: mimeType }) : null);
          recorder.stop();
        }),
    };
  },
};
