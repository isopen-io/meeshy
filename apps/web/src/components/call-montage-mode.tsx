import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode, type WheelEvent } from 'react';
import { createPortal } from 'react-dom';

import { browserCanvas, captureFaces, captureMontage, MONTAGE_DATE, saveCaptures, type CaptureEnv, type CaptureFile, type SaveOutcome } from '@/lib/calls/call-capture';
import { visibleTiles } from '@/lib/calls/call-capture-tiles';
import { captureSize, MONTAGE_STYLES, montageLayout, type MontageStyle, type Size } from '@/lib/calls/call-montage';
import { drawMontage, type MontageText } from '@/lib/calls/call-montage-render';
import { browserFaceDetector } from '@/lib/calls/face-tracker';
import { loadCallStudioCatalog, translateCallStudio as t } from '@/lib/i18n-call-studio-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

import { CallModeBar, ModeCarousel, ModeOption, type CarouselItem } from './call-mode-carousel';

/**
 * **LE MODE MONTAGE** (#8552, #8578, #8580) — « Capturer » (rangée L'appel)
 * LIBÈRE l'écran : la scène montre, en plein écran et en direct, le montage
 * choisi — couverture de magazine, doré, tapis rouge, mosaïque, photomaton,
 * polaroïd, magazine, pellicule, néon, noir et blanc, BD, cœur —, composé
 * avec tous les visages affichés. En bas, seul, le carrousel des styles
 * (chaque vignette vivante, à faible fréquence) ; le déclencheur capture (un
 * éclair, une vibration, un mot bref) et enregistre dans la photothèque ; à
 * droite, « Chaque visage » (un portrait par participant) ; ✕ ou Échap
 * quittent.
 *
 * Chunk à part (`budgets.json` › `call_montage_mode`) qui n'importe rien de
 * l'écran d'appel ; son catalogue se charge avec lui (`loadMontageModeText`).
 */

export const loadMontageModeText = (language: InterfaceLanguage): Promise<unknown> => loadCallStudioCatalog(language);

export const MONTAGE_PREVIEW_FPS = 5;

export const MONTAGE_THUMB_FPS = 1;

const TOAST_MS = 2600;

type Status = { readonly text: string; readonly tone: 'ok' | 'error' | 'busy' };

type ModeProps = {
  readonly language: InterfaceLanguage;
  readonly quitGlyph: ReactNode;
  readonly onExit: () => void;
  /** La scène : l'écran d'appel dont on capture les vidéos affichées. */
  readonly stage: () => Element | null;
  readonly onWheel?: ((event: WheelEvent<HTMLElement>) => void) | undefined;
  readonly env?: CaptureEnv;
  readonly save?: (files: readonly CaptureFile[]) => Promise<SaveOutcome>;
  readonly viewport?: () => Size;
};

const browserEnv = (): CaptureEnv => ({ canvas: browserCanvas, detector: browserFaceDetector(), now: () => new Date() });

const windowViewport = (): Size => (typeof window === 'undefined' ? { width: 1080, height: 1920 } : { width: window.innerWidth, height: window.innerHeight });

const reducedMotion = (): boolean => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

const scaledSize = (full: Size, height: number): Size => ({ width: Math.round((full.width / full.height) * height), height });

/** Dessine le montage `style` dans un canevas, à sa taille. Rien d'affiché : un fond sombre. */
function paint(canvas: HTMLCanvasElement | null, stage: Element | null, style: MontageStyle, text: MontageText): void {
  const context = canvas?.getContext('2d') ?? null;
  if (canvas === null || context === null) return;
  const size = { width: canvas.width, height: canvas.height };
  const tiles = stage === null ? [] : visibleTiles(stage);
  context.clearRect(0, 0, size.width, size.height);
  drawMontage(context, montageLayout({ style, count: tiles.length, size, onScreen: tiles.map((tile) => tile.onScreen) }), tiles, text);
}

function statusOf(language: InterfaceLanguage, outcome: SaveOutcome, faces: boolean): Status {
  if (outcome.saved > 0) {
    if (!faces) return { text: t(language, 'callStudio.capture.saved'), tone: 'ok' };
    return { text: outcome.saved === 1 ? t(language, 'callStudio.capture.faceSaved') : t(language, 'callStudio.capture.facesSaved', { count: String(outcome.saved) }), tone: 'ok' };
  }
  if (outcome.cancelled > 0 && outcome.failed === 0) return { text: t(language, 'callStudio.capture.cancelled'), tone: 'ok' };
  return { text: t(language, 'callStudio.capture.failed'), tone: 'error' };
}

function Flash({ host, onDone }: { readonly host: Element; readonly onDone: () => void }) {
  const flash = useRef<HTMLDivElement>(null);
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    const animation = flash.current?.animate?.([{ opacity: 0.9 }, { opacity: 0 }], { duration: 380, easing: 'ease-out' });
    animation?.finished?.catch(() => undefined);
    const timer = setTimeout(() => done.current(), 400);
    return () => {
      animation?.cancel();
      clearTimeout(timer);
    };
  }, []);
  return createPortal(<div ref={flash} aria-hidden className="pointer-events-none fixed inset-0 z-[260] bg-white opacity-0" data-call-capture-flash="" />, host);
}

const shutterGlyph = <span aria-hidden className="size-[46px] rounded-full bg-current opacity-90" />;

const facesGlyph = (
  <svg aria-hidden viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <circle cx="8" cy="9" r="3" />
    <circle cx="16.5" cy="9" r="3" />
    <path d="M3 19c.8-3 2.8-4.5 5-4.5s4.2 1.5 5 4.5M11.5 19c.8-3 2.8-4.5 5-4.5s4.2 1.5 5 4.5" />
  </svg>
);

