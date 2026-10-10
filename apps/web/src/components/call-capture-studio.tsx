import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { browserClipEnv, startClip, type Clip, type ClipEnv } from '@/lib/calls/call-capture-live';
import { clipClock, MAX_CLIP_MS } from '@/lib/calls/call-capture-gesture';
import { saveCaptures, type CaptureFile, type SaveOutcome } from '@/lib/calls/call-capture-save';
import { translateCallStudio as t } from '@/lib/i18n-call-studio-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

/**
 * **CAPTURER SANS DÉCLENCHEUR** (#8625) — ce que partagent les modes Montage
 * et Effets une fois le geste reconnu par le carrousel :
 *
 * - la PHOTO (deux tapes) : un éclair, une vibration, un mot bref ;
 * - la VIDÉO (appui long) : la piste rendue en direct et le son de l'appel
 *   filmés (`call-capture-live.ts`) ; au centre du gabarit, un bouton stop
 *   rond et un chrono discret ; stop — ou trois minutes, ou quitter le mode —
 *   enregistre le fichier, là où partent les photos ;
 * - l'indice « Deux tapes : photo · Appui long : vidéo », montré UNE fois.
 *
 * Chunk à part (`budgets.json` › `call_capture_studio`), partagé par les deux
 * modes ; il n'importe rien de l'écran d'appel.
 */

export type StudioStatus = { readonly text: string; readonly tone: 'ok' | 'error' | 'busy' };

/** Ce que filme un mode : la piste vidéo rendue, que `release` rend. */
export type StudioVideo = { readonly track: MediaStreamTrack; readonly release: () => void };

type StudioInput = {
  readonly language: InterfaceLanguage;
  readonly still: () => Promise<CaptureFile | null>;
  readonly video: () => StudioVideo | null;
  readonly audio: () => readonly MediaStream[];
  /** Le nom du style, pour le fichier. */
  readonly style: () => string;
  readonly save?: (files: readonly CaptureFile[]) => Promise<SaveOutcome>;
  readonly clipEnv?: () => ClipEnv;
};

const TOAST_MS = 2600;

const HINT_KEY = 'meeshy.call.captureHint';

const HINT_MS = 4000;

const reducedMotion = (): boolean => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

type Running = { readonly clip: Clip; readonly video: StudioVideo; readonly startedAt: number };

