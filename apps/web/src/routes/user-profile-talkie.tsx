import { useQuery } from '@tanstack/react-query';
import { memo, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { useStore } from 'zustand/react';

import { apiDeps } from '@/lib/api/deps';
import { appQueryClient } from '@/lib/api/query-client';
import { relationLinksQueryOptions, type RelationDeps } from '@/lib/api/relations';
import { watchRealtime, type WatchRealtime } from '@/lib/api/watch-realtime';
import type { PersonSummary } from '@/lib/api/friend-requests';
import { translateCircles, type CirclesCatalogKey } from '@/lib/i18n-circles-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import type { SocketClient } from '@/lib/net/socket';
import { createTalkieCapture, talkieEncodingSupportedOnce } from '@/lib/talkie/talkie-encoder';
import { bindTalkieSender, createTalkieSender, type TalkieCaptureFactory, type TalkieSendOutcome, type TalkieSendPhase, type TalkieVoiceCopier } from '@/lib/talkie/talkie-sender';
import { createTalkieVoiceCopier } from '@/lib/talkie/talkie-voice-copy';
import { useCirclesCatalog } from '@/lib/use-circles-catalog';

import { BRAND, BRAND_FILL, FOCUS, INK_2 } from './user-profile-style';

/**
 * **PARLER EN TALKIE DEPUIS LA FICHE D'UN PROCHE** (#16641, sous-lot
 * `proche-talkie@web`) — on MAINTIENT, on parle, on relâche : la voix sort chez
 * l'autre sans qu'il ait à décrocher (D-4, ouvert dès Proche, CAL-03).
 *
 * - **Présent dès Proche** : le niveau vient du MÊME cache que la ligne du cercle
 *   (`GET /relations`). Sous Proche, rien. Le serveur rejuge à chaque appui ; un
 *   `TALKIE_NOT_ALLOWED` retire le bouton (ni grisé, ni raison).
 * - **Là où le navigateur n'encode pas l'AAC** : pas de bouton qui échoue, une
 *   phrase qui propose le message vocal.
 * - **Un geste** : pointeur maintenu (souris, doigt, stylet) ou barre d'espace /
 *   Entrée maintenue au clavier. Relâcher, quitter le bouton ou perdre le focus
 *   termine la prise de parole.
 * - **Les refus se disent sans fuite** : un blocage et un repli rendent la même
 *   INFORMATION, jamais une erreur (précision porteur 2026-11-08, #17141) : la
 *   personne n'est pas disponible pour un accès d'urgence, un message part dans
 *   la conversation la plus récente avec elle.
 * - **Réveil** (#17144) : un destinataire hors ligne mais joignable par push —
 *   « Réveil de X… » tant que l'on parle.
 * - **Le (i)** dit à qui le talkie est destiné et quand s'en servir.
 */

const LEVELS_WITH_TALKIE: ReadonlySet<string> = new Set(['CLOSE', 'BLOOD']);

/** Le talkie est proposé dès Proche (D-4, CAL-03) : la fiche et l'en-tête d'un direct lisent la même règle. */
export const talkieOfferedAt = (level: string | null | undefined): boolean => level != null && LEVELS_WITH_TALKIE.has(level);

export const TALKIE_OUTCOME_NOTICE = {
  voice: 'talkie.send.voice',
  e2ee: 'talkie.send.e2ee',
  'rate-limited': 'talkie.send.rateLimited',
  offline: 'talkie.send.offline',
  failed: 'talkie.send.failed',
  'mic-denied': 'talkie.send.micDenied',
  limit: 'talkie.send.limit',
} as const satisfies Readonly<Record<Exclude<TalkieSendOutcome, 'not-allowed'>, CirclesCatalogKey>>;

const HOLD_KEYS: ReadonlySet<string> = new Set([' ', 'Enter']);

/**
 * Maintenir pour parler, partagé par la fiche et l'en-tête d'un direct : pointeur maintenu (souris, doigt, stylet) ou
 * Espace / Entrée maintenue ; relâcher, quitter le bouton ou perdre le focus termine.
 */
export function talkieHoldHandlers({ onPress, onRelease }: { readonly onPress: () => void; readonly onRelease: () => void }) {
  return {
    onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
      event.currentTarget.setPointerCapture?.(event.pointerId);
      onPress();
    },
    onPointerUp: onRelease,
    onPointerCancel: onRelease,
    onLostPointerCapture: onRelease,
    onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => {
      if (!HOLD_KEYS.has(event.key)) return;
      event.preventDefault();
      if (!event.repeat) onPress();
    },
    onKeyUp: (event: KeyboardEvent<HTMLButtonElement>) => {
      if (!HOLD_KEYS.has(event.key)) return;
      event.preventDefault();
      onRelease();
    },
    onBlur: onRelease,
    onContextMenu: (event: { preventDefault(): void }) => event.preventDefault(),
  };
}

