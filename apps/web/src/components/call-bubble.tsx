import { colorForName } from '@meeshy/shared/utils/conversation-colors';
import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { useStore } from 'zustand/react';

import { Avatar } from '@/components/avatar';
import { StreamVideo } from '@/components/call-media-elements';
import { Glyph, GlyphSvg } from '@/components/glyph';
import { CALL_DEVICES_GLYPHS } from '@/components/glyphs-call-devices';
import { CALL_SCREEN_GLYPHS } from '@/components/glyphs-call-screen';
import { callActions } from '@/lib/calls/call-actions';
import {
  bubbleOrigin,
  bubbleSize,
  isBubbleTap,
  nudgeBubble,
  readBubblePlacement,
  snapBubble,
  writeBubblePlacement,
  type BubblePlacement,
  type Point,
  type Size,
} from '@/lib/calls/call-bubble';
import { browserPreferenceStorage } from '@/lib/calls/call-devices';
import { browserPipSupport, pipSource, shouldOfferPip } from '@/lib/calls/call-pip';
import { callStore, elapsedSeconds, formatCallClock, type ActiveCall } from '@/lib/calls/call-store';
import { callStatusKey } from '@/lib/calls/call-view';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { initialsOf } from '@/lib/view/conversation';

/**
 * **LA BULLE D'APPEL** (#8046, D9) — miroir de `CallBubbleView.swift` : la
 * forme repliée de l'appel, atteinte depuis la pastille (bouton ou glissement).
 * Elle porte la vidéo du pair (sinon la mienne, sinon son portrait), se
 * déplace au doigt ou à la souris, se clipse au bord le plus proche et garde
 * sa place d'un appel à l'autre. Toucher la bulle rend l'écran d'appel ; sa
 * barre garde le micro, l'image dans l'image et raccrocher à portée — le
 * reste de l'application reste utilisable dessous.
 */

/* Les marges que la bulle ne recouvre jamais : l'en-tête d'un écran (et ses
   boutons d'appel) en haut, le champ d'écriture et le barreau en bas. La zone
   sûre du système s'y AJOUTE en CSS. */
const INSETS = { top: 64, bottom: 96 };
const BG = 'rgba(17,16,24,0.92)';

function useViewport(): Size {
  const read = (): Size => (typeof window === 'undefined' ? { width: 390, height: 844 } : { width: window.innerWidth, height: window.innerHeight });
  const [viewport, setViewport] = useState(read);
  useEffect(() => {
    const onResize = () => setViewport(read());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return viewport;
}

function BubbleClock({ call }: { readonly call: ActiveCall }) {
  const language = currentInterfaceLanguage();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const handle = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(handle);
  }, []);
  const statusKey = callStatusKey(call);
  return <span className="text-mini tabular-nums">{statusKey === null ? formatCallClock(elapsedSeconds(call, now)) : translate(language, statusKey)}</span>;
}

