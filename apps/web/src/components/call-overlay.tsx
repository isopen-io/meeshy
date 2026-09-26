import { colorForName } from '@meeshy/shared/utils/conversation-colors';
import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { useStore } from 'zustand/react';

import { Avatar } from '@/components/avatar';
import { CallBubble } from '@/components/call-bubble';
import { StreamAudio } from '@/components/call-media-elements';
import { CallPip } from '@/components/call-pip-window';
import { CallScreen } from '@/components/call-screen';
import { Glyph, GlyphSvg } from '@/components/glyph';
import { CALL_DEVICES_GLYPHS } from '@/components/glyphs-call-devices';
import { CALL_SCREEN_GLYPHS } from '@/components/glyphs-call-screen';
import { callActions } from '@/lib/calls/call-actions';
import { PILL_COLLAPSE_DISTANCE } from '@/lib/calls/call-bubble';
import { callStore, elapsedSeconds, formatCallClock, type ActiveCall, type WaitingCall } from '@/lib/calls/call-store';
import { callStatusKey } from '@/lib/calls/call-view';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { initialsOf } from '@/lib/view/conversation';

/**
 * **CE QUE LA COUCHE D'APPEL PEINT** (#6382) — l'écran plein, OU la pastille
 * flottante quand l'appel est réduit (`FloatingCallPillView.swift` : durée ou
 * état, micro, raccrocher, toucher pour revenir), le bandeau d'appel en
 * attente (`CallWaitingBannerView.swift`), et le refus « un appel est déjà en
 * cours ». Le son des pairs est monté ICI, hors de l'écran : réduire l'appel
 * ne le coupe pas.
 *
 * #8046 — la pastille se replie en BULLE déplaçable (bouton, ou glissement
 * horizontal franc comme sur iOS), et l'image dans l'image (`CallPip`) vit
 * ici aussi : elle doit survivre à l'écran plein comme à la pastille. Ni la
 * pastille ni la bulle ne couvrent l'application : on navigue et on écrit
 * dessous.
 */

const PILL_BG = 'rgba(17,16,24,0.92)';
const HANGUP = '#ef4444';
const ANSWER = '#22c55e';

function CallPill({ call }: { readonly call: ActiveCall }) {
  const language = currentInterfaceLanguage();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const handle = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(handle);
  }, []);
  const statusKey = callStatusKey(call);
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
      className="fixed left-1/2 z-[190] flex -translate-x-1/2 items-center gap-1 rounded-full py-1 pl-1 pr-1 shadow-lg"
      style={{ background: PILL_BG, color: '#fff', top: 'calc(env(safe-area-inset-top) + 0.5rem)', touchAction: 'pan-y' }}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={() => void (swipeFrom.current = null)}
      data-call-pill-bar=""
    >
      <button type="button" onClick={expand} aria-label={translate(language, 'call.expand')} className="flex min-h-11 items-center gap-2 rounded-full px-2">
        <span aria-hidden className="size-2 rounded-full" style={{ background: ANSWER }} />
        <span className="max-w-[9rem] truncate text-body font-semibold">{call.title}</span>
        <span className="text-mini tabular-nums" style={{ color: 'rgba(255,255,255,0.72)' }}>
          {label}
        </span>
      </button>
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
    </div>
  );
}

function WaitingBanner({ waiting }: { readonly waiting: WaitingCall }) {
  const language = currentInterfaceLanguage();
  return (
    <div
      role="alertdialog"
      aria-label={translate(language, 'call.waiting.from', { caller: waiting.callerName })}
      className="fixed inset-x-3 z-[210] mx-auto flex max-w-md items-center gap-3 rounded-card p-3 shadow-lg"
      style={{ background: PILL_BG, color: '#fff', top: 'calc(env(safe-area-inset-top) + 3.75rem)' }}
      data-call-waiting=""
    >
      <Avatar initials={initialsOf(waiting.callerName)} color={colorForName(waiting.callerName)} size={40} {...(waiting.callerAvatar === null ? {} : { src: waiting.callerAvatar })} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-body font-semibold">{waiting.title}</p>
        <p className="truncate text-mini" style={{ color: 'rgba(255,255,255,0.72)' }}>
          {translate(language, 'call.waiting.from', { caller: waiting.callerName })}
        </p>
      </div>
      <button type="button" onClick={callActions.declineWaiting} className="min-h-11 rounded-full px-3 text-body font-semibold" style={{ background: HANGUP }}>
        {translate(language, 'call.waiting.decline')}
      </button>
      <button type="button" onClick={callActions.answerWaiting} className="min-h-11 rounded-full px-3 text-body font-semibold" style={{ background: ANSWER }}>
        {translate(language, 'call.waiting.answer')}
      </button>
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
    <div role="status" className="fixed inset-x-0 z-[210] mx-auto w-fit rounded-full px-4 py-2 text-body shadow-lg" style={{ background: PILL_BG, color: '#fff', bottom: 'calc(env(safe-area-inset-bottom) + 6rem)' }}>
      {translate(language, 'call.notice.alreadyInCall')}
    </div>
  );
}

/** L'écran plein, la pastille ou la bulle — la sonnerie et la fin reprennent toujours l'écran plein. */
export function ActiveCallView({ call }: { readonly call: ActiveCall }) {
  const reduced = call.phase.kind !== 'incoming' && call.phase.kind !== 'ended';
  if (reduced && call.display === 'pill') return <CallPill call={call} />;
  if (reduced && call.display === 'bubble') return <CallBubble call={call} />;
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
      {call === null ? null : <CallPip call={call} />}
      {waiting === null ? null : <WaitingBanner waiting={waiting} />}
      {notice === null ? null : <Notice />}
    </>
  );
}