export function useCaptureStudio({ language, still, video, audio, style, save = saveCaptures, clipEnv = browserClipEnv }: StudioInput) {
  const [status, setStatus] = useState<StudioStatus | null>(null);
  const [flashing, setFlashing] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const running = useRef<Running | null>(null);
  const saver = useRef(save);
  saver.current = save;

  useEffect(() => {
    if (status === null || status.tone === 'busy') return undefined;
    const timer = setTimeout(() => setStatus(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [status]);

  const finish = async (): Promise<SaveOutcome | null> => {
    const current = running.current;
    if (current === null) return null;
    running.current = null;
    const file = await current.clip.stop();
    current.video.release();
    return file === null ? { saved: 0, failed: 1, cancelled: 0 } : saver.current([file]);
  };

  const stop = async (): Promise<void> => {
    if (running.current === null) return;
    setStartedAt(null);
    setStatus({ text: t(language, 'callStudio.capture.busy'), tone: 'busy' });
    const outcome = await finish();
    if (outcome === null) return;
    if (outcome.saved > 0) setStatus({ text: t(language, 'callStudio.record.saved'), tone: 'ok' });
    else if (outcome.cancelled > 0 && outcome.failed === 0) setStatus({ text: t(language, 'callStudio.capture.cancelled'), tone: 'ok' });
    else setStatus({ text: t(language, 'callStudio.record.failed'), tone: 'error' });
  };

  useEffect(() => {
    if (startedAt === null) return undefined;
    const tick = setInterval(() => {
      setNow(Date.now());
      if (Date.now() - startedAt >= MAX_CLIP_MS) void stop();
    }, 500);
    return () => clearInterval(tick);
  }, [startedAt]);

  useEffect(() => () => void finish(), []);

  const record = (): void => {
    if (running.current !== null) return;
    const rendered = video();
    const clip = rendered === null ? null : startClip({ video: rendered.track, audio: audio(), style: style(), env: clipEnv() });
    if (rendered === null || clip === null) {
      rendered?.release();
      setStatus({ text: t(language, rendered === null ? 'callStudio.capture.empty' : 'callStudio.record.unsupported'), tone: 'error' });
      return;
    }
    const at = Date.now();
    running.current = { clip, video: rendered, startedAt: at };
    setNow(at);
    setStartedAt(at);
    setStatus(null);
    if (typeof navigator !== 'undefined') navigator.vibrate?.(20);
  };

  const photo = async (): Promise<void> => {
    if (status?.tone === 'busy' || running.current !== null) return;
    setStatus({ text: t(language, 'callStudio.capture.busy'), tone: 'busy' });
    const file = await still();
    if (file === null) {
      setStatus({ text: t(language, 'callStudio.capture.empty'), tone: 'error' });
      return;
    }
    if (!reducedMotion()) setFlashing(true);
    if (typeof navigator !== 'undefined') navigator.vibrate?.(30);
    const outcome = await saver.current([file]);
    if (outcome.saved > 0) setStatus({ text: t(language, 'callStudio.capture.saved'), tone: 'ok' });
    else if (outcome.cancelled > 0 && outcome.failed === 0) setStatus({ text: t(language, 'callStudio.capture.cancelled'), tone: 'ok' });
    else setStatus({ text: t(language, 'callStudio.capture.failed'), tone: 'error' });
  };

  const recording = startedAt !== null;
  return {
    status,
    setStatus,
    busy: status?.tone === 'busy',
    recording,
    elapsedMs: recording ? Math.max(0, now - startedAt) : 0,
    flashing,
    endFlash: () => setFlashing(false),
    photo,
    record,
    stop,
    capture: (intent: 'photo' | 'record') => void (intent === 'photo' ? photo() : record()),
  };
}

const hintSeen = (): boolean => {
  try {
    return localStorage.getItem(HINT_KEY) === '1';
  } catch {
    return true;
  }
};

const markHintSeen = (): void => {
  try {
    localStorage.setItem(HINT_KEY, '1');
  } catch {
    /* Sans stockage, l'indice revient au prochain mode : rien de plus. */
  }
};

/** L'indice du geste, montré une seule fois, quelques secondes. */
export function CaptureHint({ language }: { readonly language: InterfaceLanguage }) {
  const [shown, setShown] = useState(() => !hintSeen());
  useEffect(() => {
    if (!shown) return undefined;
    markHintSeen();
    const timer = setTimeout(() => setShown(false), HINT_MS);
    return () => clearTimeout(timer);
  }, []);
  return shown ? (
    <p aria-hidden className="glass-call rounded-full px-3 py-1 text-mini font-semibold text-on-media" data-call-capture-hint="">
      {t(language, 'callStudio.capture.hint')}
    </p>
  ) : null;
}

/** Ce qu'une capture dit : parti, annulé, raté. */
export function CaptureStatus({ status }: { readonly status: StudioStatus | null }) {
  return (
    <p
      role="status"
      aria-live="polite"
      className={`glass-call min-h-8 rounded-full px-4 py-1.5 text-mini font-semibold transition-opacity motion-reduce:transition-none ${status === null ? 'opacity-0' : 'opacity-100'} ${status?.tone === 'error' ? 'text-[var(--ios-error,var(--color-error))]' : 'text-on-media'}`}
      data-call-capture-status={status?.tone ?? ''}
    >
      {status?.text ?? ''}
    </p>
  );
}

/** Le bouton stop, rond, au centre du gabarit, sous un chrono discret. */
export function RecordingStop({ language, elapsedMs, onStop }: { readonly language: InterfaceLanguage; readonly elapsedMs: number; readonly onStop: () => void }) {
  const clock = clipClock(elapsedMs);
  return (
    <div className="pointer-events-none fixed inset-0 z-10 grid place-items-center" data-call-recording="">
      <div className="flex flex-col items-center gap-3">
        <span className="glass-call flex items-center gap-2 rounded-full px-3 py-1 text-mini font-semibold tabular-nums text-on-media" data-call-record-clock="">
          <span aria-hidden className="size-2 rounded-full motion-safe:animate-pulse" style={{ background: 'var(--ios-error-strong)' }} />
          {clock}
        </span>
        <button
          type="button"
          aria-label={`${t(language, 'callStudio.record.stop')} — ${t(language, 'callStudio.record.clock', { time: clock })}`}
          onClick={onStop}
          className="pointer-events-auto grid size-[72px] place-items-center rounded-full border-4 border-on-media transition-transform active:scale-95 motion-reduce:transition-none"
          style={{ background: 'var(--color-scrim-soft)', boxShadow: 'var(--shadow-lg)' }}
          data-call-record-stop=""
        >
          <span aria-hidden className="size-7 rounded-md" style={{ background: 'var(--ios-error-strong)' }} />
        </button>
      </div>
    </div>
  );
}

/** La vidéo au clavier : invisible, elle se montre au focus (Tab), et arrête ce qu'elle a lancé. */
export function KeyboardRecord({ language, recording, onPress }: { readonly language: InterfaceLanguage; readonly recording: boolean; readonly onPress: () => void }) {
  return (
    <button type="button" onClick={onPress} className="sr-only rounded-full px-4 py-2 text-mini font-semibold text-on-media focus:not-sr-only focus:bg-scrim-strong" data-call-record-key="">
      {t(language, recording ? 'callStudio.record.stop' : 'callStudio.record.start')}
    </button>
  );
}

export function CaptureFlash({ onDone }: { readonly onDone: () => void }) {
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
  const host = typeof document === 'undefined' ? null : (document.querySelector('[data-call-screen]') ?? document.body);
  return host === null ? null : createPortal(<div ref={flash} aria-hidden className="pointer-events-none fixed inset-0 z-[260] bg-on-media opacity-0" data-call-capture-flash="" />, host);
}
