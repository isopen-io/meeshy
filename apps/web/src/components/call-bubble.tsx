import { colorForName } from '@meeshy/shared/utils/conversation-colors';
import { lazy, Suspense, useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent, type WheelEvent } from 'react';
import { useStore } from 'zustand/react';

import { Avatar } from '@/components/avatar';
import { StreamVideo } from '@/components/call-media-elements';
import { Glyph, GlyphSvg } from '@/components/glyph';
import { CALL_DEVICES_GLYPHS } from '@/components/glyphs-call-devices';
import { CALL_SCREEN_GLYPHS } from '@/components/glyphs-call-screen';
import { CALL_VIEW_GLYPHS } from '@/components/glyphs-call-view';
import { callActions } from '@/lib/calls/call-actions';
import {
  bubbleOrigin,
  bubbleSize,
  fittingTier,
  isBubbleTap,
  nudgeBubble,
  offersOutputChoice,
  pinchTier,
  readBubblePlacement,
  snapBubble,
  wheelTier,
  writeBubblePlacement,
  type BubblePlacement,
  type BubbleTier,
  type Point,
  type Size,
} from '@/lib/calls/call-bubble';
import { browserPreferenceStorage, sinkSelectionSupported } from '@/lib/calls/call-devices';
import { browserPipSupport, pipSource, requestCallPip, shouldOfferPip } from '@/lib/calls/call-pip';
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
 *
 * #8145 — trois tailles, au pincement, à Ctrl + molette et aux touches + / −.
 * #8164 — un écran partagé s'y voit ENTIER, sur le fond neutre de la bulle.
 * #9097 — « Choisir les périphériques » (la sortie audio) y est aussi, là où
 * le choix de sortie existe, comme le bouton haut-parleur de la bulle iOS.
 */

const CallDevicesSheet = lazy(() => import('./call-devices-sheet').then((module) => ({ default: module.CallDevicesSheet })));

/* Les marges que la bulle ne recouvre jamais : l'en-tête d'un écran (et ses
   boutons d'appel) en haut, le champ d'écriture et le barreau en bas — 114
   mesurés au bas de sa course par `check-calls-during.mjs` (#8145), que 96
   recouvrait de 18. La zone sûre du système s'y AJOUTE en CSS. */
const INSETS = { top: 64, bottom: 120 };
const BG = 'color-mix(in srgb, var(--color-media-backdrop) 92%, transparent)';
const AVATAR: Readonly<Record<BubbleTier, number>> = { small: 48, medium: 60, large: 72 };

const distance = ([a, b]: readonly Point[]): number => (a === undefined || b === undefined ? 0 : Math.hypot(a.x - b.x, a.y - b.y));

