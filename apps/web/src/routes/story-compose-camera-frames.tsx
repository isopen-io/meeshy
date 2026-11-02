import { useEffect, useLayoutEffect, useRef, useState, type MutableRefObject } from 'react';
import { createPortal } from 'react-dom';

import { ModeCarousel, type CarouselItem } from '@/components/call-mode-carousel';
import type { FrameStudioLoader } from '@/components/use-montage-frames';
import { apiDeps } from '@/lib/api/deps';
import { sessionStore } from '@/lib/api/session';
import { resolveViewer } from '@/lib/api/viewer';
import { startFrameClock } from '@/lib/calls/frame-clock';
import { frameDate } from '@/lib/calls/call-montage-circle';
import { captureSize, type Size } from '@/lib/calls/call-montage';
import type { FrameFace } from '@/lib/calls/frames/frame-paint';
import type { Surface2D } from '@/lib/calls/frames/frame-paint-kit';
import type { CaptureFrame } from '@/lib/calls/frames/frame-spec';
import type { FrameShot, FrameStudio, FrameTier } from '@/lib/calls/frames/frame-studio';
import { translate } from '@/lib/i18n-catalog';
import { frameUsageText, loadFrameUsageCatalog } from '@/lib/i18n-frame-usage-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { browserPhotoEnv, developPhoto, PHOTO_MIME, type PhotoEnv } from '@/lib/media/photo-develop';
import { digitalZoomCrop } from '@/lib/stories/studio-capture-gestures';
import { studioCameraAuthor, studioCameraFramedName, studioCameraFrames, studioCameraTexts, type StudioCameraViewer } from '@/lib/stories/studio-camera-frames';

/**
 * **LES CADRES DANS LA CAMÉRA DU COMPOSER** (#10190, jumelle de
 * `ComposerLookStripRule` / `ComposerLiveLookRule` iOS, #9329, #9351) — chargés
 * avec la famille « Cadres », jamais avec la caméra : l'atelier des cadres
 * (`call_frame_studio`) et ses libellés d'usage arrivent au premier toucher.
 *
 * La bande est le carrousel des modes de l'appel (`ModeCarousel`) : « Aucun
 * cadre » en tête, puis chaque cadre de capture, sa vignette vivante (la
 * fenêtre ± 3 autour du choix) et son libellé d'usage (#10146). La case qui
 * s'arrête au centre est choisie, comme sur iOS (#9566).
 *
 * **Ce que l'aperçu montre est ce qui part.** L'aperçu, la photo et la vidéo
 * passent par le MÊME peintre (`FrameStudio.draw`) avec le MÊME visage — la
 * trame de l'objectif, recadrée au zoom numérique : la photo se peint à la
 * toile du Montage (`captureSize`, 9:16) puis passe par le développement
 * unique des photos (`developPhoto`, #8695) ; la vidéo filme la toile de
 * l'aperçu, repeinte à la cadence d'un film, avec le son de la caméra. Une
 * capture n'est jamais en miroir (#8696) : l'aperçu encadré non plus.
 */

export type StudioCameraFramesDeps = {
  readonly load?: FrameStudioLoader;
  readonly photo?: PhotoEnv;
  readonly canvas?: (size: Size) => { readonly context: Surface2D; readonly image: CanvasImageSource } | null;
  readonly face?: (video: HTMLVideoElement, zoom: number) => FrameFace | null;
  readonly film?: (canvas: HTMLCanvasElement) => MediaStream | null;
  readonly viewer?: () => StudioCameraViewer;
  readonly now?: () => Date;
  readonly viewport?: () => Size;
};

export type StudioCameraFramesHandle = {
  /** La photo encadrée de l'instant ; `null` : rien n'a pu se peindre. */
  readonly still: (video: HTMLVideoElement, zoom: number) => Promise<File | null>;
  /** Le flux que la vidéo enregistre : la toile de l'aperçu et le son de la caméra ; `null` sans toile filmable. */
  readonly film: (camera: MediaStream) => { readonly stream: MediaStream; readonly release: () => void } | null;
};

