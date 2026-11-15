import type { CaptureFrame } from '@/lib/calls/frames/frame-spec';
import type { FrameStudio } from '@/lib/calls/frames/frame-studio';
import { translateCallStudio as t } from '@/lib/i18n-call-studio-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

/** Le cadre en direct tel que le Montage le voit : celui que je garde, s'il est offert (à deux, en vidéo), et le geste. */
export type LiveFrameHold = { readonly heldFrameId: string | null; readonly offered: boolean; readonly toggle: (frameId: string) => void };

const holdGlyph = (
  <svg aria-hidden viewBox="0 0 24 24" className="size-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <rect x="12" y="11" width="6" height="5" rx="1" />
  </svg>
);

const SHAPE = 'flex h-12 items-center gap-2 rounded-full px-4 text-body font-semibold transition-transform active:scale-95 motion-reduce:transition-none';

type Props = { readonly hold: LiveFrameHold | undefined; readonly frame: CaptureFrame | null; readonly frames: FrameStudio | null; readonly language: InterfaceLanguage };

/**
 * **« CADRE »** (#16943, loi 16, vue C1) — sur un cadre du DIRECT, à deux en
 * vidéo, une capsule légendée garde ce cadre pendant tout l'appel et le
 * propose à l'autre ; retouchée, elle le retire. Pressée en blanc, comme tout
 * bouton actif. Absente ailleurs : le Montage ne fait alors que capturer.
 */
export function LiveFrameHoldOption({ hold, frame, frames, language }: Props) {
  if (hold === undefined || !hold.offered || frame === null || frames === null || !frames.servesCall(frame)) return null;
  const pressed = hold.heldFrameId === frame.id;
  const hint = t(language, 'callStudio.liveFrame.hint');
  return (
    <button
      type="button"
      aria-label={t(language, 'callStudio.liveFrame.hold')}
      {...{ 'aria-description': hint }}
      title={hint}
      aria-pressed={pressed}
      onClick={() => hold.toggle(frame.id)}
      className={pressed ? `bg-on-media text-[var(--ios-indigo-950)] ${SHAPE}` : `glass-call text-on-media ${SHAPE}`}
      data-call-live-frame-hold={frame.id}
    >
      {holdGlyph}
      <span aria-hidden="true">{t(language, 'callStudio.liveFrame.short')}</span>
    </button>
  );
}
