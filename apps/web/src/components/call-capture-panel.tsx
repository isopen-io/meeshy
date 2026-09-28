import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { browserCanvas, captureFaces, captureMontage, MONTAGE_DATE, saveCaptures, type CaptureEnv, type CaptureFile, type SaveOutcome } from '@/lib/calls/call-capture';
import { visibleTiles } from '@/lib/calls/call-capture-tiles';
import { captureSize, MONTAGE_STYLES, montageLayout, type MontageStyle, type Size } from '@/lib/calls/call-montage';
import { drawMontage, type MontageText } from '@/lib/calls/call-montage-render';
import { browserFaceDetector } from '@/lib/calls/face-tracker';
import { loadCallStudioCatalog, translateCallStudio as t } from '@/lib/i18n-call-studio-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

import { CallPanelFrame, CHIP, chipStyle, PanelRow, type RowKeyDown } from './call-panel-frame';

/**
 * **CAPTURER L'APPEL, EN MONTAGE** (#8552) — ouvert par « Capturer » de la
 * rangée « L'appel » (appel vidéo connecté), DANS le cadre de la pilule :
 *
 * - le grand APERÇU du montage choisi, rendu EN DIRECT (cinq images par
 *   seconde) depuis ce que l'écran montre ;
 * - **Montage** : sept styles — plein écran, mosaïque, photomaton, polaroïd,
 *   magazine, BD, cœur —, chaque pastille portant sa vignette vivante ;
 * - **Actions** : « Capturer » (le montage à pleine résolution) et « Chaque
 *   visage » (un portrait par tuile affichée).
 *
 * Un éclair blanc sur tout l'écran dit « c'est pris » (pas sous
 * `prefers-reduced-motion`) ; le statut dit ce qui est enregistré. Chunk à
 * part (`budgets.json` › `call_capture_panel`) qui n'importe rien de l'écran
 * d'appel ; son catalogue se charge avec lui (`loadCapturePanelText`).
 */

export const loadCapturePanelText = (language: InterfaceLanguage): Promise<unknown> => loadCallStudioCatalog(language);

export const CAPTURE_PREVIEW_FPS = 5;

type Status = { readonly text: string; readonly tone: 'ok' | 'error' | 'busy' };

type PanelProps = {
  readonly id: string;
  readonly closeGlyph: ReactNode;
  readonly language: InterfaceLanguage;
  readonly onClose: () => void;
  readonly onRowKeyDown: RowKeyDown;
  /** La scène : l'écran d'appel dont on capture les vidéos affichées. */
  readonly stage: () => Element | null;
  readonly env?: CaptureEnv;
  readonly save?: (files: readonly CaptureFile[]) => Promise<SaveOutcome>;
  readonly viewport?: () => Size;
};

const browserEnv = (): CaptureEnv => ({ canvas: browserCanvas, detector: browserFaceDetector(), now: () => new Date() });

const windowViewport = (): Size => (typeof window === 'undefined' ? { width: 1080, height: 1920 } : { width: window.innerWidth, height: window.innerHeight });

const reducedMotion = (): boolean => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

function scaledSize(full: Size, height: number): Size {
  return { width: Math.round((full.width / full.height) * height), height };
}

/** Dessine le montage `style` dans un canevas d'aperçu, à sa taille. Rien d'affiché : un fond sombre. */
function paintPreview(canvas: HTMLCanvasElement | null, stage: Element | null, style: MontageStyle, text: MontageText): void {
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
    const element = flash.current;
    const animation = element?.animate?.([{ opacity: 0.9 }, { opacity: 0 }], { duration: 380, easing: 'ease-out' });
    animation?.finished?.catch(() => undefined);
    const timer = setTimeout(() => done.current(), 400);
    return () => {
      animation?.cancel();
      clearTimeout(timer);
    };
  }, []);
  return createPortal(<div ref={flash} aria-hidden className="pointer-events-none fixed inset-0 z-[260] bg-white opacity-0" data-call-capture-flash="" />, host);
}