const PREVIEW_FPS = 15;
const RECORD_FPS = 30;
const THUMB_FPS = 1;
const THUMB_WINDOW = 3;
const NONE = 'none';

const loadStudio: FrameStudioLoader = () => import('@/lib/calls/frames/frame-studio');

function browserCanvas(size: Size): { readonly context: Surface2D; readonly image: CanvasImageSource } | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext('2d');
  return context === null ? null : { context, image: canvas };
}

/** La trame de l'objectif, recadrée au zoom NUMÉRIQUE comme la photo de la caméra (`digitalZoomCrop`). */
function browserFace(): (video: HTMLVideoElement, zoom: number) => FrameFace | null {
  const scratch: { canvas: HTMLCanvasElement | null } = { canvas: null };
  return (video, zoom) => {
    const width = video.videoWidth;
    const height = video.videoHeight;
    if (width === 0 || height === 0) return null;
    if (zoom <= 1) return { source: video, size: { width, height } };
    const crop = digitalZoomCrop({ width, height, zoom });
    const canvas = scratch.canvas ?? document.createElement('canvas');
    scratch.canvas = canvas;
    canvas.width = crop.sw;
    canvas.height = crop.sh;
    canvas.getContext('2d')?.drawImage(video, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, crop.sw, crop.sh);
    return { source: canvas, size: { width: crop.sw, height: crop.sh } };
  };
}

const browserFilm = (canvas: HTMLCanvasElement): MediaStream | null => (typeof canvas.captureStream === 'function' ? canvas.captureStream(RECORD_FPS) : null);

const browserViewer = (): StudioCameraViewer => resolveViewer({ source: apiDeps.source, session: sessionStore.getState().session });

const windowViewport = (): Size => (typeof window === 'undefined' ? { width: 1080, height: 1920 } : { width: window.innerWidth, height: window.innerHeight });

const scaled = (full: Size, height: number): Size => ({ width: Math.round((full.width / full.height) * height), height });

type Props = {
  readonly lang: InterfaceLanguage;
  readonly open: boolean;
  readonly frameId: string | null;
  readonly onChoose: (id: string | null) => void;
  readonly recording: boolean;
  readonly video: () => HTMLVideoElement | null;
  readonly zoom: () => number;
  readonly previewHost: HTMLElement | null;
  readonly handle: MutableRefObject<StudioCameraFramesHandle | null>;
  readonly deps?: StudioCameraFramesDeps | undefined;
};

