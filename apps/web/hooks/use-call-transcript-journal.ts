/**
 * USE CALL TRANSCRIPT JOURNAL HOOK
 * Journal de transcription d'appel (`displayName (heure): message` + tag de
 * langue) — le pendant "panneau" du hook overlay `use-call-captions` (4
 * lignes éphémères, inchangé).
 *
 * Abonnement LIÉ AU PANNEAU (`active`) : panneau caché → désabonnement des
 * deux canaux de réception (data channel + socket) ; le journal accumulé est
 * CONSERVÉ tant que l'appel dure et se réaffiche à la réouverture — seule
 * l'arrivée d'un nouvel appel le remet à zéro. Les segments émis pendant que
 * le panneau est fermé ne sont pas reçus, par design.
 *
 * Chaque énoncé arrive comme un STREAM : révisions partielles du moteur de
 * transcription de l'auteur (data channel P2P, corrections appliquées en
 * place), puis le final, puis la traduction serveur qui enrichit. Fusion par
 * id stable (`callTranscriptEntryKey`) via le réducteur partagé
 * `upsertCallTranscriptEntry` — le journal historique ne montre jamais que
 * la DERNIÈRE valeur dite de chaque énoncé, ordonnée par l'horloge murale de
 * capture. Même sémantique que iOS `CallTranscriptionService.upsertRemoteSegment`.
 *
 * Deux transports :
 * - data channel WebRTC P2P (`callTranscriptChannel`) : partiels + finals,
 *   texte original + tag de langue, latence minimale — présent quand le pair
 *   (iOS offreur) a ouvert le channel ;
 * - relais serveur `call:translated-segment` : finals systématiques
 *   (traduction ZMQ + `speakerDisplayName` estampillé gateway + fallback
 *   sans channel). Les partiels socket sans id (anciens clients) sont
 *   ignorés : sans clé stable, chaque révision dupliquerait une ligne.
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

export function useCallTranscriptJournal(
  callId: string | null,
  { active = true }: { active?: boolean } = {}
): {
  entries: CallTranscriptJournalEntry[];
} {
  const [entries, setEntries] = useState<CallTranscriptJournalEntry[]>([]);

  useEffect(() => {
    setEntries([]);
  }, [callId]);

  useEffect(() => {
    if (!callId || !active) return;

    const handlePeerEntry = (entry: CallTranscriptEntryPayload) => {
      if (entry.callId !== callId) return;
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
      if (!segment.isFinal && segment.id === undefined) return;
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
  }, [callId, active]);

  return { entries };
}
