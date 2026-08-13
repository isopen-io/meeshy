/**
 * CALL TRANSCRIPT PANEL
 *
 * Panneau journalisé de la transcription d'appel : une ligne
 * `displayName (heure): message` par segment final, avec le tag de la langue
 * de transcription (et celui de la traduction quand elle est affichée).
 * Pure présentation — l'accumulation/fusion inter-transports (data channel
 * WebRTC P2P + relais serveur traduit) vit dans useCallTranscriptJournal.
 * Prisme : le texte traduit s'affiche comme contenu natif (par défaut),
 * l'original reste accessible ; le badge de langue est l'indicateur discret.
 */

'use client';

import React, { memo, useEffect, useRef } from 'react';
import { useI18n } from '@/hooks/useI18n';
import { formatCallTranscriptLine, type CallTranscriptJournalEntry } from '@meeshy/shared/utils/call-transcript';

export interface CallTranscriptPanelProps {
  entries: readonly CallTranscriptJournalEntry[];
  /**
   * Résout le nom d'affichage depuis le roster local de l'appel (source de
   * confiance) ; le `displayName` transporté par le wire n'est qu'un fallback.
   */
  resolveSpeakerName?: (speakerId: string) => string | undefined;
  /** Id de l'utilisateur local — ses lignes gardent le texte original. */
  localUserId?: string;
}

function formatTime(capturedAtMs: number): string {
  return new Date(capturedAtMs).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const CallTranscriptPanel = memo(function CallTranscriptPanel({
  entries,
  resolveSpeakerName,
  localUserId,
}: CallTranscriptPanelProps) {
  const { t } = useI18n('calls');
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [entries.length]);

  return (
    <div
      role="log"
      aria-label={t('transcript.region')}
      data-testid="call-transcript-panel"
      className="absolute bottom-28 right-4 z-20 flex max-h-[45vh] w-full max-w-sm flex-col rounded-xl bg-black/75 shadow-lg backdrop-blur-md"
    >
      <p className="border-b border-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white/60">
        {t('transcript.title')}
      </p>
      <div className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
        {entries.length === 0 ? (
          <p className="text-sm text-white/50">{t('transcript.empty')}</p>
        ) : (
          entries.map((entry) => {
            const isLocal = localUserId !== undefined && entry.speakerId === localUserId;
            const displayName =
              resolveSpeakerName?.(entry.speakerId) || entry.displayName || t('transcript.unknownSpeaker');
            const showsTranslation = !isLocal && entry.translatedText !== undefined;
            const text = showsTranslation ? (entry.translatedText as string) : entry.text;
            const languageTag = showsTranslation ? entry.targetLanguage ?? entry.language : entry.language;
            return (
              <div
                key={entry.id}
                data-testid="call-transcript-entry"
                aria-label={formatCallTranscriptLine({
                  displayName,
                  capturedAtMs: entry.capturedAtMs,
                  text,
                })}
              >
                <span className="flex items-baseline gap-2">
                  <span
                    className={`text-xs font-semibold ${isLocal ? 'text-indigo-300' : 'text-emerald-300'}`}
                  >
                    {`${displayName} (${formatTime(entry.capturedAtMs)})`}
                  </span>
                  <span
                    data-testid="call-transcript-language"
                    className="rounded-full bg-white/10 px-1.5 text-[10px] font-semibold uppercase tracking-wide text-white/70"
                  >
                    {languageTag}
                  </span>
                </span>
                <span className="block text-sm leading-snug text-white">{text}</span>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
});
