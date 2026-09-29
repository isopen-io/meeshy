import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode, type WheelEvent } from 'react';

import { browserCanvas, captureDrawn, captureFaces, captureMontage, MONTAGE_DATE, saveCaptures, type CaptureEnv, type CaptureFile, type SaveOutcome } from '@/lib/calls/call-capture';
import type { ClipEnv } from '@/lib/calls/call-capture-live';
import { visibleTiles } from '@/lib/calls/call-capture-tiles';
import { captureSize, MONTAGE_STYLES, montageLayout, type MontageStyle, type Size } from '@/lib/calls/call-montage';
import type { MontageCall, MontageCircle } from '@/lib/calls/call-montage-circle';
import { drawMontage, type MontageText } from '@/lib/calls/call-montage-render';
import { browserFaceDetector } from '@/lib/calls/face-tracker';
import type { CaptureFrame, FrameMood } from '@/lib/calls/frames/frame-spec';
import type { FrameStudio } from '@/lib/calls/frames/frame-studio';
import { loadCallStudioCatalog, translateCallStudio as t } from '@/lib/i18n-call-studio-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

import { CaptureFlash, CaptureHint, CaptureStatus, KeyboardRecord, RecordingStop, useCaptureStudio, type StudioVideo } from './call-capture-studio';
import { CallModeBar, ModeCarousel, ModeOption, type CarouselItem } from './call-mode-carousel';
import { MoodChips } from './call-montage-moods';
import { browserCircle, paintFramed, useMontageFrames, type CircleOf, type FrameStudioLoader } from './use-montage-frames';

/**
 * **LE MODE MONTAGE** (#8552, #8578, #8580) — « Capturer » (rangée L'appel)
 * LIBÈRE l'écran : la scène montre, en plein écran et en direct, le montage
 * choisi — couverture de magazine, doré, tapis rouge, mosaïque, photomaton,
 * polaroïd, magazine, pellicule, néon, noir et blanc, BD, cœur —, composé
 * avec tous les visages affichés. En bas, seul, le carrousel des styles
 * (chaque vignette vivante, à faible fréquence). Plus de déclencheur (#8625) :
 * DEUX TAPES sur le style choisi le capturent (un éclair, une vibration, un
 * mot bref) dans la photothèque ; un APPUI LONG le FILME, rendu en direct et
 * avec le son de l'appel, jusqu'au stop posé au centre du gabarit
 * (`call-capture-studio.tsx`). À droite, « Chaque visage » (un portrait par
 * participant) ; ✕ ou Échap quittent.
 *
 * Les CADRES de capture (#8742, #8743) : en haut, les puces d'ambiance —
 * « Classiques » (les treize montages, d'abord et par défaut) puis les
 * ambiances qui ont un cadre pour les PERSONNES de l'appel, moi compris.
 * Une puce change le carrousel dans la même image ; une arrivée ou un
 * départ réconcilie le cadre choisi (la variante de son motif, sinon un
 * cadre de son ambiance, sinon les classiques). L'aperçu, la photo et la
 * vidéo d'un cadre passent par son peintre : couches en cache, visages
 * repeints à chaque image, jamais en miroir ; ses vignettes ne se rendent
 * que pour la fenêtre visible du carrousel (± 3). Pendant une vidéo, les
 * puces s'effacent : sur un petit écran, elles couvraient le stop.
 *
 * Chunk à part (`budgets.json` › `call_montage_mode`) qui n'importe rien de
 * l'écran d'appel ; son catalogue se charge avec lui (`loadMontageModeText`).
 * L'atelier des cadres vit dans le sien (`call_frame_studio`), que l'écran
 * remet par `loadFrames` et que le mode charge à son entrée.
 */

export const loadMontageModeText = (language: InterfaceLanguage): Promise<unknown> => loadCallStudioCatalog(language);

export const MONTAGE_PREVIEW_FPS = 5;

export const MONTAGE_THUMB_FPS = 1;

/** Pendant une vidéo, l'aperçu — qui EST ce qu'on filme — se repeint à la cadence d'un film. */
export const MONTAGE_RECORD_FPS = 30;

/** Les vignettes de cadre rendues de part et d'autre du cadre choisi. */
export const FRAME_THUMB_WINDOW = 3;

const CLASSICS = 'classics';

type Shelf = typeof CLASSICS | FrameMood;

