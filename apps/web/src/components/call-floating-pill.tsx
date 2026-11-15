import { useEffect, useId, useRef, useState, type PointerEvent } from 'react';

import { useStore } from 'zustand/react';

import { Glyph, GlyphSvg } from '@/components/glyph';
import { CALL_DEVICES_GLYPHS } from '@/components/glyphs-call-devices';
import { CALL_SCREEN_GLYPHS } from '@/components/glyphs-call-screen';
import { meeshyGlassRecipe } from '@/components/kit/meeshy-glass-tone';
import { callActions } from '@/lib/calls/call-actions';
import { pillSwipeOutcome } from '@/lib/calls/call-bubble';
import { reducedTitle } from '@/lib/calls/call-header';
import { cachedCallNames } from '@/lib/calls/call-header-names';
import { pipOpenStore } from '@/lib/calls/call-pip';
import { reducedColorKey, reducedLabel } from '@/lib/calls/call-reduced';
import { peerColor } from '@/lib/calls/call-speaker-color';
import { elapsedSeconds, formatCallClock, type ActiveCall } from '@/lib/calls/call-store';
import { LEAVING, useFormSwap, useViewMotion, type ViewMotion } from '@/lib/calls/use-pill-motion';
import { callStatusKey } from '@/lib/calls/call-view';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';

/**
 * **LA PASTILLE DE L'APPEL RÉDUIT** (#6382, #8046, #16664 ; `FloatingCallPillView.swift`) —
 * durée ou état, micro, replier en bulle, raccrocher, toucher pour revenir ; « Arrêter »
 * quand je partage mon écran. Elle ne se montre qu'une fois l'appel réduit : son chunk à
 * lui (`budgets.json` › `call_floating_pill`), que l'écran d'appel charge dès que l'appel
 * vit (`call-screen.tsx`), si bien que réduire ne l'attend pas et que `call_overlay` ne
 * le paie pas.
 *
 * #18223 (P18.2, P18.3, S1.2, S1.8, loi 18.1 ; iOS #18464, Android #18449) — le verre du kit, le liseré à
 * la couleur de l'autre, UNE étiquette « nom · durée » (le nom seul avant l'établissement, la phase dite
 * par la pastille et au lecteur d'écran), « Arrêter » en capsule blanche à encre rouge, et ce que le
 * lecteur d'écran en dit : l'appel en cours, la personne et la durée vivante. La FORME (capsule et ses
 * commandes, ou vignette portrait de P18) attend la décision porteur #17731 : elle n'est pas touchée.
 */

/* La matière de la pastille ordinaire : le verre du kit (loi 18.1), celui des capsules d'enregistrement ; mon partage la remplace par le verre rouge du kit (S1.9) — jamais les deux sur le même élément. */
const PILL_GLASS = meeshyGlassRecipe({ tone: 'deep', density: 'dense' });
const SHARING_SURFACE = 'glass-call-danger';
const HANGUP = 'var(--ios-error-strong)';
const RING_WIDTH = 2;

/** La pastille d'état : établi, vert ; sonnerie ou connexion, ambre ; rupture, rouge — le glyphe d'état d'iOS (`CallPillStatus`). */
const PHASE_DOT: Readonly<Record<string, string>> = { connected: 'var(--ios-success)', reconnecting: HANGUP };
const WAITING_DOT = 'var(--ios-warning)';

/** P18.9 — pendant l'image dans l'image du navigateur, l'appel vit dans sa fenêtre : la capsule s'efface (comme la bulle). */
export function CallPill({ call, motion }: { readonly call: ActiveCall; readonly motion?: ViewMotion | undefined }) {
  const away = useStore(pipOpenStore, (state) => state.open);
  return <CallPillBar call={call} away={away} motion={motion} />;
}

function useSecondTick(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const handle = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(handle);
  }, []);
  return now;
}

type PillText = { readonly label: string; readonly spoken: string; readonly clock: string | null };

/** P18.3 — l'étiquette unique ; S1.8 — ce que le lecteur d'écran en dit : « Appel en cours — Awa » (la phase avant l'établissement) et la durée. */
function pillText(call: ActiveCall, language: InterfaceLanguage, now: number): PillText {
  const statusKey = callStatusKey(call);
  const names = cachedCallNames(call);
  const title = reducedTitle({ givenName: names.givenName, groupName: names.groupName, displayName: call.title });
  const status = translate(language, statusKey ?? 'call.bubble.ongoing');
  const clock = statusKey === null ? formatCallClock(elapsedSeconds(call, now)) : null;
  return {
    label: reducedLabel({ title, duration: clock ?? '', connected: clock !== null, unknown: status }),
    spoken: title === null ? status : `${status} — ${title}`,
    clock,
  };
}