function outputChoiceHere(): boolean {
  return offersOutputChoice({ shell: __SHELL__, sinks: typeof HTMLMediaElement !== 'undefined' && sinkSelectionSupported(HTMLMediaElement) });
}

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
  const [pinch, setPinch] = useState<number | null>(null);
  const [devicesOpen, setDevicesOpen] = useState(false);
  const start = useRef<Point | null>(null);
  const dragged = useRef(false);
  const pointers = useRef<ReadonlyMap<number, Point>>(new Map());
  const pinchFrom = useRef(0);
  const wheel = useRef(0);
  const source = pipSource(call);
  const offerPip = shouldOfferPip(call, browserPipSupport());
  const offerOutput = outputChoiceHere();
  const kind = source === null ? 'portrait' : 'video';
  const controls = 2 + (offerPip ? 1 : 0) + (offerOutput ? 1 : 0);
  const tier = fittingTier(placement.tier, viewport, INSETS, (candidate) => bubbleSize(kind, candidate, controls));
  const size = bubbleSize(kind, tier, controls);
  const origin = bubbleOrigin(placement, viewport, INSETS, size);

  const place = (next: BubblePlacement) => {
    setPlacement(next);
    writeBubblePlacement(browserPreferenceStorage(), next);
  };

  const onPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    pointers.current = new Map([...pointers.current, [event.pointerId, { x: event.clientX, y: event.clientY }]]);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    if (pointers.current.size === 2) {
      pinchFrom.current = distance([...pointers.current.values()]);
      start.current = null;
      dragged.current = true;
      setDrag(null);
      setPinch(1);
      return;
    }
    start.current = { x: event.clientX, y: event.clientY };
    dragged.current = false;
  };
  const onPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    if (pointers.current.has(event.pointerId)) pointers.current = new Map([...pointers.current, [event.pointerId, { x: event.clientX, y: event.clientY }]]);
    if (pinch !== null) {
      if (pinchFrom.current > 0) setPinch(distance([...pointers.current.values()]) / pinchFrom.current);
      return;
    }
    if (start.current === null) return;
    const moved = { x: event.clientX - start.current.x, y: event.clientY - start.current.y };
    if (!dragged.current && isBubbleTap(moved)) return;
    dragged.current = true;
    setDrag(moved);
  };
  const onPointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    pointers.current = new Map([...pointers.current].filter(([id]) => id !== event.pointerId));
    if (pinch !== null) {
      setPinch(null);
      place({ ...placement, tier: pinchTier(tier, pinch) });
      return;
    }
    const moved = drag;
    start.current = null;
    setDrag(null);
    if (moved === null || !dragged.current) return;
    place({ ...placement, ...snapBubble({ x: origin.left + moved.x + size.width / 2, y: origin.top + moved.y + size.height / 2 }, viewport, INSETS, size) });
  };
  const onClick = () => {
    if (dragged.current) {
      dragged.current = false;
      return;
    }
    callActions.expand();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const next = nudgeBubble({ ...placement, tier }, event.key);
    if (next === null) return;
    event.preventDefault();
    place(next);
  };
  const onWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (!event.ctrlKey) return;
    event.preventDefault();
    const next = wheelTier(tier, wheel.current, event.deltaY);
    wheel.current = next.accumulated;
    if (next.tier !== tier) place({ ...placement, tier: next.tier });
  };

  return (
    <>
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
          color: 'var(--color-on-media)',
          transform: pinch === null ? undefined : `scale(${Math.min(1.6, Math.max(0.6, pinch))})`,
          transformOrigin: placement.edge === 'left' ? 'left center' : 'right center',
          transition: drag === null && pinch === null ? 'left 180ms ease-out, top 180ms ease-out, width 180ms ease-out, height 180ms ease-out' : 'none',
          touchAction: 'none',
        }}
        onWheel={onWheel}
        data-call-bubble={placement.edge}
        data-call-bubble-size={tier}
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
              <Avatar initials={initialsOf(call.title)} color={colorForName(call.title)} size={AVATAR[tier]} {...(call.avatar === null ? {} : { src: call.avatar })} />
              <BubbleClock call={call} />
            </span>
          ) : (
            <>
              <StreamVideo stream={source.stream} mirrored={source.mirrored} fit={source.fit} className="absolute inset-0 size-full" label={call.title} />
              <span className="absolute bottom-1 left-1 rounded-full px-1.5 text-mini" style={{ background: 'var(--color-scrim)' }}>
                <BubbleClock call={call} />
              </span>
            </>
          )}
          <span id={hintId} className="sr-only">
            {`${translate(language, 'call.bubble.moveHint')}. ${translate(language, 'call.bubble.resizeHint')}`}
          </span>
        </button>
        <div className="flex flex-wrap items-center justify-around gap-y-1 py-0.5">
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
          {offerOutput ? (
            <button
              type="button"
              onClick={() => setDevicesOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={devicesOpen}
              aria-label={translate(language, 'call.devices.open')}
              className="grid size-11 place-items-center rounded-full"
              data-call-bubble-control="output"
            >
              <GlyphSvg glyph={CALL_VIEW_GLYPHS.speakerHigh} size={20} />
            </button>
          ) : null}
          {offerPip ? (
            <button type="button" onClick={requestCallPip} aria-label={translate(language, 'call.pip.enter')} className="grid size-11 place-items-center rounded-full" data-call-bubble-control="pip">
              <GlyphSvg glyph={CALL_DEVICES_GLYPHS.pictureInPicture} size={20} />
            </button>
          ) : null}
          <button type="button" onClick={callActions.hangup} aria-label={translate(language, 'call.hangup')} className="grid size-11 place-items-center rounded-full" style={{ background: 'var(--ios-error-strong)' }} data-call-bubble-control="hangup">
            <GlyphSvg glyph={CALL_SCREEN_GLYPHS.phoneDisconnect} size={20} />
          </button>
        </div>
      </div>
      {devicesOpen ? (
        <Suspense fallback={null}>
          <CallDevicesSheet onClose={() => setDevicesOpen(false)} />
        </Suspense>
      ) : null}
    </>
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
