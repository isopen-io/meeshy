import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, SyntheticEvent } from 'react';

import type { ConversationsDeps } from '@/lib/api/conversations';
import { attachmentSrc } from '@/lib/api/media-url';
import type { Attachment } from '@/lib/api/types';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { flag } from '@/lib/languages';
import type { CarryProvider } from '@/lib/view/audio-carry-on-close';
import { spokenLanguageName } from '@/lib/view/language-name';
import { electAudio } from '@/lib/view/media';
import { formatMediaTime, keyboardSeekTarget, PLAYBACK_SPEEDS, SEEK_STEP_SECONDS, seekFraction, speedLabel } from '@/lib/view/media-transport';
import { waveformOf } from '@/lib/view/message';
import { karaokeSegments, karaokeTone, segmentSeekTarget, type KaraokeTone } from '@/lib/view/transcript-karaoke';
import { useKaraokeIndex } from '@/lib/view/use-karaoke';
import { useAudioOnDemand } from '@/lib/view/use-audio-on-demand';
import { useMediaPlayback } from '@/lib/view/use-media-playback';
import { takeVideoHandoff } from '@/lib/view/video-handoff';

import { Glyph, GlyphSvg } from './glyph';
import { MEDIA_GLYPHS } from './glyphs-media';
import { OnDemandNotice, TranscribeAction, TranslateOffers } from './viewer-audio-tools';

/**
 * LA PAGE AUDIO DE LA VISIONNEUSE (#8333) — miroir d'`AudioFullscreenPage`
 * (`apps/ios/Meeshy/Features/Main/Views/AudioFullscreenView.swift`) : l'onde,
 * les commandes (−10 s, lecture, +10 s), la position, la durée et la vitesse,
 * puis la transcription servie au Prisme du lecteur et la rangée des langues
 * où l'on choisit la version à écouter.
 *
 * UNE descente : `electAudio` rend le texte ET la piste ; la langue explorée
 * entre au rang 0 du prisme (`displayLanguage`), jamais une seconde boucle.
 * La lecture passe par le coordinateur partagé (`useMediaPlayback`) : un seul
 * média joue à la fois, et la consommation remonte comme depuis la bulle.
 *
 * Les commandes coupent leurs événements : un toucher n'y bascule pas le
 * plateau, un glissement n'y pagine pas, et Espace active le bouton sous le
 * focus au lieu du raccourci lecture/pause de la couche.
 */
export type ViewerAudioPageProps = {
  readonly attachment: Attachment;
  readonly isActive: boolean;
  readonly languages: readonly string[];
  readonly displayLanguage?: string;
  readonly fallbackLanguage: string;
  readonly language: InterfaceLanguage;
  readonly pageIndex: number;
  readonly pageCount: number;
  readonly onToggleRef: (toggle: (() => void) | null) => void;
  /**
   * LA LECTURE SURVIT À LA FERMETURE (#9256) — la page ACTIVE remet de quoi
   * reprendre son vocal (piste, seconde, vitesse) ; la visionneuse l'appelle
   * en se fermant et le confie au mini-lecteur. `null` : rien ne joue.
   */
  readonly onCarryRef?: (carry: CarryProvider | null) => void;
  readonly deps?: ConversationsDeps;
};

const WAVE_BARS = 48;
const PLAY_DISC_PX = 64;
const SKIP_DISC_PX = 48;
const COLUMN_MAX_PX = 560;
const TRANSCRIPT_MAX_PX = 168;

const KARAOKE_STYLE: Readonly<Record<KaraokeTone, CSSProperties>> = {
  idle: { opacity: 0.85 },
  upcoming: { opacity: 0.55 },
  past: { opacity: 0.85 },
  active: { opacity: 1, fontWeight: 700, color: 'var(--accent)' },
};

const contain = (event: SyntheticEvent): void => event.stopPropagation();

const containKeys = (event: ReactKeyboardEvent): void => {
  if (event.key === ' ' || event.key === 'Enter') event.stopPropagation();
};

const discStyle = (size: number, filled: boolean): CSSProperties => ({
  width: size,
  height: size,
  backgroundColor: filled ? 'color-mix(in srgb, var(--color-on-media) 20%, transparent)' : 'transparent',
});