type ModeProps = {
  readonly language: InterfaceLanguage;
  readonly quitGlyph: ReactNode;
  readonly onExit: () => void;
  /** La scène : l'écran d'appel dont on capture les vidéos affichées. */
  readonly stage: () => Element | null;
  readonly onWheel?: ((event: WheelEvent<HTMLElement>) => void) | undefined;
  /** Le son de l'appel : mon micro et les voix des autres. */
  readonly audio?: () => readonly MediaStream[];
  readonly env?: CaptureEnv;
  readonly save?: (files: readonly CaptureFile[]) => Promise<SaveOutcome>;
  readonly clipEnv?: () => ClipEnv;
  readonly viewport?: () => Size;
  /** L'appel : qui y est (le nombre de personnes choisit les cadres), la conversation. Sans lui, les classiques seuls. */
  readonly call?: MontageCall;
  /** L'atelier des cadres, dans son chunk — sans lui, les classiques seuls. */
  readonly loadFrames?: FrameStudioLoader;
  readonly circleOf?: CircleOf;
};

const NO_AUDIO = (): readonly MediaStream[] => [];

const browserEnv = (): CaptureEnv => ({ canvas: browserCanvas, detector: browserFaceDetector(), now: () => new Date() });

const windowViewport = (): Size => (typeof window === 'undefined' ? { width: 1080, height: 1920 } : { width: window.innerWidth, height: window.innerHeight });

const scaledSize = (full: Size, height: number): Size => ({ width: Math.round((full.width / full.height) * height), height });

const isMontageStyle = (id: string): id is MontageStyle => (MONTAGE_STYLES as readonly string[]).includes(id);

/** Le nom de fichier d'un cadre : `cadre-` puis son identifiant, sans point. */
const frameFileStyle = (frame: CaptureFrame): string => `cadre-${frame.id.replaceAll('.', '-')}`;

/** Dessine le montage `style` dans un canevas, à sa taille. Rien d'affiché : un fond sombre. */
function paint(canvas: HTMLCanvasElement | null, stage: Element | null, style: MontageStyle, text: MontageText): void {
  const context = canvas?.getContext('2d') ?? null;
  if (canvas === null || context === null) return;
  const size = { width: canvas.width, height: canvas.height };
  const tiles = stage === null ? [] : visibleTiles(stage);
  context.clearRect(0, 0, size.width, size.height);
  drawMontage(context, montageLayout({ style, count: tiles.length, size, onScreen: tiles.map((tile) => tile.onScreen) }), tiles, text);
}

const facesGlyph = (
  <svg aria-hidden viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <circle cx="8" cy="9" r="3" />
    <circle cx="16.5" cy="9" r="3" />
    <path d="M3 19c.8-3 2.8-4.5 5-4.5s4.2 1.5 5 4.5M11.5 19c.8-3 2.8-4.5 5-4.5s4.2 1.5 5 4.5" />
  </svg>
);