export const ProfileTalkieRowView = memo(function ProfileTalkieRowView({
  language,
  name,
  supported,
  phase,
  waking = false,
  onPress,
  onRelease,
}: {
  readonly language: InterfaceLanguage;
  readonly name: string;
  readonly supported: boolean;
  readonly phase: TalkieSendPhase['kind'];
  readonly waking?: boolean;
  readonly onPress: () => void;
  readonly onRelease: () => void;
}) {
  const [info, setInfo] = useState(false);
  if (!supported) {
    return (
      <p data-talkie-unsupported="" className="rounded-card px-3.5 py-3 text-caption" style={{ color: INK_2, backgroundColor: BRAND_FILL }}>
        {translateCircles(language, 'talkie.send.unsupported')}
      </p>
    );
  }
  const live = phase !== 'idle';
  const label =
    phase === 'recording-copy'
      ? translateCircles(language, 'talkie.header.announce.recorded')
      : phase === 'talking'
      ? translateCircles(language, waking ? 'talkie.send.waking' : 'talkie.send.talking', { name })
      : phase === 'starting' ? translateCircles(language, 'talkie.send.connecting') : translateCircles(language, 'talkie.send.hold');
  return (
    <div data-talkie-row="" className="grid gap-2 rounded-card px-3.5 py-3" style={{ backgroundColor: BRAND_FILL }}>
      <div className="flex items-start gap-2">
        <p className="flex-1 text-caption" style={{ color: INK_2 }}>
          {translateCircles(language, 'talkie.send.explain', { name })}
        </p>
        <button
          type="button"
          data-talkie-info=""
          aria-expanded={info}
          aria-controls="talkie-info"
          aria-label={translateCircles(language, 'talkie.send.info.a11y')}
          onClick={() => setInfo((open) => !open)}
          className={`grid shrink-0 place-items-center rounded-full text-body font-bold ${FOCUS}`}
          style={{ width: 48, height: 48, color: BRAND, outlineColor: BRAND }}
        >
          <span aria-hidden="true">ⓘ</span>
        </button>
      </div>
      {info ? (
        <p id="talkie-info" data-talkie-info-text="" className="text-caption" style={{ color: INK_2 }}>
          {translateCircles(language, 'talkie.send.info')}
        </p>
      ) : null}
      <button
        type="button"
        data-talkie-send=""
        aria-pressed={live}
        aria-label={translateCircles(language, 'talkie.send.hold.a11y', { name })}
        {...talkieHoldHandlers({ onPress, onRelease })}
        className={`grid select-none place-items-center rounded-chip px-4 text-body font-bold ${FOCUS}`}
        style={{
          minHeight: 52,
          touchAction: 'none',
          color: live ? 'var(--color-on-state)' : BRAND,
          backgroundColor: live ? BRAND : 'transparent',
          border: `1.5px solid ${BRAND}`,
          outlineColor: BRAND,
        }}
      >
        <span>
          <span aria-hidden="true" className={live && phase !== 'starting' ? 'motion-safe:animate-pulse' : undefined}>
            🎙️{' '}
          </span>
          {label}
        </span>
      </button>
      {live ? (
        <span role="status" className="sr-only">
          {label}
        </span>
      ) : null}
    </div>
  );
});

