import { useEffect, useRef, useState, type PointerEvent } from 'react';

import { useStore } from 'zustand/react';

import { Glyph, GlyphSvg } from '@/components/glyph';
import { CALL_DEVICES_GLYPHS } from '@/components/glyphs-call-devices';
import { CALL_SCREEN_GLYPHS } from '@/components/glyphs-call-screen';
import { callActions } from '@/lib/calls/call-actions';
import { pillSwipeCollapses } from '@/lib/calls/call-bubble';
import { reducedCaption, reducedTitle } from '@/lib/calls/call-header';
import { cachedCallNames } from '@/lib/calls/call-header-names';
import { pipOpenStore } from '@/lib/calls/call-pip';
import { elapsedSeconds, formatCallClock, type ActiveCall } from '@/lib/calls/call-store';
import { callStatusKey } from '@/lib/calls/call-view';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';

/**
 * **LA PASTILLE DE L'APPEL RÉDUIT** (#6382, #8046, #16664 ; `FloatingCallPillView.swift`) —
 * durée ou état, micro, replier en bulle, raccrocher, toucher pour revenir ; « Arrêter »
 * quand je partage mon écran. Elle ne se montre qu'une fois l'appel réduit : son chunk à
 * lui (`budgets.json` › `call_floating_pill`), que l'écran d'appel charge dès que l'appel
 * vit (`call-screen.tsx`), si bien que réduire ne l'attend pas et que `call_overlay` ne
 * le paie pas.
 */

const PILL_BG = 'color-mix(in srgb, var(--color-media-backdrop) 92%, transparent)';
const HANGUP = 'var(--ios-error-strong)';

/** Je partage mon écran (#16664) : la capsule rougit, comme l'indicateur du système. */
const SHARING_BG = 'color-mix(in srgb, var(--ios-error-strong) 96%, transparent)';
const ANSWER = 'var(--ios-success)';

/** P18.9 — pendant l'image dans l'image du navigateur, l'appel vit dans sa fenêtre : la capsule s'efface (comme la bulle). */
export function CallPill({ call }: { readonly call: ActiveCall }) {
  const away = useStore(pipOpenStore, (state) => state.open);
  return <CallPillBar call={call} away={away} />;
}

export function CallPillBar({ call, away }: { readonly call: ActiveCall; readonly away: boolean }) {
  const language = currentInterfaceLanguage();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const handle = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(handle);
  }, []);
  const statusKey = callStatusKey(call);
  const sharing = call.screenSharing;
  const label = statusKey === null ? formatCallClock(elapsedSeconds(call, now)) : translate(language, statusKey);
  const names = cachedCallNames(call);
  const sharingCaption = reducedCaption(reducedTitle({ givenName: names.givenName, groupName: names.groupName, displayName: call.title }), label);
  const swipeFrom = useRef<number | null>(null);
  const swiped = useRef(false);
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    swipeFrom.current = event.clientX;
    swiped.current = false;
  };
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const from = swipeFrom.current;
    swipeFrom.current = null;
    if (from === null || !pillSwipeCollapses({ travelled: event.clientX - from, sharing })) return;
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
      style={{ background: sharing ? SHARING_BG : PILL_BG, color: 'var(--color-on-media)', top: 'calc(env(safe-area-inset-top) + 0.5rem)', touchAction: 'pan-y', opacity: away ? 0 : 1, transition: 'opacity 200ms ease-out' }}
      aria-hidden={away ? true : undefined}
      inert={away}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={() => void (swipeFrom.current = null)}
      data-call-pill-bar=""
      data-call-pill-sharing={sharing ? '' : undefined}
    >
      <button type="button" onClick={expand} aria-label={translate(language, 'call.expand')} className="flex min-h-11 items-center gap-2 rounded-full px-2">
        {sharing ? <GlyphSvg glyph={CALL_SCREEN_GLYPHS.monitorArrowUp} size={18} /> : <span aria-hidden className="size-2 rounded-full" style={{ background: ANSWER }} />}
        {sharing ? (
          <span className="max-w-[12rem] truncate text-body font-semibold tabular-nums">{sharingCaption}</span>
        ) : (
          <>
            <span className="max-w-[9rem] truncate text-body font-semibold">{call.title}</span>
            <span className="text-mini tabular-nums" style={{ color: 'var(--color-on-media-3)' }}>
              {label}
            </span>
          </>
        )}
      </button>
      {sharing ? (
        <button
          type="button"
          onClick={callActions.toggleScreen}
          aria-label={translate(language, 'call.screen.stop')}
          className="min-h-11 whitespace-nowrap rounded-full px-4 text-body font-semibold"
          style={{ background: 'var(--color-media-hairline)' }}
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