export function CallCapturePanel({ id, closeGlyph, language, onClose, onRowKeyDown, stage, env, save = saveCaptures, viewport = windowViewport }: PanelProps) {
  const [style, setStyle] = useState<MontageStyle>('grid');
  const [status, setStatus] = useState<Status | null>(null);
  const [flashing, setFlashing] = useState(false);
  const preview = useRef<HTMLCanvasElement>(null);
  const thumbs = useRef(new Map<MontageStyle, HTMLCanvasElement>());
  const current = useRef(style);
  current.current = style;
  const scene = useRef(stage);
  scene.current = stage;
  const full = captureSize(viewport());
  const previewSize = scaledSize(full, full.height > full.width ? 320 : 216);
  const thumbSize = scaledSize(full, 80);
  const text: MontageText = { bubble: t(language, 'callStudio.capture.bubble'), date: MONTAGE_DATE(new Date(), language), coverlines: [t(language, 'callStudio.cover.line1'), t(language, 'callStudio.cover.line2'), t(language, 'callStudio.cover.line3')] };
  const textRef = useRef(text);
  textRef.current = text;

  useEffect(() => {
    const paint = (): void => {
      const shown = scene.current();
      paintPreview(preview.current, shown, current.current, textRef.current);
      thumbs.current.forEach((canvas, thumbStyle) => paintPreview(canvas, shown, thumbStyle, textRef.current));
    };
    paint();
    const timer = setInterval(paint, 1000 / CAPTURE_PREVIEW_FPS);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    paintPreview(preview.current, scene.current(), style, textRef.current);
  }, [style]);

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
    setStatus(statusOf(language, await save(files), faces));
  };

  const styleName = t(language, `callStudio.montage.${style}`);
  const host = typeof document === 'undefined' ? null : (document.querySelector('[data-call-screen]') ?? document.body);

  return (
    <CallPanelFrame id={id} title={t(language, 'callStudio.capture.title')} closeLabel={t(language, 'callStudio.close')} closeGlyph={closeGlyph} onClose={onClose} data={{ 'data-call-capture-panel': '' }}>
      <div className="flex justify-center px-2">
        <canvas
          ref={preview}
          width={previewSize.width}
          height={previewSize.height}
          role="img"
          aria-label={t(language, 'callStudio.capture.preview', { style: styleName })}
          className="max-h-[min(34vh,20rem)] max-w-full rounded-2xl bg-black/40 object-contain shadow-lg"
          style={{ aspectRatio: `${previewSize.width} / ${previewSize.height}` }}
          data-call-capture-preview={style}
        />
      </div>
      <PanelRow title={t(language, 'callStudio.capture.montage')} role="radiogroup" onRowKeyDown={onRowKeyDown} data={{ 'data-call-capture-row': 'montage' }}>
        {MONTAGE_STYLES.map((option) => {
          const checked = style === option;
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={checked}
              tabIndex={checked ? 0 : -1}
              onClick={() => setStyle(option)}
              className="flex shrink-0 flex-col items-center gap-1 rounded-2xl p-1.5 text-mini font-semibold transition-colors motion-reduce:transition-none"
              style={chipStyle(checked)}
              data-row-item=""
              data-call-capture-style={option}
            >
              <canvas
                ref={(canvas) => void (canvas === null ? thumbs.current.delete(option) : thumbs.current.set(option, canvas))}
                aria-hidden
                width={thumbSize.width}
                height={thumbSize.height}
                className="h-14 rounded-lg bg-black/40"
                style={{ aspectRatio: `${thumbSize.width} / ${thumbSize.height}` }}
                data-call-capture-thumb={option}
              />
              <span className="whitespace-nowrap px-1">{t(language, `callStudio.montage.${option}`)}</span>
            </button>
          );
        })}
      </PanelRow>
      <PanelRow title={t(language, 'callStudio.capture.actions')} role="toolbar" onRowKeyDown={onRowKeyDown} data={{ 'data-call-capture-row': 'actions' }}>
        <button
          type="button"
          aria-label={t(language, 'callStudio.capture.shootLabel', { style: styleName })}
          aria-disabled={busy}
          onClick={() => void run(false)}
          className={CHIP}
          style={{ background: 'white', color: 'var(--ios-indigo-950)' }}
          data-row-item=""
          data-call-capture-shoot=""
        >
          <span aria-hidden className="grid size-6 place-items-center rounded-full border-2 border-current">
            <span className="size-3 rounded-full bg-current" />
          </span>
          {t(language, 'callStudio.capture.shoot')}
        </button>
        <button
          type="button"
          aria-label={t(language, 'callStudio.capture.facesLabel')}
          aria-disabled={busy}
          onClick={() => void run(true)}
          className={CHIP}
          style={chipStyle(false)}
          data-row-item=""
          data-call-capture-faces=""
        >
          <span aria-hidden className="text-base leading-none">
            🙂
          </span>
          {t(language, 'callStudio.capture.faces')}
        </button>
      </PanelRow>
      <p role="status" aria-live="polite" className={`min-h-5 px-3 text-mini font-semibold ${status?.tone === 'error' ? 'text-[var(--ios-error,#ff6b6b)]' : 'text-white/85'}`} data-call-capture-status={status?.tone ?? ''}>
        {status?.text ?? ''}
      </p>
      {flashing && host !== null ? <Flash host={host} onDone={() => setFlashing(false)} /> : null}
    </CallPanelFrame>
  );
}
