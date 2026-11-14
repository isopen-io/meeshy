import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useStore } from 'zustand/react';

import { apiDeps } from '@/lib/api/deps';
import { appQueryClient } from '@/lib/api/query-client';
import { relationLinksQueryOptions, type RelationDeps } from '@/lib/api/relations';
import { watchRealtime, type WatchRealtime } from '@/lib/api/watch-realtime';
import { translateCircles } from '@/lib/i18n-circles-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { createTalkieCapture, talkieEncodingSupportedOnce } from '@/lib/talkie/talkie-encoder';
import { resolveTalkieHeaderDelivery, resolveTalkieHeaderVoice } from '@/lib/talkie/talkie-header-law';
import { talkieStore, type TalkieStoreApi } from '@/lib/talkie/talkie-live';
import type { TalkieCaptureFactory, TalkieSendOutcome, TalkieVoiceCopier } from '@/lib/talkie/talkie-sender';
import { useCirclesCatalog } from '@/lib/use-circles-catalog';
import { talkieHoldHandlers, talkieOfferedAt, TALKIE_OUTCOME_NOTICE, useTalkieSender } from '@/routes/user-profile-talkie';

import { CHROME_ACTION_HIT_CLASS } from './chrome-action';
import { GlyphSvg } from './glyph';
import { FEED_GLYPHS } from './glyphs-feed';
import { talkieAnnouncement, THREAD_TALKIE_REST, type ThreadTalkieLive } from './talkie-header-band';
import { ThreadHeaderNotice, useTransientNotice } from './thread-header-notice';

export { TalkieHeaderBand, talkieAnnouncement, THREAD_TALKIE_REST, type ThreadTalkieLive } from './talkie-header-band';

/**
 * **LE TALKIE DANS L'EN-TÊTE D'UN DIRECT** (#17338, jumelle web de #17337 —
 * iOS `ConversationHeaderTalkieButton`) : à gauche de l'appel, proposé dès
 * Proche (même cache que la fiche), jamais dans un direct chiffré ni dans un
 * aperçu (`threadHeaderTalkiePeer`). On MAINTIENT, on parle, on relâche.
 *
 * - La voix qui part, ou celle du pair qui arrive, est remontée à l'en-tête
 *   (`onLive`) qui donne alors toute la barre au talkie. Une voix qui arrive s'y
 *   montre même quand le talkie n'est pas proposé dans ce sens.
 * - `TALKIE_NOT_ALLOWED` retire le bouton, sans rien dire, comme sur la fiche.
 * - L'en-tête n'a pas de place pour une phrase : le réveil d'un pair hors ligne
 *   et les issues se disent dans un bandeau neutre posé sous la barre.
 * - Le (i) du talkie ne vit que sur la fiche.
 */

function useEncodes(supported: () => Promise<boolean>): boolean | null {
  const [encodes, setEncodes] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    void supported().then((value) => {
      if (live) setEncodes(value);
    });
    return () => {
      live = false;
    };
  }, [supported]);
  return encodes;
}

export function ThreadHeaderTalkie({
  language,
  peerId,
  peerName,
  secondary,
  onLive,
  deps = apiDeps,
  watch = watchRealtime,
  capture = createTalkieCapture(),
  supported = talkieEncodingSupportedOnce,
  store = talkieStore,
  copier,
}: {
  readonly language: InterfaceLanguage;
  readonly peerId: string;
  readonly peerName: string;
  /** La couleur secondaire de la conversation : le bouton enfoncé prend le dégradé accent → secondaire. */
  readonly secondary: string;
  readonly onLive: (live: ThreadTalkieLive) => void;
  readonly deps?: RelationDeps;
  readonly watch?: WatchRealtime;
  readonly capture?: TalkieCaptureFactory;
  readonly supported?: () => Promise<boolean>;
  readonly store?: TalkieStoreApi;
  readonly copier?: TalkieVoiceCopier;
}) {
  const ready = useCirclesCatalog(language);
  const links = useQuery(relationLinksQueryOptions(deps), appQueryClient);
  const level = links.data?.find((candidate) => candidate.userId === peerId)?.effectiveLevel ?? null;
  const encodes = useEncodes(supported);
  const [refused, setRefused] = useState(false);
  const [notice, announceNotice] = useTransientNotice();
  const captureRef = useRef(capture);

  const onOutcome = (outcome: TalkieSendOutcome): void => {
    if (outcome === 'not-allowed') return setRefused(true);
    announceNotice(translateCircles(language, TALKIE_OUTCOME_NOTICE[outcome]));
  };
  const sender = useTalkieSender({ watch, capture: captureRef.current, onOutcome, language, ...(copier === undefined ? {} : { copier }) });
  const phase = useStore(sender.store, (state) => state.phase.kind);
  const waking = useStore(sender.store, (state) => state.phase.kind === 'talking' && state.phase.delivery === 'waking');
  const peerSpeaking = useStore(store, (state) => state.active.some((entry) => entry.fromUserId === peerId));
  const voice = resolveTalkieHeaderVoice({ phase, peerSpeaking });
  const delivery = resolveTalkieHeaderDelivery({ voice, phase, waking });

  const onLiveRef = useRef(onLive);
  onLiveRef.current = onLive;
  useEffect(() => {
    onLiveRef.current({ voice, delivery });
  }, [voice, delivery]);
  useEffect(() => () => onLiveRef.current(THREAD_TALKIE_REST), []);

  if (!ready) return null;
  const offered = encodes === true && !refused && talkieOfferedAt(level);
  const pressed = phase !== 'idle';
  const banner = waking ? translateCircles(language, 'talkie.send.waking', { name: peerName }) : notice;
  return (
    <>
      {offered ? (
        <button
          type="button"
          data-thread-talkie=""
          aria-pressed={pressed}
          aria-label={translateCircles(language, 'talkie.send.hold.a11y', { name: peerName })}
          {...talkieHoldHandlers({ onPress: () => sender.press(peerId), onRelease: () => void sender.release() })}
          className={`${CHROME_ACTION_HIT_CLASS} select-none focus-visible:outline-2 focus-visible:outline-offset-2`}
          style={{ color: 'var(--accent)', outlineColor: 'var(--accent)', touchAction: 'none', WebkitTouchCallout: 'none' }}
        >
          <span
            data-chrome-disc=""
            className="grid place-items-center rounded-chip transition-[background,transform] duration-150"
            style={{
              width: 'var(--size-header-circle)',
              height: 'var(--size-header-circle)',
              color: pressed ? '#fff' : 'var(--accent)',
              background: pressed
                ? `linear-gradient(135deg, var(--accent), ${secondary})`
                : 'color-mix(in srgb, currentColor 18%, transparent)',
              transform: pressed ? 'scale(0.92)' : undefined,
            }}
          >
            <GlyphSvg glyph={FEED_GLYPHS.waveform} size={13} />
          </span>
        </button>
      ) : null}
      <span data-thread-talkie-announce="" role="status" aria-live="polite" className="sr-only">
        {talkieAnnouncement(language, { voice, delivery })}
      </span>
      {banner === null ? null : <ThreadHeaderNotice text={banner} marker="talkie" />}
    </>
  );
}
