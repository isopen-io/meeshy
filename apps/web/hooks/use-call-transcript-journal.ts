/**
 * USE CALL TRANSCRIPT JOURNAL HOOK
 * Journal de transcription d'appel (`displayName (heure): message` + tag de
 * langue) — le pendant "panneau" du hook overlay `use-call-captions` (4
 * lignes éphémères, inchangé).
 *
 * Chaque segment FINAL arrive par un ou deux transports :
 * - data channel WebRTC P2P (`callTranscriptChannel`) : entrée originale +
 *   tag de langue de transcription, latence minimale — présent quand le pair
 *   (iOS offreur) a ouvert le channel ;
 * - relais serveur `call:translated-segment` : systématique — il porte la
 *   traduction ZMQ par auditeur, le `speakerDisplayName` estampillé côté
 *   gateway (anti-usurpation) et sert de fallback quand le channel est
 *   absent/fermé.
 *
 * Fusion par id stable (`callTranscriptEntryKey` : id wire, sinon clé
 * synthétique pour les anciens clients) via le réducteur partagé
 * `upsertCallTranscriptEntry` — une seule ligne de journal, la traduction
 * vient l'enrichir, l'horloge murale de capture (`capturedAtMs`) ordonne.
 * Même sémantique que iOS `CallTranscriptionService.upsertRemoteSegment`.
 */

'use client';

import { useEffect, useState } from 'react';
import { meeshySocketIOService } from '@/services/meeshy-socketio.service';
import { callTranscriptChannel } from '@/services/call-transcript-channel';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import {
  callTranscriptEntryKey,
  upsertCallTranscriptEntry,
  type CallTranscriptJournalEntry,
} from '@meeshy/shared/utils/call-transcript';
import type {
  CallTranscriptEntryPayload,
  CallTranslatedSegmentEvent,
} from '@meeshy/shared/types/video-call';

const JOURNAL_RETENTION = 200;

function bounded(entries: CallTranscriptJournalEntry[]): CallTranscriptJournalEntry[] {
  return entries.length > JOURNAL_RETENTION ? entries.slice(-JOURNAL_RETENTION) : entries;
}

export function useCallTranscriptJournal(callId: string | null): {
  entries: CallTranscriptJournalEntry[];
} {
  const [entries, setEntries] = useState<CallTranscriptJournalEntry[]>([]);

  useEffect(() => {
    setEntries([]);
    if (!callId) return;

    const handlePeerEntry = (entry: CallTranscriptEntryPayload) => {
      if (entry.callId !== callId || !entry.isFinal) return;
      setEntries((previous) => bounded(upsertCallTranscriptEntry(previous, {
        id: entry.id,
        speakerId: entry.speakerId,
        displayName: entry.speakerDisplayName,
        text: entry.text,
        language: entry.language,
        capturedAtMs: entry.capturedAtMs,
        isFinal: entry.isFinal,
      })));
    };

    const handleTranslatedSegment = (event: CallTranslatedSegmentEvent) => {
      if (event.callId !== callId) return;
      const { segment } = event;
      if (!segment.isFinal) return;
      const translated = segment.translatedText !== undefined;
      setEntries((previous) => bounded(upsertCallTranscriptEntry(previous, {
        id: callTranscriptEntryKey(segment),
        speakerId: segment.speakerId,
        displayName: segment.speakerDisplayName ?? '',
        text: segment.text,
        ...(translated ? { translatedText: segment.translatedText } : {}),
        language: segment.sourceLanguage,
        ...(translated ? { targetLanguage: segment.targetLanguage } : {}),
        capturedAtMs: segment.capturedAtMs ?? Date.now(),
        isFinal: segment.isFinal,
      })));
    };

    const unsubscribePeer = callTranscriptChannel.subscribe(handlePeerEntry);
    const socket = meeshySocketIOService.getSocket();
    socket?.on(SERVER_EVENTS.CALL_TRANSLATED_SEGMENT, handleTranslatedSegment);

    return () => {
      unsubscribePeer();
      socket?.off(SERVER_EVENTS.CALL_TRANSLATED_SEGMENT, handleTranslatedSegment);
    };
  }, [callId]);

  return { entries };
}
