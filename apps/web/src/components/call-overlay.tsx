import { lazy, Suspense, useEffect, useRef, useState, type PointerEvent } from 'react';
import { useStore } from 'zustand/react';

import { StreamAudio } from '@/components/call-media-elements';
import { CallScreen } from '@/components/call-screen';
import { Glyph, GlyphSvg } from '@/components/glyph';
import { CALL_DEVICES_GLYPHS } from '@/components/glyphs-call-devices';
import { CALL_SCREEN_GLYPHS } from '@/components/glyphs-call-screen';
import { callActions } from '@/lib/calls/call-actions';
import { PILL_COLLAPSE_DISTANCE } from '@/lib/calls/call-bubble';
import { callStore, elapsedSeconds, formatCallClock, type ActiveCall } from '@/lib/calls/call-store';
import { callStatusKey } from '@/lib/calls/call-view';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';

/**
 * **CE QUE LA COUCHE D'APPEL PEINT** (#6382) — l'écran plein, OU la pastille
 * flottante quand l'appel est réduit (`FloatingCallPillView.swift` : durée ou
 * état, micro, raccrocher, toucher pour revenir), le bandeau d'appel en
 * attente (`CallWaitingBannerView.swift`), et le refus « un appel est déjà en
 * cours ». Le son des pairs est monté ICI, hors de l'écran : réduire l'appel
 * ne le coupe pas.
 *
 * #8046 — la pastille se replie en BULLE déplaçable (bouton, ou glissement
 * horizontal franc comme sur iOS). La bulle et l'image dans l'image sont des
 * chunks FRÈRES montés par `call-layer.tsx`, pas des enfants : ils partagent
 * les éléments média avec cet écran sans l'importer. Ni la pastille ni la
 * bulle ne couvrent l'application : on navigue et on écrit dessous.
 */

const PILL_BG = 'color-mix(in srgb, var(--color-media-backdrop) 92%, transparent)';
const HANGUP = 'var(--ios-error-strong)';

/** Je partage mon écran (#16664) : la capsule rougit, comme l'indicateur du système. */
const SHARING_BG = 'color-mix(in srgb, var(--ios-error-strong) 96%, transparent)';
const ANSWER = 'var(--ios-success)';

/* Le bandeau d'un second appel (#17499) : son chunk, préchargé par l'appel vivant (`call-screen.tsx` › PREFETCH). */
const CallWaitingBanner = lazy(() => import('./call-waiting-banner').then((module) => ({ default: module.CallWaitingBanner })));