export function CallMontageMode({ language, quitGlyph, onExit, stage, onWheel, env, save = saveCaptures, viewport = windowViewport }: ModeProps) {
  const [style, setStyle] = useState<MontageStyle>('grid');
  const [status, setStatus] = useState<Status | null>(null);
  const [flashing, setFlashing] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const preview = useRef<HTMLCanvasElement>(null);
  const thumbs = useRef(new Map<MontageStyle, HTMLCanvasElement>());
  const current = useRef(style);
  current.current = style;
  const scene = useRef(stage);
  scene.current = stage;
  const full = captureSize(viewport());
  const previewSize = scaledSize(full, 960);
  const thumbSize = scaledSize(full, 96);
  const text: MontageText = {
    bubble: t(language, 'callStudio.capture.bubble'),
    date: MONTAGE_DATE(new Date(), language),
    coverlines: [t(language, 'callStudio.cover.line1'), t(language, 'callStudio.cover.line2'), t(language, 'callStudio.cover.line3')],
  };
  const textRef = useRef(text);
  textRef.current = text;

  useEffect(() => {
    const big = (): void => paint(preview.current, scene.current(), current.current, textRef.current);
    const small = (): void => thumbs.current.forEach((canvas, thumbStyle) => paint(canvas, scene.current(), thumbStyle, textRef.current));
    big();
    small();
    const bigTimer = setInterval(big, 1000 / MONTAGE_PREVIEW_FPS);
    const smallTimer = setInterval(small, 1000 / MONTAGE_THUMB_FPS);
    return () => {
      clearInterval(bigTimer);
      clearInterval(smallTimer);
    };
  }, []);

  useEffect(() => {
    paint(preview.current, scene.current(), style, textRef.current);
  }, [style]);

  useEffect(() => {
    root.current?.querySelector<HTMLElement>('[role="radio"][aria-checked="true"]')?.focus();
  }, []);

  useEffect(() => {
    if (status === null || status.tone === 'busy') return undefined;
    const timer = setTimeout(() => setStatus(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [status]);

  const busy = status?.tone === 'busy';
  const run = async (faces: boolean): Promise<void> => {
    const shown = scene.current();
    if (busy || shown === null) return;
    setStatus({ text: t(language, 'callStudio.capture.busy'), tone: 'busy' });
    const captureEnv = env ?? browserEnv();
    const files = faces ? await captureFaces({ stage: shown, env: captureEnv }) : [await captureMontage({ stage: shown, style: current.current, text: textRef.current, viewport: viewport(), env: captureEnv })].filter((file): file is CaptureFile => file !== null);
    if (files.length === 0) {
      setStatus({ text: t(language, 'callStudio.capture.empty'), tone: 'error' });
      return;
    }
    if (!reducedMotion()) setFlashing(true);
    if (typeof navigator !== 'undefined') navigator.vibrate?.(30);
    setStatus(statusOf(language, await save(files), faces));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    onExit();
  };

  const styleName = t(language, `callStudio.montage.${style}`);
  const host = typeof document === 'undefined' ? null : (document.querySelector('[data-call-screen]') ?? document.body);
  const items: readonly CarouselItem[] = MONTAGE_STYLES.map((option) => ({
    id: option,
    label: t(language, `callStudio.montage.${option}`),
    visual: (
      <canvas
        ref={(canvas) => void (canvas === null ? thumbs.current.delete(option) : thumbs.current.set(option, canvas))}
        aria-hidden
        width={thumbSize.width}
        height={thumbSize.height}
        className="size-full object-cover"
        data-call-capture-thumb={option}
      />
    ),
  }));

  return (
    <div ref={root} role="region" aria-label={t(language, 'callStudio.mode.montage')} onKeyDown={onKeyDown} className="flex w-full flex-col items-center gap-3" data-call-mode="montage">
      <div className="pointer-events-none fixed inset-0 z-0 grid place-items-center bg-black" data-call-mode-preview="montage">
        <canvas
          ref={preview}
          width={previewSize.width}
          height={previewSize.height}
          role="img"
          aria-label={t(language, 'callStudio.capture.preview', { style: styleName })}
          className="size-full object-contain"
          data-call-capture-preview={style}
        />
      </div>
      <div className="relative z-10 flex w-full flex-col items-center gap-3">
        <p
          role="status"
          aria-live="polite"
          className={`glass-call min-h-8 rounded-full px-4 py-1.5 text-mini font-semibold transition-opacity motion-reduce:transition-none ${status === null ? 'opacity-0' : 'opacity-100'} ${status?.tone === 'error' ? 'text-[var(--ios-error,#ff6b6b)]' : 'text-white'}`}
          data-call-capture-status={status?.tone ?? ''}
        >
          {status?.text ?? ''}
        </p>
        <ModeCarousel label={t(language, 'callStudio.mode.pickMontage')} items={items} selected={style} onSelect={(id) => setStyle(MONTAGE_STYLES.find((option) => option === id) ?? style)} onWheel={onWheel} />
        <CallModeBar
          quit={{ label: t(language, 'callStudio.mode.quit'), glyph: quitGlyph, onPress: onExit, data: { 'data-call-mode-quit': '' } }}
          shutter={{ label: t(language, 'callStudio.capture.shootLabel', { style: styleName }), glyph: shutterGlyph, onPress: () => void run(false), busy, data: { 'data-call-capture-shoot': '' } }}
          options={<ModeOption label={t(language, 'callStudio.capture.facesLabel')} glyph={facesGlyph} onPress={() => void run(true)} data={{ 'data-call-capture-faces': '' }} />}
        />
      </div>
      {flashing && host !== null ? <Flash host={host} onDone={() => setFlashing(false)} /> : null}
    </div>
  );
}
