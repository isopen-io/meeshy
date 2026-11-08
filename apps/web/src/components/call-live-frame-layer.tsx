import { useEffect, useRef, useState } from 'react';

import { frameDisplayName } from '@meeshy/shared/types/frame-name';
import { GlyphSvg } from '@/components/glyph';
import { CALL_DEVICES_GLYPHS } from '@/components/glyphs-call-devices';
import type { MontageCall } from '@/lib/calls/call-montage-circle';
import type { CallLiveFrameState } from '@/lib/calls/call-live-frame-store';
import type { FrameChrome } from '@/lib/calls/frames/frame-chrome-reserve';
import type { FrameStudio } from '@/lib/calls/frames/frame-studio';
import { startFrameClock } from '@/lib/calls/frame-clock';
import { translateCallControls as t } from '@/lib/i18n-call-controls-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

import { browserCircle, paintFramed, type CircleOf, type FrameStudioLoader } from './use-montage-frames';

/**
 * **LE CADRE EN DIRECT À L'ÉCRAN** (#16943, loi 16, vues C2 et C3) — chunk à
 * part, chargé par l'écran d'appel seulement quand un cadre, une proposition
 * ou une réponse existe : l'atelier des cadres (`call_frame_studio`) ne pèse
 * jamais sur un appel sans cadre.
 *
 * - **La carte de proposition** (C2) : en haut, sous l'en-tête, en verre
 *   prononcé ; rien ne change chez moi tant que je n'ai pas touché
 *   « Appliquer ». Elle ne se range jamais avec les commandes (loi 11).
 * - **La capsule de réponse** (C3, chez qui a proposé) : « Awa a appliqué
 *   votre cadre » ou « … garde son affichage », quatre secondes.
 * - **La surface** (C3) : le cadre composé par son peintre, les deux vidéos
 *   dans ses cases, repeint à la cadence de la vidéo ; elle ne prend aucun
 *   toucher, et aucun de ses textes ne passe sous l'en-tête ni sous la pilule.
 */

export const LIVE_FRAME_NOTICE_MS = 4_000;

/** Les bandes que l'en-tête et la pilule couvrent (`CallLiveFrameRule.chromeReserve` iOS : 52 et 84, plus l'encart). */
export const LIVE_FRAME_RESERVE = { top: 64, bottom: 112 } as const;

export const LIVE_FRAME_FPS = 30;

const INK = 'var(--color-on-media)';

const BRAND = 'linear-gradient(90deg, var(--ios-indigo-500), var(--ios-purple-500))';

const studios = new WeakMap<FrameStudioLoader, Promise<FrameStudio>>();

/** L'atelier des cadres, chargé et construit UNE fois par chargeur, quel que soit le nombre de ses lecteurs. */
export function useLiveFrameStudio(load: FrameStudioLoader): FrameStudio | null {
  const [studio, setStudio] = useState<FrameStudio | null>(null);
  useEffect(() => {
    const alive = { current: true };
    const pending = studios.get(load) ?? load().then((module) => module.createFrameStudio());
    studios.set(load, pending);
    pending.then(
      (built) => {
        if (alive.current) setStudio(built);
      },
      () => studios.delete(load),
    );
    return () => {
      alive.current = false;
    };
  }, []);
  return studio;
}

const PAINT_LONGEST_SIDE = 2048;

/** La toile à la taille de l'écran en pixels, bornée : au-delà, la carte graphique agrandit (`CallLiveFrameRule.paintSize`). */
export function liveFramePaintSize(viewport: { readonly width: number; readonly height: number }, scale: number): { readonly width: number; readonly height: number } {
  const pixels = { width: viewport.width * Math.max(scale, 1), height: viewport.height * Math.max(scale, 1) };
  const factor = Math.min(1, PAINT_LONGEST_SIDE / Math.max(pixels.width, pixels.height, 1));
  return { width: Math.round(pixels.width * factor), height: Math.round(pixels.height * factor) };
}

type StatusProps = {
  readonly language: InterfaceLanguage;
  readonly state: Pick<CallLiveFrameState, 'proposal' | 'answer' | 'notice'>;
  /** Le nom d'un cadre du catalogue dans la langue d'interface ; `null` pour un cadre inconnu. */
  readonly nameOf: (frameId: string) => string | null;
  readonly onAccept: () => void;
  readonly onDecline: () => void;
  readonly onDismissAnswer: () => void;
  readonly onDismissNotice: () => void;
};

const proposalText = (language: InterfaceLanguage, from: string | null, frame: string): string =>
  from === null ? t(language, 'callControls.liveFrame.proposal.anonymous', { frame }) : t(language, 'callControls.liveFrame.proposal', { name: from, frame });

const answerText = (language: InterfaceLanguage, answer: NonNullable<CallLiveFrameState['answer']>): string => {
  if (answer.reply === 'accepted') return answer.from === null ? t(language, 'callControls.liveFrame.answer.accepted.anonymous') : t(language, 'callControls.liveFrame.answer.accepted', { name: answer.from });
  return answer.from === null ? t(language, 'callControls.liveFrame.answer.declined.anonymous') : t(language, 'callControls.liveFrame.answer.declined', { name: answer.from });
};