function CallPill({ call }: { readonly call: ActiveCall }) {
  const language = currentInterfaceLanguage();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const handle = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(handle);
  }, []);
  const statusKey = callStatusKey(call);
  const sharing = call.screenSharing;
  const label = statusKey === null ? formatCallClock(elapsedSeconds(call, now)) : translate(language, statusKey);
  const swipeFrom = useRef<number | null>(null);
  const swiped = useRef(false);
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    swipeFrom.current = event.clientX;
    swiped.current = false;
  };
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const from = swipeFrom.current;
    swipeFrom.current = null;
    if (from === null || Math.abs(event.clientX - from) < PILL_COLLAPSE_DISTANCE) return;
    swiped.current = true;
    callActions.collapse();
  };
  const expand = () => {
    if (swiped.current) {
      swiped.current = false;
      return;
    }
    callActions.expand();
  };
  return (
    <div
      className="fixed left-1/2 z-[190] flex -translate-x-1/2 items-center gap-1 rounded-full py-1 ps-1 pe-1 shadow-lg"
      style={{ background: sharing ? SHARING_BG : PILL_BG, color: 'var(--color-on-media)', top: 'calc(env(safe-area-inset-top) + 0.5rem)', touchAction: 'pan-y' }}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={() => void (swipeFrom.current = null)}
      data-call-pill-bar=""
      data-call-pill-sharing={sharing ? '' : undefined}
    >
      <button type="button" onClick={expand} aria-label={translate(language, 'call.expand')} className="flex min-h-11 items-center gap-2 rounded-full px-2">
        {sharing ? <GlyphSvg glyph={CALL_SCREEN_GLYPHS.monitorArrowUp} size={18} /> : <span aria-hidden className="size-2 rounded-full" style={{ background: ANSWER }} />}
        <span className="max-w-[9rem] truncate text-body font-semibold">{call.title}</span>
        <span className="text-mini tabular-nums" style={{ color: sharing ? 'var(--color-on-media)' : 'var(--color-on-media-3)' }}>
          {label}
        </span>
      </button>
      {sharing ? (
        <button
          type="button"
          onClick={callActions.toggleScreen}
          aria-label={translate(language, 'call.screen.stop')}
          className="min-h-11 whitespace-nowrap rounded-full px-4 text-body font-semibold"
          style={{ background: 'color-mix(in srgb, white 22%, transparent)' }}
          data-call-pill-stop-share=""
        >
          {translate(language, 'call.screen.stopShort')}
        </button>
      ) : (
        <>
          <button
            type="button"
            onClick={callActions.toggleMic}
            aria-label={translate(language, call.micMuted ? 'call.mic.unmute' : 'call.mic.mute')}
            aria-pressed={call.micMuted}
            className="grid size-11 place-items-center rounded-full"
          >
            {call.micMuted ? <GlyphSvg glyph={CALL_SCREEN_GLYPHS.microphoneSlash} size={20} /> : <Glyph name="microphone" size={20} />}
          </button>
          <button type="button" onClick={callActions.collapse} aria-label={translate(language, 'call.bubble.collapse')} className="grid size-11 place-items-center rounded-full" data-call-pill-collapse="">
            <GlyphSvg glyph={CALL_DEVICES_GLYPHS.arrowDownRight} size={20} />
          </button>
          <button type="button" onClick={callActions.hangup} aria-label={translate(language, 'call.hangup')} className="grid size-11 place-items-center rounded-full" style={{ background: HANGUP }}>
            <GlyphSvg glyph={CALL_SCREEN_GLYPHS.phoneDisconnect} size={20} />
          </button>
        </>
      )}
    </div>
  );
}

function Notice() {
  const language = currentInterfaceLanguage();
  useEffect(() => {
    const handle = setTimeout(() => callStore.setState({ notice: null }), 2500);
    return () => clearTimeout(handle);
  }, []);
  return (
    <div role="status" className="fixed inset-x-0 z-[210] mx-auto w-fit rounded-full px-4 py-2 text-body shadow-lg" style={{ background: PILL_BG, color: 'var(--color-on-media)', bottom: 'calc(env(safe-area-inset-bottom) + 6rem)' }}>
      {translate(language, 'call.notice.alreadyInCall')}
    </div>
  );
}

/** L'écran plein ou la pastille — la bulle est un chunk frère (`call-layer.tsx`) ; la sonnerie et la fin reprennent toujours l'écran plein. */
export function ActiveCallView({ call }: { readonly call: ActiveCall }) {
  const reduced = call.phase.kind !== 'incoming' && call.phase.kind !== 'ended';
  if (reduced && call.display === 'pill') return <CallPill call={call} />;
  if (reduced && call.display === 'bubble') return null;
  return <CallScreen call={call} />;
}

export function CallOverlay() {
  const call = useStore(callStore, (state) => state.call);
  const waiting = useStore(callStore, (state) => state.waiting);
  const notice = useStore(callStore, (state) => state.notice);
  const streams = call === null ? [] : Object.entries(call.remoteStreams);
  return (
    <>
      {streams.map(([userId, stream]) => (
        <StreamAudio key={userId} stream={stream} />
      ))}
      {call === null ? null : <ActiveCallView call={call} />}
      {waiting === null ? null : (
        <Suspense fallback={null}>
          <CallWaitingBanner waiting={waiting} />
        </Suspense>
      )}
      {notice === null ? null : <Notice />}
    </>
  );
}
