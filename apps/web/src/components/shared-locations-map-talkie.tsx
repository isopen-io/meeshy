import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useStore } from 'zustand/react';

import { watchRealtime, type WatchRealtime } from '@/lib/api/watch-realtime';
import { translateCircles } from '@/lib/i18n-circles-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { createTalkieCapture, talkieEncodingSupportedOnce } from '@/lib/talkie/talkie-encoder';
import type { TalkieCaptureFactory, TalkiePressMode, TalkieSendOutcome, TalkieVoiceCopier } from '@/lib/talkie/talkie-sender';
import { talkieOutcomeNotice, useTalkieSender } from '@/routes/user-profile-talkie';

import type { SharedLocationsMapTalkie } from './shared-locations-map-view';
import { ThreadHeaderNotice, useTransientNotice } from './thread-header-notice';

/**
 * **LE TALKIE DE LA CARTE DES CERCLES** (#19888, iso iOS #19885 : `NearbyMapScreen` tient un `TalkieSender`) — UN
 * émetteur pour toute la carte, que chaque épingle d'un Proche ou d'un Sang emprunte le temps d'un appui long.
 *
 * - Là où le navigateur n'encode pas l'AAC, aucune épingle ne propose la voix (comme la fiche et l'en-tête).
 * - `TALKIE_NOT_ALLOWED` : la personne n'est plus proposée, sans rien dire ; le serveur rejuge à chaque appui.
 * - Le réveil d'un hors-ligne et les issues se disent dans le bandeau neutre, puis s'effacent ; un repli vers le
 *   message vocal est une INFORMATION, jamais une erreur.
 */
export function useSharedLocationsMapTalkie({
  language,
  watch = watchRealtime,
  capture = createTalkieCapture(),
  supported = talkieEncodingSupportedOnce,
  copier,
}: {
  readonly language: InterfaceLanguage;
  readonly watch?: WatchRealtime;
  readonly capture?: TalkieCaptureFactory;
  readonly supported?: () => Promise<boolean>;
  readonly copier?: TalkieVoiceCopier;
}): {
  readonly talkie: SharedLocationsMapTalkie | undefined;
  /** Le bandeau : « Réveil de X… » tant que la voix réveille X, sinon l'issue du dernier appui. */
  readonly banner: (nameOf: (userId: string) => string) => ReactNode;
} {
  const [encodes, setEncodes] = useState(false);
  const [refused, setRefused] = useState<ReadonlySet<string>>(() => new Set());
  const [notice, announce] = useTransientNotice();
  const captureRef = useRef(capture);
  const pressed = useRef<{ readonly userId: string; readonly mode: TalkiePressMode } | null>(null);

  useEffect(() => {
    let live = true;
    void supported().then((value) => {
      if (live) setEncodes(value);
    });
    return () => {
      live = false;
    };
  }, [supported]);

  const onOutcome = (outcome: TalkieSendOutcome): void => {
    const last = pressed.current;
    if (outcome === 'not-allowed') {
      if (last !== null) setRefused((current) => new Set([...current, last.userId]));
      return;
    }
    announce(translateCircles(language, talkieOutcomeNotice(outcome, last?.mode ?? 'talkie')));
  };
  const sender = useTalkieSender({ watch, capture: captureRef.current, onOutcome, language, ...(copier === undefined ? {} : { copier }) });
  const waking = useStore(sender.store, (state) => (state.phase.kind === 'talking' && state.phase.delivery === 'waking' ? state.phase.toUserId : null));

  const talkie: SharedLocationsMapTalkie | undefined = encodes
    ? {
        press: (userId, mode) => {
          pressed.current = { userId, mode };
          sender.press(userId, { mode });
        },
        release: () => void sender.release(),
        offers: (userId) => !refused.has(userId),
      }
    : undefined;
  const banner = (nameOf: (userId: string) => string): ReactNode => {
    const text = waking !== null ? translateCircles(language, 'talkie.send.waking', { name: nameOf(waking) }) : notice;
    return text === null ? null : <ThreadHeaderNotice text={text} marker="map-talkie" />;
  };
  return { talkie, banner };
}