function useDismissAfter(active: unknown, dismiss: () => void): void {
  const latest = useRef(dismiss);
  latest.current = dismiss;
  useEffect(() => {
    if (active === null) return undefined;
    const handle = setTimeout(() => latest.current(), LIVE_FRAME_NOTICE_MS);
    return () => clearTimeout(handle);
  }, [active]);
}

function Capsule({ text, data }: { readonly text: string; readonly data: Readonly<Record<`data-${string}`, string>> }) {
  return (
    <span className="glass-call-prominent rounded-full px-4 py-2 text-mini font-semibold" role="status" style={{ color: INK }} {...data}>
      {text}
    </span>
  );
}

/** Une proposition à trancher, la réponse de l'autre à la mienne, ou un cadre resté chez moi. */
export function CallLiveFrameStatus({ language, state, nameOf, onAccept, onDecline, onDismissAnswer, onDismissNotice }: StatusProps) {
  useDismissAfter(state.proposal === null ? state.answer : null, onDismissAnswer);
  useDismissAfter(state.notice, onDismissNotice);
  const proposed = state.proposal === null ? null : nameOf(state.proposal.frameId);
  if (state.proposal !== null && proposed !== null) {
    return (
      <div role="group" aria-label={proposalText(language, state.proposal.from, proposed)} className="glass-call-prominent mx-3 flex flex-col gap-3 rounded-[22px] p-3.5" style={{ color: INK }} data-call-live-frame-proposal={state.proposal.frameId}>
        <p className="flex items-center gap-2.5 text-body font-semibold">
          <GlyphSvg glyph={CALL_DEVICES_GLYPHS.pictureInPicture} size={20} />
          <span>{proposalText(language, state.proposal.from, proposed)}</span>
        </p>
        <div className="flex gap-2">
          <button type="button" onClick={onDecline} className="min-h-11 flex-1 rounded-full bg-media-fill font-semibold transition-transform active:scale-95 motion-reduce:transition-none" data-call-live-frame-decline="">
            {t(language, 'callControls.liveFrame.decline')}
          </button>
          <button type="button" onClick={onAccept} className="min-h-11 flex-1 rounded-full font-semibold transition-transform active:scale-95 motion-reduce:transition-none" style={{ background: BRAND, color: 'var(--ios-on-brand)' }} data-call-live-frame-accept="">
            {t(language, 'callControls.liveFrame.accept')}
          </button>
        </div>
      </div>
    );
  }
  if (state.answer !== null) return <Capsule text={answerText(language, state.answer)} data={{ 'data-call-live-frame-answer': state.answer.reply }} />;
  if (state.notice === 'not-proposed') return <Capsule text={t(language, 'callControls.liveFrame.notProposed')} data={{ 'data-call-live-frame-notice': state.notice }} />;
  return null;
}

type SurfaceProps = {
  readonly language: InterfaceLanguage;
  readonly studio: FrameStudio;
  readonly frameId: string;
  readonly call: MontageCall;
  /** Le prénom que l'autre partage : il remplace celui qu'on avait de lui. */
  readonly remoteSharedName: string | null;
  readonly stage: () => Element | null;
  readonly circleOf?: CircleOf;
};

const viewportSize = (): { readonly width: number; readonly height: number } => (typeof window === 'undefined' ? { width: 1080, height: 1920 } : { width: window.innerWidth, height: window.innerHeight });

/** Le cadre gardé, composé autour des deux vidéos de la scène — sans prendre un toucher. */
export function CallLiveFrameSurface({ language, studio, frameId, call, remoteSharedName, stage, circleOf = browserCircle }: SurfaceProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const frame = studio.find(frameId);
  const base = circleOf(call, language);
  const circle = remoteSharedName === null ? base : { ...base, people: base.people.map((person) => (person.isSelf ? person : { ...person, name: remoteSharedName })) };
  const latest = useRef({ frame, circle });
  latest.current = { frame, circle };
  const size = liveFramePaintSize(viewportSize(), typeof window === 'undefined' ? 1 : window.devicePixelRatio);

  useEffect(() => {
    const paint = (): void => {
      const { frame: shown, circle: people } = latest.current;
      if (shown === null) return;
      const viewport = viewportSize();
      const chrome: FrameChrome = { viewport, ...LIVE_FRAME_RESERVE };
      paintFramed(canvas.current, stage(), studio, shown, people, 'preview', chrome);
    };
    paint();
    const clock = startFrameClock({ fps: LIVE_FRAME_FPS, tick: paint, driver: () => stage()?.querySelector<HTMLVideoElement>('video') ?? null });
    return () => clock.stop();
  }, [studio, frameId]);

  if (frame === null) return null;
  return (
    <canvas
      ref={canvas}
      width={size.width}
      height={size.height}
      role="img"
      aria-label={t(language, 'callControls.liveFrame.surface', { frame: frameDisplayName(frame, language) })}
      className="pointer-events-none absolute inset-0 z-[5] size-full"
      data-call-live-frame-surface={frameId}
    />
  );
}

/** Le nom d'un cadre du catalogue, ou `null` tant que l'atelier n'est pas là ou que le cadre est inconnu. */
export const frameNameOf =
  (studio: FrameStudio | null, language: InterfaceLanguage) =>
  (frameId: string): string | null => {
    const frame = studio?.find(frameId) ?? null;
    return frame === null ? null : frameDisplayName(frame, language);
  };