const pillStyle = (selected: boolean): CSSProperties => ({
  minHeight: 44,
  backgroundColor: selected ? 'color-mix(in srgb, var(--accent) 70%, transparent)' : 'color-mix(in srgb, var(--color-on-media) 10%, transparent)',
  opacity: selected ? 1 : 0.8,
});

export default function ViewerAudioPage({
  attachment: received,
  isActive,
  languages,
  displayLanguage,
  fallbackLanguage,
  language,
  pageIndex,
  pageCount,
  onToggleRef,
  onCarryRef,
  deps,
}: ViewerAudioPageProps) {
  const [explored, setExplored] = useState<string | undefined>(displayLanguage);
  const onDemand = useAudioOnDemand({ attachment: received, fallbackLanguage, readerLanguages: languages, ...(deps !== undefined ? { deps } : {}) });
  const attachment = onDemand.served;
  const { versions } = onDemand;
  const [offering, setOffering] = useState(false);
  const { described, track } = electAudio({ attachment, readerLanguages: languages, displayLanguage: explored, fallbackLanguage });

  const [handedOffMs] = useState(() => takeVideoHandoff(attachment.id));
  const consumption = attachment.currentUserConsumption;
  const playback = useMediaPlayback({
    attachmentId: attachment.id,
    tracksTime: true,
    report: {
      kind: 'listened',
      language: track.language,
      ...(attachment.duration !== undefined ? { durationMs: attachment.duration } : {}),
      ...(handedOffMs !== null
        ? { resume: { positionMs: handedOffMs, complete: false } }
        : consumption != null
          ? { resume: { positionMs: consumption.lastPlayPositionMs, complete: consumption.listenedComplete } }
          : {}),
      ...(deps !== undefined ? { deps } : {}),
    },
  });
  const { status, progress, position, duration, toggle, bind, seek, rate, setRate } = playback;
  const isPlaying = status === 'playing';

  const statusRef = useRef(status);
  statusRef.current = status;
  const toggleRef = useRef(toggle);
  toggleRef.current = toggle;
  const playOnSwitchRef = useRef(false);

  useEffect(() => {
    if (isActive) {
      onToggleRef(() => toggleRef.current());
      if (statusRef.current !== 'playing') toggleRef.current();
    } else {
      if (statusRef.current === 'playing') toggleRef.current();
      onToggleRef(null);
    }
    return () => onToggleRef(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive]);

  useEffect(() => {
    if (!playOnSwitchRef.current || !isActive) return;
    playOnSwitchRef.current = false;
    toggleRef.current();
  }, [track.url, isActive]);

  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);
  const lastElementRef = useRef<HTMLAudioElement | null>(null);
  const bindAudio = useCallback(
    (element: HTMLAudioElement | null) => {
      bind(element);
      setAudioElement(element);
      if (element !== null) lastElementRef.current = element;
    },
    [bind],
  );

  /* La reprise se lit sur ce qui jouait au DERNIER rendu : la fermeture
     démonte la page sans la re-rendre, et l'élément peut déjà être arrêté. */
  const carryRef = useRef<CarryProvider>(() => null);
  carryRef.current = () => {
    const element = lastElementRef.current;
    if (statusRef.current !== 'playing' || element === null || track.url === '') return null;
    return { attachment, trackUrl: track.url, trackLanguage: track.language, positionMs: Math.round(element.currentTime * 1000), rate: element.playbackRate };
  };
  useEffect(() => {
    onCarryRef?.(isActive ? () => carryRef.current() : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive]);

  const declaredMs = track.durationMs ?? attachment.duration ?? 0;
  const totalSeconds = duration > 0 ? duration : declaredMs / 1000;
  const fraction = totalSeconds > 0 ? Math.max(progress, Math.min(1, position / totalSeconds)) : progress;
  const hasTranscript = attachment.transcription != null && described.text !== '';
  const segments = useMemo(
    () =>
      hasTranscript
        ? karaokeSegments({
            transcription: attachment.transcription,
            translations: attachment.translations,
            servedText: described.text,
            servedLanguage: described.language,
            trackLanguage: track.language,
            durationMs: totalSeconds * 1000,
          })
        : undefined,
    [hasTranscript, attachment.transcription, attachment.translations, described.text, described.language, track.language, totalSeconds],
  );
  const activeSegment = useKaraokeIndex(audioElement, segments, isPlaying);
  const waves = useMemo(() => waveformOf(attachment, WAVE_BARS), [attachment]);

  const seekAt = (event: ReactPointerEvent<HTMLElement>): void => {
    const box = event.currentTarget.getBoundingClientRect();
    seek(seekFraction({ clientX: event.clientX, left: box.left, width: box.width }) * totalSeconds);
  };

  const listenIn = (code: string): void => {
    if (code === track.language) return;
    playOnSwitchRef.current = true;
    setExplored(code);
  };

  const listenInRef = useRef(listenIn);
  listenInRef.current = listenIn;
  useEffect(() => {
    if (onDemand.arrived === null) return;
    setOffering(false);
    listenInRef.current(onDemand.arrived);
  }, [onDemand.arrived]);

  return (
    <div
      data-viewer-audio={attachment.id}
      data-viewer-audio-status={status}
      className="flex size-full flex-col items-center overflow-y-auto bg-media-backdrop text-on-media"
      style={{ padding: '16px 16px 24px' }}
    >
      <audio
        key={track.url}
        ref={bindAudio}
        preload="metadata"
        data-viewer-audio-track={track.language}
        className="hidden"
        {...(track.url === '' ? {} : { src: attachmentSrc(track.url) })}
      />

      <div className="flex w-full flex-1 flex-col justify-center gap-5" style={{ maxWidth: COLUMN_MAX_PX }}>
        <div className="flex items-center justify-center gap-2 text-mini tabular-nums opacity-70">
          {pageCount > 1 ? (
            <span data-viewer-audio-counter className="rounded-full bg-scrim px-3 py-1 font-semibold">
              {pageIndex + 1} / {pageCount}
            </span>
          ) : null}
        </div>

        <div
          aria-hidden
          data-viewer-audio-wave
          className="flex w-full cursor-pointer items-center gap-px"
          style={{ height: 72 }}
          onClick={contain}
          onPointerDown={(event) => {
            contain(event);
            event.currentTarget.setPointerCapture?.(event.pointerId);
            seekAt(event);
          }}
          onPointerMove={(event) => {
            contain(event);
            if (event.currentTarget.hasPointerCapture?.(event.pointerId) === true) seekAt(event);
          }}
          onPointerUp={contain}
        >
          {waves.map((height, index) => (
            <span
              key={index}
              className="flex-1 rounded-full"
              style={{
                height: `${Math.max(10, height * 4)}%`,
                backgroundColor: index / waves.length < fraction ? 'var(--accent)' : 'var(--color-on-media)',
                opacity: index / waves.length < fraction ? 1 : 0.35,
              }}
            />
          ))}
        </div>

        <div className="flex items-center justify-center gap-10" onClick={contain} onPointerDown={contain} onKeyDown={containKeys}>
          <button
            type="button"
            data-viewer-audio-skip="back"
            aria-label={translate(language, 'media.audio.skip_back')}
            className="relative grid place-items-center rounded-full text-mini font-bold tabular-nums"
            style={discStyle(SKIP_DISC_PX, false)}
            onClick={() => seek(Math.max(0, position - SEEK_STEP_SECONDS))}
          >
            −{SEEK_STEP_SECONDS}
          </button>
          <button
            type="button"
            data-viewer-audio-play
            aria-label={translate(language, isPlaying ? 'media.audio.pause' : 'media.audio.play')}
            className="grid place-items-center rounded-full"
            style={discStyle(PLAY_DISC_PX, true)}
            onClick={toggle}
          >
            {isPlaying ? <GlyphSvg glyph={MEDIA_GLYPHS.pause} size={28} /> : <Glyph name="fillPlay" size={28} />}
          </button>
          <button
            type="button"
            data-viewer-audio-skip="forward"
            aria-label={translate(language, 'media.audio.skip_forward')}
            className="relative grid place-items-center rounded-full text-mini font-bold tabular-nums"
            style={discStyle(SKIP_DISC_PX, false)}
            onClick={() => seek(Math.min(totalSeconds, position + SEEK_STEP_SECONDS))}
          >
            +{SEEK_STEP_SECONDS}
          </button>
        </div>

        <div className="flex flex-col gap-2" onClick={contain} onPointerDown={contain} onKeyDown={containKeys}>
          <span
            role="slider"
            tabIndex={0}
            aria-label={translate(language, 'media.audio.position')}
            aria-valuemin={0}
            aria-valuemax={Math.max(1, Math.round(totalSeconds))}
            aria-valuenow={Math.round(position)}
            aria-valuetext={`${formatMediaTime(position)} / ${formatMediaTime(totalSeconds)}`}
            className="relative block w-full cursor-pointer"
            style={{ height: 24 }}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture?.(event.pointerId);
              seekAt(event);
            }}
            onPointerMove={(event) => {
              if (event.currentTarget.hasPointerCapture?.(event.pointerId) === true) seekAt(event);
            }}
            onKeyDown={(event) => {
              const target = keyboardSeekTarget({ key: event.key, position, duration: totalSeconds });
              if (target === null) return;
              event.preventDefault();
              event.stopPropagation();
              seek(target);
            }}
          >
            <span className="absolute inset-x-0 rounded-full" style={{ top: 10, height: 4, backgroundColor: 'color-mix(in srgb, var(--color-on-media) 25%, transparent)' }} />
            <span className="absolute start-0 rounded-full" style={{ top: 10, height: 4, width: `${fraction * 100}%`, backgroundColor: 'var(--accent)' }} />
            <span
              className="absolute rounded-full bg-on-media"
              style={{ top: 4, width: 16, height: 16, insetInlineStart: `calc(${fraction * 100}% - 8px)` }}
            />
          </span>
          <div className="flex justify-between text-mini font-semibold tabular-nums opacity-70">
            <span data-viewer-audio-position>{formatMediaTime(position)}</span>
            <span data-viewer-audio-duration>{formatMediaTime(totalSeconds)}</span>
          </div>
          <div className="flex flex-wrap justify-center gap-2" role="group" aria-label={translate(language, 'media.audio.speed')}>
            {PLAYBACK_SPEEDS.map((speed) => (
              <button
                key={speed}
                type="button"
                data-viewer-audio-speed={speed}
                aria-pressed={rate === speed}
                className="rounded-full px-3 text-mini font-bold tabular-nums"
                style={pillStyle(rate === speed)}
                onClick={() => setRate(speed)}
              >
                {speedLabel(speed, language)}
              </button>
            ))}
          </div>
        </div>

        {hasTranscript ? (
          <p
            data-viewer-audio-transcript
            className="overflow-y-auto text-body"
            style={{ maxHeight: TRANSCRIPT_MAX_PX }}
            onClick={contain}
            {...(described.language !== '' ? { lang: described.language } : {})}
          >
            {segments === undefined
              ? described.text
              : segments.map((segment, index) => (
                  <Fragment key={`${segment.startMs}-${index}`}>
                    <span
                      data-karaoke={karaokeTone(index, activeSegment)}
                      className="cursor-pointer"
                      style={KARAOKE_STYLE[karaokeTone(index, activeSegment)]}
                      onClick={() => {
                        const target = segmentSeekTarget(segments, index);
                        if (target !== null) seek(target);
                      }}
                    >
                      {segment.text}
                    </span>
                    {index < segments.length - 1 ? ' ' : null}
                  </Fragment>
                ))}
          </p>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <p data-viewer-audio-transcript-empty className="text-center text-mini opacity-60">
              {translate(language, 'media.audio.transcript_empty')}
            </p>
            <TranscribeAction language={language} busy={onDemand.transcribing} onTranscribe={onDemand.transcribe} />
          </div>
        )}

        {versions.length > 1 ? (
          <div
            role="group"
            aria-label={translate(language, 'media.audio.languages')}
            className="flex flex-wrap justify-center gap-2"
            onClick={contain}
            onPointerDown={contain}
            onKeyDown={containKeys}
          >
            {versions.map((code) => (
              <button
                key={code}
                type="button"
                lang={code}
                data-viewer-audio-language={code}
                aria-pressed={code === track.language}
                className="flex items-center gap-1 rounded-full px-3 text-mini font-semibold"
                style={pillStyle(code === track.language)}
                onClick={() => listenIn(code)}
              >
                <span aria-hidden>{flag(code)}</span>
                <span>{spokenLanguageName(code)}</span>
              </button>
            ))}
          </div>
        ) : null}

        <TranslateOffers
          language={language}
          offers={onDemand.offers}
          pending={onDemand.pendingLanguages}
          expanded={offering}
          onToggle={() => setOffering((open) => !open)}
          onRequest={onDemand.requestTranslation}
        />
        <OnDemandNotice language={language} notice={onDemand.notice} />
      </div>
    </div>
  );
}