function PillIdentity({ call, text, sharing }: { readonly call: ActiveCall; readonly text: PillText; readonly sharing: boolean }) {
  return (
    <>
      {sharing ? (
        <GlyphSvg glyph={CALL_SCREEN_GLYPHS.monitorArrowUp} size={18} />
      ) : (
        <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: PHASE_DOT[call.phase.kind] ?? WAITING_DOT }} data-call-pill-phase={call.phase.kind} />
      )}
      <span aria-hidden className="max-w-[12rem] truncate text-body font-semibold tabular-nums" data-call-pill-label="">
        {text.label}
      </span>
    </>
  );
}

/** Pendant mon partage, « Arrêter » ; sinon le micro, la bulle et raccrocher — la forme que #17731 tranchera, gardée telle quelle. */
function PillControls({ call, sharing, language }: { readonly call: ActiveCall; readonly sharing: boolean; readonly language: InterfaceLanguage }) {
  if (sharing)
    return (
      <button
        type="button"
        onClick={callActions.toggleScreen}
        aria-label={translate(language, 'call.screen.stop')}
        className="min-h-11 shrink-0 whitespace-nowrap rounded-full px-4 text-body font-bold"
        style={{ background: 'var(--color-on-media)', color: 'var(--ios-error-dark)' }}
        data-call-pill-stop-share=""
      >
        {translate(language, 'call.screen.stopShort')}
      </button>
    );
  return (
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
  );
}

/** Le glissé horizontal replie la capsule en bulle, hors partage (P18.10) ; il n'est jamais le toucher qui rouvre l'appel. */
function usePillSwipe(sharing: boolean) {
  const swipeFrom = useRef<number | null>(null);
  const swiped = useRef(false);
  return {
    onPointerDown: (event: PointerEvent<HTMLDivElement>) => {
      swipeFrom.current = event.clientX;
      swiped.current = false;
    },
    onPointerUp: (event: PointerEvent<HTMLDivElement>) => {
      const from = swipeFrom.current;
      swipeFrom.current = null;
      const outcome = from === null ? 'tap' : pillSwipeOutcome({ travelled: event.clientX - from, sharing });
      if (outcome === 'tap') return;
      swiped.current = true;
      if (outcome === 'collapse') callActions.collapse();
    },
    onPointerCancel: () => void (swipeFrom.current = null),
    expand: () => {
      if (swiped.current) {
        swiped.current = false;
        return;
      }
      callActions.expand();
    },
  };
}

export function CallPillBar({ call, away, motion }: { readonly call: ActiveCall; readonly away: boolean; readonly motion?: ViewMotion | undefined }) {
  const language = currentInterfaceLanguage();
  const text = pillText(call, language, useSecondTick());
  const sharing = call.screenSharing;
  const ids = useId();
  const colorKey = sharing ? null : reducedColorKey({ peerId: call.peerKey, peerName: call.title });
  const bar = useRef<HTMLDivElement>(null);
  useViewMotion(bar, motion);
  useFormSwap(bar, sharing);
  const { expand, ...swipe } = usePillSwipe(sharing);
  return (
    <div
      ref={bar}
      className={`fixed left-1/2 z-[190] flex -translate-x-1/2 items-center gap-1 rounded-full py-1 ps-1 pe-1 ${sharing ? SHARING_SURFACE : PILL_GLASS.className}`}
      {...(sharing ? {} : PILL_GLASS.attributes)}
      style={{ color: 'var(--color-on-media)', top: 'calc(env(safe-area-inset-top) + 0.5rem)', touchAction: 'pan-y', opacity: away ? 0 : 1, transition: 'opacity 200ms ease-out' }}
      aria-hidden={away ? true : undefined}
      inert={away}
      {...swipe}
      data-call-pill-bar=""
      data-call-pill-sharing={sharing ? '' : undefined}
      {...(motion?.leaving ? LEAVING : {})}
    >
      {colorKey === null ? null : <span aria-hidden className="pointer-events-none absolute inset-0 rounded-full" style={{ boxShadow: `inset 0 0 0 ${RING_WIDTH}px ${peerColor(call)}` }} data-call-pill-ring="" />}
      <button
        type="button"
        onClick={expand}
        aria-label={translate(language, 'call.expand')}
        aria-describedby={text.clock === null ? `${ids}s` : `${ids}s ${ids}c`}
        className="flex min-h-11 min-w-0 items-center gap-2 rounded-full px-2"
        data-call-pill-expand=""
      >
        <PillIdentity call={call} text={text} sharing={sharing} />
      </button>
      <span id={`${ids}s`} className="sr-only" data-call-pill-spoken="">
        {text.spoken}
      </span>
      {text.clock === null ? null : (
        <span id={`${ids}c`} role="timer" className="sr-only" data-call-pill-clock="">
          {text.clock}
        </span>
      )}
      <PillControls call={call} sharing={sharing} language={language} />
    </div>
  );
}