/** La copie vocale vivante (#16698) : passerelle de l'application, langue de l'interface prêtée à la voix. */
export const liveTalkieCopier = (language: () => string): TalkieVoiceCopier => createTalkieVoiceCopier({ deps: apiDeps, language });

export function useTalkieSender({
  watch,
  capture,
  onOutcome,
  language,
  copier,
}: {
  readonly watch: WatchRealtime;
  readonly capture: TalkieCaptureFactory;
  readonly onOutcome: (outcome: TalkieSendOutcome) => void;
  readonly language: InterfaceLanguage;
  /** Un talkie qui n'est pas entendu part en message vocal (#16698) ; par défaut, le copieur vivant. */
  readonly copier?: TalkieVoiceCopier;
}) {
  const socketRef = useRef<SocketClient | null>(null);
  const outcomeRef = useRef(onOutcome);
  outcomeRef.current = onOutcome;
  const languageRef = useRef(language);
  languageRef.current = language;
  const copierRef = useRef(copier ?? liveTalkieCopier(() => languageRef.current));
  const sender = useMemo(
    () => createTalkieSender({ socket: () => socketRef.current, capture, onOutcome: (outcome) => outcomeRef.current(outcome), copier: (copy) => copierRef.current(copy) }),
    [capture],
  );
  useEffect(
    () =>
      watch((socket) => {
        socketRef.current = socket;
        const unbind = bindTalkieSender({ socket, sender });
        return () => {
          unbind();
          if (socketRef.current === socket) socketRef.current = null;
        };
      }),
    [watch, sender],
  );
  useEffect(() => () => void sender.release(), [sender]);
  return sender;
}

export function ProfileTalkieRow({
  language,
  person,
  onNotice,
  deps = apiDeps,
  watch = watchRealtime,
  capture = createTalkieCapture(),
  supported = talkieEncodingSupportedOnce,
  copier,
}: {
  readonly language: InterfaceLanguage;
  readonly person: PersonSummary;
  /** `failed` : vrai pour un échec ; un repli vers le message vocal est une INFORMATION, jamais une erreur. */
  readonly onNotice: (message: string, failed: boolean) => void;
  readonly deps?: RelationDeps;
  readonly watch?: WatchRealtime;
  readonly capture?: TalkieCaptureFactory;
  readonly supported?: () => Promise<boolean>;
  readonly copier?: TalkieVoiceCopier;
}) {
  const ready = useCirclesCatalog(language);
  const links = useQuery(relationLinksQueryOptions(deps), appQueryClient);
  const level = links.data?.find((candidate) => candidate.userId === person.id)?.effectiveLevel ?? null;
  const [encodes, setEncodes] = useState<boolean | null>(null);
  const [refused, setRefused] = useState(false);
  const captureRef = useRef(capture);

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
    if (outcome === 'not-allowed') return setRefused(true);
    onNotice(translateCircles(language, TALKIE_OUTCOME_NOTICE[outcome]), outcome !== 'voice');
  };
  const sender = useTalkieSender({ watch, capture: captureRef.current, onOutcome, language, ...(copier === undefined ? {} : { copier }) });
  const phase = useStore(sender.store, (state) => state.phase.kind);
  const waking = useStore(sender.store, (state) => state.phase.kind === 'talking' && state.phase.delivery === 'waking');

  if (!ready || encodes === null || refused || !talkieOfferedAt(level)) return null;
  const name = person.displayName ?? person.username;
  return (
    <ProfileTalkieRowView
      language={language}
      name={name}
      supported={encodes}
      phase={phase}
      waking={waking}
      onPress={() => sender.press(person.id)}
      onRelease={() => void sender.release()}
    />
  );
}
