import { colorForName } from '@meeshy/shared/utils/conversation-colors';
import { useEffect, useState } from 'react';
import { useStore } from 'zustand/react';

import { Avatar } from '@/components/avatar';
import { StreamAudio } from '@/components/call-media-elements';
import { CallScreen } from '@/components/call-screen';
import { Glyph, GlyphSvg } from '@/components/glyph';
import { CALL_SCREEN_GLYPHS } from '@/components/glyphs-call-screen';
import { callActions } from '@/lib/calls/call-actions';
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
  return (
    <div
      className="fixed left-1/2 top-[calc(env(safe-area-inset-top)+0.5rem)] z-[190] flex -translate-x-1/2 items-center gap-1 rounded-full py-1 pl-1 pr-1 shadow-lg"
      style={{ background: PILL_BG, color: '#fff' }}
      data-call-pill-bar=""
    >
      <button type="button" onClick={callActions.expand} aria-label={translate(language, 'call.expand')} className="flex min-h-11 items-center gap-2 rounded-full px-2">
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
      className="fixed inset-x-3 top-[calc(env(safe-area-inset-top)+3.75rem)] z-[210] mx-auto flex max-w-md items-center gap-3 rounded-card p-3 shadow-lg"
      style={{ background: PILL_BG, color: '#fff' }}
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
    <div role="status" className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+6rem)] z-[210] mx-auto w-fit rounded-full px-4 py-2 text-body shadow-lg" style={{ background: PILL_BG, color: '#fff' }}>
      {translate(language, 'call.notice.alreadyInCall')}
    </div>
  );
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
      {call === null ? null : call.display === 'pill' && call.phase.kind !== 'incoming' && call.phase.kind !== 'ended' ? <CallPill call={call} /> : <CallScreen call={call} />}
      {waiting === null ? null : <WaitingBanner waiting={waiting} />}
      {notice === null ? null : <Notice />}
    </>
  );
}