export function CallMontageMode({ language, quitGlyph, onExit, stage, onWheel, audio = NO_AUDIO, env, save = saveCaptures, clipEnv, viewport = windowViewport, call, loadFrames, circleOf = browserCircle }: ModeProps) {
  const [style, setStyle] = useState<MontageStyle>('grid');
  const [frameId, setFrameId] = useState<string | null>(null);
  const { studio: frames, circle } = useMontageFrames({ loadFrames, call, circleOf, language });
  const people = circle?.people.length ?? 0;
  const frame = frames === null || frameId === null ? null : frames.reconcile(frameId, people);
  const shelf: Shelf = frame?.mood ?? CLASSICS;
  const lastInMood = useRef(new Map<FrameMood, string>());
  const root = useRef<HTMLDivElement>(null);
  const preview = useRef<HTMLCanvasElement>(null);
  const thumbs = useRef(new Map<string, HTMLCanvasElement>());
  const painted = useRef(new WeakSet<HTMLCanvasElement>());
  const current = useRef<string>(style);
  current.current = frame?.id ?? style;
  const framing = useRef<{ readonly studio: FrameStudio | null; readonly circle: MontageCircle | null }>({ studio: frames, circle });
  framing.current = { studio: frames, circle };
  const scene = useRef(stage);
  scene.current = stage;
  const full = captureSize(viewport());
  const previewSize = scaledSize(full, 960);
  const thumbSize = scaledSize(full, 96);
  const frameThumbSize = scaledSize(full, 192);
  const text: MontageText = {
    bubble: t(language, 'callStudio.capture.bubble'),
    date: MONTAGE_DATE(new Date(), language),
    coverlines: [t(language, 'callStudio.cover.line1'), t(language, 'callStudio.cover.line2'), t(language, 'callStudio.cover.line3')],
  };
  const textRef = useRef(text);
  textRef.current = text;
  const captureEnv = (): CaptureEnv => env ?? browserEnv();
  /** Peint le choix `id` — un montage ou un cadre — dans `canvas`, à sa taille. */
  const paintChoice = (canvas: HTMLCanvasElement | null, id: string, tier: 'thumb' | 'preview'): void => {
    if (isMontageStyle(id)) {
      paint(canvas, scene.current(), id, textRef.current);
      return;
    }
    const { studio: atelier, circle: shown } = framing.current;
    const chosen = atelier?.find(id) ?? null;
    if (atelier !== null && shown !== null && chosen !== null) paintFramed(canvas, scene.current(), atelier, chosen, shown, tier);
  };
  const paintRef = useRef(paintChoice);
  paintRef.current = paintChoice;
  const currentFrame = (): { readonly studio: FrameStudio; readonly frame: CaptureFrame; readonly circle: MontageCircle } | null => {
    const { studio: atelier, circle: shown } = framing.current;
    const chosen = atelier?.find(current.current) ?? null;
    return atelier === null || shown === null || chosen === null ? null : { studio: atelier, frame: chosen, circle: shown };
  };
  const filmed = (): StudioVideo | null => {
    const track = preview.current?.captureStream?.(MONTAGE_RECORD_FPS).getVideoTracks()[0];
    return track === undefined ? null : { track, release: () => track.stop() };
  };
  const studio = useCaptureStudio({
    language,
    still: async () => {
      const shown = scene.current();
      const framed = currentFrame();
      if (framed !== null) {
        const faces = framed.studio.faces(framed.circle.people, shown === null ? [] : visibleTiles(shown));
        return captureDrawn({ viewport: viewport(), style: frameFileStyle(framed.frame), env: captureEnv(), draw: (context, size) => framed.studio.draw(context, framed.frame, { people: framed.circle.people, faces, texts: framed.circle.texts, size }, 'still') });
      }
      const chosen = current.current;
      return shown === null || !isMontageStyle(chosen) ? null : captureMontage({ stage: shown, style: chosen, text: textRef.current, viewport: viewport(), env: captureEnv() });
    },
    video: filmed,
    audio,
    style: () => {
      const framed = currentFrame();
      return framed === null ? current.current : frameFileStyle(framed.frame);
    },
    save,
    ...(clipEnv === undefined ? {} : { clipEnv }),
  });

  useEffect(() => {
    const big = (): void => paintRef.current(preview.current, current.current, 'preview');
    const small = (): void => thumbs.current.forEach((canvas, id) => paintRef.current(canvas, id, 'thumb'));
    big();
    small();
    const bigTimer = setInterval(big, 1000 / (studio.recording ? MONTAGE_RECORD_FPS : MONTAGE_PREVIEW_FPS));
    const smallTimer = setInterval(small, 1000 / MONTAGE_THUMB_FPS);
    return () => {
      clearInterval(bigTimer);
      clearInterval(smallTimer);
    };
  }, [studio.recording]);

  const chosenId = frame?.id ?? style;

  useEffect(() => {
    paintRef.current(preview.current, chosenId, 'preview');
  }, [chosenId]);

  /* Une vignette qui ENTRE dans la fenêtre se peint tout de suite, sans attendre l'image suivante. */
  useLayoutEffect(() => {
    thumbs.current.forEach((canvas, id) => {
      if (painted.current.has(canvas)) return;
      painted.current.add(canvas);
      paintRef.current(canvas, id, 'thumb');
    });
  });

  /* Une arrivée, un départ : le cadre retenu suit sa réconciliation — `null`, retour aux classiques. */
  useEffect(() => {
    if (frameId !== null && (frame?.id ?? null) !== frameId) setFrameId(frame?.id ?? null);
  }, [frameId, frame?.id]);

  useEffect(() => {
    root.current?.querySelector<HTMLElement>('[role="radio"][aria-checked="true"]')?.focus();
  }, []);

  const faces = async (): Promise<void> => {
    const shown = scene.current();
    if (studio.busy || studio.recording || shown === null) return;
    studio.setStatus({ text: t(language, 'callStudio.capture.busy'), tone: 'busy' });
    const files = await captureFaces({ stage: shown, env: captureEnv() });
    if (files.length === 0) {
      studio.setStatus({ text: t(language, 'callStudio.capture.empty'), tone: 'error' });
      return;
    }
    const outcome = await save(files);
    if (outcome.saved > 0) studio.setStatus({ text: outcome.saved === 1 ? t(language, 'callStudio.capture.faceSaved') : t(language, 'callStudio.capture.facesSaved', { count: String(outcome.saved) }), tone: 'ok' });
    else if (outcome.cancelled > 0 && outcome.failed === 0) studio.setStatus({ text: t(language, 'callStudio.capture.cancelled'), tone: 'ok' });
    else studio.setStatus({ text: t(language, 'callStudio.capture.failed'), tone: 'error' });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    onExit();
  };

  const thumbRef = (id: string) => (canvas: HTMLCanvasElement | null) => void (canvas === null ? thumbs.current.delete(id) : thumbs.current.set(id, canvas));
  const classicItems = (): readonly CarouselItem[] =>
    MONTAGE_STYLES.map((option) => ({
      id: option,
      label: t(language, `callStudio.montage.${option}`),
      visual: <canvas ref={thumbRef(option)} aria-hidden width={thumbSize.width} height={thumbSize.height} className="size-full object-cover" data-call-capture-thumb={option} />,
    }));
  const frameItems = (offered: readonly CaptureFrame[]): readonly CarouselItem[] => {
    const at = Math.max(0, offered.findIndex((option) => option.id === chosenId));
    return offered.map((option, index) => ({
      id: option.id,
      label: option.name,
      visual:
        Math.abs(index - at) <= FRAME_THUMB_WINDOW ? (
          <canvas ref={thumbRef(option.id)} aria-hidden width={frameThumbSize.width} height={frameThumbSize.height} className="size-full object-cover" data-call-frame-thumb={option.id} />
        ) : (
          <span aria-hidden className="size-full" data-call-frame-thumb-idle="" />
        ),
    }));
  };
  const items = frames === null || shelf === CLASSICS ? classicItems() : frameItems(frames.framesOf(people, shelf));
  const moods = frames === null ? [] : frames.moods(people);
  const chips = [{ id: CLASSICS, label: t(language, 'callStudio.frames.mood.classics') }, ...moods.map((mood) => ({ id: mood, label: t(language, `callStudio.frames.mood.${mood}`) }))];

  const choose = (id: string): void => {
    const picked = frames?.find(id) ?? null;
    if (picked === null) {
      setStyle(MONTAGE_STYLES.find((option) => option === id) ?? style);
      return;
    }
    lastInMood.current.set(picked.mood, picked.id);
    setFrameId(picked.id);
  };

  const pickShelf = (id: string): void => {
    const mood = moods.find((option) => option === id);
    if (frames === null || mood === undefined) {
      setFrameId(null);
      return;
    }
    const remembered = lastInMood.current.get(mood);
    const again = remembered === undefined ? null : frames.reconcile(remembered, people);
    const next = again?.mood === mood ? again : frames.framesOf(people, mood)[0];
    setFrameId(next?.id ?? null);
  };

  const previewLabel = frame === null ? t(language, 'callStudio.capture.preview', { style: t(language, `callStudio.montage.${style}`) }) : t(language, 'callStudio.capture.framePreview', { name: frame.name });

  return (
    <div ref={root} role="region" aria-label={t(language, 'callStudio.mode.montage')} onKeyDown={onKeyDown} className="flex w-full flex-col items-center gap-3" data-call-mode="montage">
      <div className="pointer-events-none fixed inset-0 z-0 grid place-items-center bg-black" data-call-mode-preview="montage">
        <canvas
          ref={preview}
          width={previewSize.width}
          height={previewSize.height}
          role="img"
          aria-label={previewLabel}
          className="size-full object-contain"
          data-call-capture-preview={chosenId}
        />
      </div>
      {studio.recording ? <RecordingStop language={language} elapsedMs={studio.elapsedMs} onStop={() => void studio.stop()} /> : null}
      <div className="relative z-10 flex w-full flex-col items-center gap-3">
        <CaptureStatus status={studio.status} />
        <CaptureHint language={language} />
        {studio.recording ? null : <MoodChips label={t(language, 'callStudio.frames.moods')} chips={chips} selected={shelf} onPick={pickShelf} onWheel={onWheel} />}
        <ModeCarousel
          key={shelf}
          label={t(language, shelf === CLASSICS ? 'callStudio.mode.pickMontage' : 'callStudio.mode.pickFrame')}
          items={items}
          selected={chosenId}
          onSelect={choose}
          onWheel={onWheel}
          capture={{ recording: studio.recording, onCapture: studio.capture, hint: t(language, 'callStudio.capture.gestures') }}
        />
        <CallModeBar
          quit={{ label: t(language, 'callStudio.mode.quit'), glyph: quitGlyph, onPress: onExit, data: { 'data-call-mode-quit': '' } }}
          center={<KeyboardRecord language={language} recording={studio.recording} onPress={() => void (studio.recording ? studio.stop() : studio.record())} />}
          options={<ModeOption label={t(language, 'callStudio.capture.facesLabel')} glyph={facesGlyph} onPress={() => void faces()} data={{ 'data-call-capture-faces': '' }} />}
        />
      </div>
      {studio.flashing ? <CaptureFlash onDone={studio.endFlash} /> : null}
    </div>
  );
}