export default function StudioCameraFrames({ lang, open, frameId, onChoose, recording, video, zoom, previewHost, handle, deps = {} }: Props) {
  const [studio, setStudio] = useState<FrameStudio | null>(null);
  const [face] = useState(() => deps.face ?? browserFace());
  const preview = useRef<HTMLCanvasElement | null>(null);
  const thumbs = useRef(new Map<string, HTMLCanvasElement>());
  const viewport = (deps.viewport ?? windowViewport)();
  const full = captureSize(viewport);
  const previewSize = scaled(full, 960);
  const thumbSize = scaled(full, 192);
  const now = deps.now ?? (() => new Date());
  const offered = studio === null ? [] : studioCameraFrames(studio);
  const frame = studio === null || frameId === null ? null : studio.find(frameId);

  useEffect(() => {
    const alive = { current: true };
    void Promise.all([(deps.load ?? loadStudio)(), loadFrameUsageCatalog(lang)]).then(
      ([module]) => {
        if (alive.current) setStudio(module.createFrameStudio());
      },
      () => undefined,
    );
    return () => {
      alive.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const shotOf = (size: Size): FrameShot => {
    const shown = video();
    const author = studioCameraAuthor((deps.viewer ?? browserViewer)());
    return { people: [author], faces: [shown === null ? null : face(shown, zoom())], texts: studioCameraTexts(frameDate(now(), lang)), size };
  };

  const paint = (canvas: HTMLCanvasElement | null, chosen: CaptureFrame, tier: FrameTier): void => {
    const context = canvas?.getContext('2d') ?? null;
    if (canvas === null || context === null || studio === null) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    studio.draw(context, chosen, shotOf({ width: canvas.width, height: canvas.height }), tier);
  };
  const paintRef = useRef(paint);
  paintRef.current = paint;

  useEffect(() => {
    if (frame === null) return undefined;
    const clock = startFrameClock({ fps: recording ? RECORD_FPS : PREVIEW_FPS, tick: () => paintRef.current(preview.current, frame, 'preview'), driver: video });
    return () => clock.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frame?.id, recording, studio]);

  useEffect(() => {
    if (!open || recording || studio === null) return undefined;
    const small = (): void => thumbs.current.forEach((canvas, id) => {
      const chosen = studio.find(id);
      if (chosen !== null) paintRef.current(canvas, chosen, 'thumb');
    });
    small();
    const timer = setInterval(small, 1000 / THUMB_FPS);
    return () => clearInterval(timer);
  }, [open, recording, studio]);

  useLayoutEffect(() => {
    handle.current =
      studio === null || frame === null
        ? null
        : {
            still: async (shown, digital) => {
              const size = full;
              const surface = (deps.canvas ?? browserCanvas)(size);
              const taken = face(shown, digital);
              if (surface === null || taken === null) return null;
              const shot = shotOf(size);
              studio.draw(surface.context, frame, { ...shot, faces: [taken] }, 'still');
              const blob = await developPhoto({ image: surface.image, size }, deps.photo ?? browserPhotoEnv);
              return blob === null ? null : new File([blob], studioCameraFramedName(frame.id, now()), { type: blob.type || PHOTO_MIME });
            },
            film: (camera) => {
              const canvas = preview.current;
              const filmed = canvas === null ? null : (deps.film ?? browserFilm)(canvas);
              if (filmed === null) return null;
              const tracks = filmed.getVideoTracks();
              camera.getAudioTracks().forEach((track) => filmed.addTrack(track));
              return { stream: filmed, release: () => tracks.forEach((track) => track.stop()) };
            },
          };
    return () => {
      handle.current = null;
    };
  });

  const thumbRef = (id: string) => (canvas: HTMLCanvasElement | null) => void (canvas === null ? thumbs.current.delete(id) : thumbs.current.set(id, canvas));
  const at = Math.max(0, offered.findIndex((option) => option.id === frameId));
  const frameItem = (atelier: FrameStudio) => (option: CaptureFrame, index: number): CarouselItem => ({
    id: option.id,
    label: option.name,
    detail: frameUsageText(lang, atelier.usageLabel(option)),
    visual:
      Math.abs(index - at) <= THUMB_WINDOW ? (
        <canvas ref={thumbRef(option.id)} aria-hidden width={thumbSize.width} height={thumbSize.height} className="size-full object-cover" data-story-camera-frame-thumb={option.id} />
      ) : (
        <span aria-hidden className="size-full" />
      ),
  });
  const items: readonly CarouselItem[] = [
    { id: NONE, label: translate(lang, 'story.studio.camera.frames.none'), visual: <span aria-hidden className="size-full" data-story-camera-frame-none="" /> },
    ...(studio === null ? [] : offered.map(frameItem(studio))),
  ];

  const canvas =
    frame === null || previewHost === null
      ? null
      : createPortal(
          <canvas
            ref={preview}
            aria-hidden
            width={previewSize.width}
            height={previewSize.height}
            className="absolute inset-0 size-full bg-black object-contain"
            data-story-camera-frame-preview={frame.id}
          />,
          previewHost,
        );

  return (
    <>
      {canvas}
      {open && !recording ? (
        <div
          className="w-full"
          data-story-camera-frames=""
          aria-busy={studio === null}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          <ModeCarousel label={translate(lang, 'story.studio.camera.frames')} items={items} selected={frame?.id ?? NONE} onSelect={(id) => onChoose(id === NONE ? null : id)} />
        </div>
      ) : null}
    </>
  );
}