export function CallBubble({ call }: { readonly call: ActiveCall }) {
  const language = currentInterfaceLanguage();
  const hintId = useId();
  const viewport = useViewport();
  const [placement, setPlacement] = useState<BubblePlacement>(() => readBubblePlacement(browserPreferenceStorage()));
  const [drag, setDrag] = useState<Point | null>(null);
  const start = useRef<Point | null>(null);
  const dragged = useRef(false);
  const source = pipSource(call);
  const size = bubbleSize(source === null ? 'portrait' : 'video');
  const origin = bubbleOrigin(placement, viewport, INSETS, size);
  const offerPip = shouldOfferPip(call, browserPipSupport());

  const place = (next: BubblePlacement) => {
    setPlacement(next);
    writeBubblePlacement(browserPreferenceStorage(), next);
  };

  const onPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    start.current = { x: event.clientX, y: event.clientY };
    dragged.current = false;
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    if (start.current === null) return;
    const moved = { x: event.clientX - start.current.x, y: event.clientY - start.current.y };
    if (!dragged.current && isBubbleTap(moved)) return;
    dragged.current = true;
    setDrag(moved);
  };
  const onPointerUp = () => {
    const moved = drag;
    start.current = null;
    setDrag(null);
    if (moved === null || !dragged.current) return;
    place(snapBubble({ x: origin.left + moved.x + size.width / 2, y: origin.top + moved.y + size.height / 2 }, viewport, INSETS, size));
  };
  const onClick = () => {
    if (dragged.current) {
      dragged.current = false;
      return;
    }
    callActions.expand();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const next = nudgeBubble(placement, event.key);
    if (next === null) return;
    event.preventDefault();
    place(next);
  };

  return (
    <div
      role="group"
      aria-label={`${call.title} · ${translate(language, 'call.bubble.ongoing')}`}
      className="fixed z-[190] flex flex-col overflow-hidden rounded-card shadow-lg"
      style={{
        width: size.width,
        height: size.height,
        left: origin.left + (drag?.x ?? 0),
        top: `calc(${origin.top + (drag?.y ?? 0)}px + env(safe-area-inset-top))`,
        background: BG,
        color: '#fff',
        transition: drag === null ? 'left 180ms ease-out, top 180ms ease-out' : 'none',
        touchAction: 'none',
      }}
      data-call-bubble={placement.edge}
    >
      <button
        type="button"
        aria-label={translate(language, 'call.expand')}
        aria-describedby={hintId}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClick={onClick}
        onKeyDown={onKeyDown}
        className="relative grid min-h-0 flex-1 cursor-grab place-items-center"
        data-call-bubble-body=""
      >
        {source === null ? (
          <span className="flex flex-col items-center gap-1">
            <Avatar initials={initialsOf(call.title)} color={colorForName(call.title)} size={48} {...(call.avatar === null ? {} : { src: call.avatar })} />
            <BubbleClock call={call} />
          </span>
        ) : (
          <>
            <StreamVideo stream={source.stream} mirrored={source.mirrored} className="absolute inset-0 size-full" label={call.title} />
            <span className="absolute bottom-1 left-1 rounded-full px-1.5 text-mini" style={{ background: 'rgba(0,0,0,0.55)' }}>
              <BubbleClock call={call} />
            </span>
          </>
        )}
        <span id={hintId} className="sr-only">
          {translate(language, 'call.bubble.moveHint')}
        </span>
      </button>
      <div className="flex h-12 items-center justify-around">
        <button
          type="button"
          onClick={callActions.toggleMic}
          aria-pressed={call.micMuted}
          aria-label={translate(language, call.micMuted ? 'call.mic.unmute' : 'call.mic.mute')}
          className="grid size-11 place-items-center rounded-full"
          data-call-bubble-control="mic"
        >
          {call.micMuted ? <GlyphSvg glyph={CALL_SCREEN_GLYPHS.microphoneSlash} size={20} /> : <Glyph name="microphone" size={20} />}
        </button>
        {offerPip ? (
          <button type="button" onClick={() => void import('@/components/call-pip-window').then((module) => module.openCallPip())} aria-label={translate(language, 'call.pip.enter')} className="grid size-11 place-items-center rounded-full" data-call-bubble-control="pip">
            <GlyphSvg glyph={CALL_DEVICES_GLYPHS.pictureInPicture} size={20} />
          </button>
        ) : null}
        <button type="button" onClick={callActions.hangup} aria-label={translate(language, 'call.hangup')} className="grid size-11 place-items-center rounded-full" style={{ background: '#ef4444' }} data-call-bubble-control="hangup">
          <GlyphSvg glyph={CALL_SCREEN_GLYPHS.phoneDisconnect} size={20} />
        </button>
      </div>
    </div>
  );
}

/**
 * Monté par `call-layer.tsx` en chunk à part, frère de l'écran d'appel : la
 * bulle ne pèse rien tant qu'on ne replie pas l'appel. La sonnerie et la fin
 * reprennent toujours l'écran plein (`call-overlay.tsx`).
 */
export function CallBubbleLayer() {
  const call = useStore(callStore, (state) => state.call);
  if (call === null || call.display !== 'bubble' || call.phase.kind === 'incoming' || call.phase.kind === 'ended') return null;
  return <CallBubble call={call} />;
}
