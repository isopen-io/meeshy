/**
 * Le relais des SOUS-TITRES d'un appel — extrait de `CallEventsHandler.ts`
 * (#7632, budget de taille).
 *
 * Une responsabilité : prendre un segment de transcription qu'un client vient
 * de capturer, le GRAVER pour le replay post-appel, le faire traduire, et le
 * servir à chaque auditeur DANS SA langue.
 *
 * Deux doctrines gouvernent ce module, et elles ne se déduisent pas l'une de
 * l'autre :
 *
 *  - **la persistance ne bloque jamais le relais** — `persistTranscriptionSegment`
 *    ne rejette pas (échec ⇒ `null` + `warn`), et `persistTranslation` est un
 *    fire-and-forget avec son `.catch` propre (leçon 230 : un `void p` sans
 *    `.catch` détache la promesse, et un rejet sans écouteur tue le process
 *    sous Node 22) ;
 *  - **une traduction se sert à ses DESTINATAIRES, jamais à la salle** — le
 *    doc-comment de `emitTranslatedSegmentTo` porte la mesure : diffuser
 *    chaque langue à `ROOMS.call(callId)` laissait, dans un appel à trois
 *    langues, la dernière arrivée écraser les autres chez tout le monde.
 *
 * `buildTranslatedSegment` — le compositeur UNIQUE de toute émission
 * `TRANSLATED_SEGMENT`, dont les métadonnées de journal doivent être identiques
 * sur les six chemins (relais brut, sans cible, sans ZMQ, succès, délai,
 * erreur) pour que la fusion côté client marche — vit chez lui, dans
 * `./utils/call-translated-segment`.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { ZmqTranslationClient } from '../services/zmq-translation';
import type { MeeshySocket as Socket } from './typed-socket';
import { CALL_EVENTS } from '@meeshy/shared/types/video-call';
import { ROOMS } from '@meeshy/shared/types/socketio-events';
import { resolveUserLanguage } from '@meeshy/shared/utils/conversation-helpers';
import { normalizeLanguageForDedup } from '@meeshy/shared/utils/language-normalize';
import { logger } from '../utils/logger';
import { buildTranslatedSegment } from './utils/call-translated-segment';
import type {
  CallTranscriptionSegmentEvent,
  CallTranslatedSegmentEvent,
} from '@meeshy/shared/types/video-call';

/**
 * Ce que le relais emprunte à l'instance.
 *
 * `zmqClient` est un ACCESSEUR, pas une valeur : il est posé par
 * `setZmqClient()` APRÈS la construction du handler, et `translateAndEmitSegment`
 * le relit à chaque appel. Le capturer une fois ferait servir le client d'avant
 * le câblage — c'est-à-dire `null`, et le relais dégradé pour toujours.
 */
export type CallTranscriptionRelayDeps = {
  readonly prisma: PrismaClient;
  readonly zmqClient: () => ZmqTranslationClient | null;
};

/**
 * Persiste un segment FINAL du journal (modèle Transcription) pour le
 * replay post-appel — décision produit 2026-08-13 : le transcript survit
 * à la suppression de l'app et de ses caches locaux. Ne REJETTE jamais
 * (échec → null + warn, le relais temps réel n'en dépend pas) ; le texte
 * n'est jamais loggé (donnée sensible).
 */
export function persistTranscriptionSegment(
  deps: CallTranscriptionRelayDeps,
  data: CallTranscriptionSegmentEvent,
  participantId: string
): Promise<string | null> {
  try {
    return deps.prisma.transcription.create({
      data: {
        callSessionId: data.callId,
        participantId,
        source: 'client',
        segmentId: data.segment.id ?? null,
        text: data.segment.text,
        language: data.segment.language,
        confidence: data.segment.confidence,
        timestamp: new Date(data.segment.capturedAtMs ?? Date.now()),
        offsetMs: data.segment.startMs
      },
      select: { id: true }
    }).then(
      (row) => row.id,
      (err) => {
        logger.warn('Failed to persist call transcription segment', { callId: data.callId, err });
        return null;
      }
    );
  } catch (err) {
    logger.warn('Failed to persist call transcription segment', { callId: data.callId, err });
    return Promise.resolve(null);
  }
}

/**
 * Accroche la traduction ZMQ réussie au segment persisté (TranslationCall).
 * Fire-and-forget avec `.catch` propre (Leçon 230 : `void p` sans `.catch`
 * détache la promesse — un rejet tuerait le process sous Node 22).
 */
export function persistTranslation(
  deps: CallTranscriptionRelayDeps,
  persistedTranscriptionId: Promise<string | null> | null,
  targetLanguage: string,
  translatedText: string
): void {
  if (!persistedTranscriptionId) return;
  persistedTranscriptionId
    .then((transcriptionId) => {
      if (!transcriptionId) return null;
      return deps.prisma.translationCall.create({
        data: { transcriptionId, targetLanguage, translatedText, model: 'nllb' }
      });
    })
    .catch((err) => {
      logger.warn('Failed to persist call transcription translation', { targetLanguage, err });
    });
}

/**
 * Translates a final transcription segment to each active participant's
 * preferred language and emits a `TRANSLATED_SEGMENT` event per language.
 * Only fires for final segments (isFinal=true) to avoid flooding ZMQ.
 * Falls back to emitting the original text if translation fails.
 *
 * Security fix 2026-08-13: every relayed segment is stamped with
 * `speakerUserId` (the server-authenticated caller resolved by
 * `resolveActiveCallParticipantId` in the caller), never the
 * client-supplied `data.segment.speakerId`. Same rationale as
 * call:backgrounded/call:foregrounded/call:screen-capture-detected: the
 * gateway authorizes that the sender is an active participant of THIS
 * call, but that says nothing about who the free-form `speakerId` field
 * names — trusting it let any participant put words in another
 * participant's mouth in the live-caption UI and, for final segments, in
 * the persisted call transcript.
 */
export async function translateAndEmitSegment(
  deps: CallTranscriptionRelayDeps,
  socket: Socket,
  data: CallTranscriptionSegmentEvent,
  speaker: { userId: string; displayName: string | null },
  persistedTranscriptionId: Promise<string | null> | null = null
): Promise<void> {
  const activeParticipants = await deps.prisma.callParticipant.findMany({
    where: { callSessionId: data.callId, OR: [{ leftAt: null }, { leftAt: { isSet: false } }] },
    select: {
      participant: {
        select: {
          userId: true,
          user: {
            select: {
              systemLanguage: true,
              regionalLanguage: true,
              customDestinationLanguage: true,
              deviceLocale: true
            }
          }
        }
      }
    }
  });

  // Prisme-first (systemLanguage > regionalLanguage > customDestinationLanguage
  // > deviceLocale > 'fr') — same resolver as resolveNotificationLangs above.
  // Reading only `systemLanguage` here used to strand any listener who
  // configured a regional/custom language instead into a hardcoded 'fr'.
  //
  // Grouped BY target language, listener userIds and all — the per-language
  // relay below must reach ONLY the listeners who resolved to that language,
  // never the whole call room (see `emitTranslatedSegmentTo`).
  // The client-declared source language arrives VERBATIM (socket schema is a
  // bare 2–10 char string, so `en-US`/mixed case pass through) while listener
  // languages are canonical. Canonicalise ONCE via the SSOT, like the chat twin
  // (`MessageTranslationService._normalizeSourceLanguage`). Without it, `en-US
  // !== en` strands same-language listeners AND feeds NLLB an unknown SOURCE
  // code — every target falls back to the original (a Prisme violation).
  const segmentLanguage = normalizeLanguageForDedup(data.segment.language);
  const listenersByLanguage = new Map<string, string[]>();
  // Auditeurs qui lisent DÉJÀ la langue du locuteur : rien à traduire pour
  // eux, mais ils ont droit aux sous-titres comme tout le monde. Les
  // `continue` les écartaient de `listenersByLanguage`, et la diffusion à
  // la salle ci-dessous ne se déclenche que si PERSONNE ne demande de
  // traduction — donc dès qu'un SEUL auditeur en demandait une, tous les
  // auditeurs de même langue que le locuteur ne recevaient plus RIEN
  // (appel fr+fr+en : le francophone était muet côté sous-titres).
  // Ils sont désormais servis en ORIGINAL, sans aller-retour ZMQ.
  const sameLanguageListeners: string[] = [];
  for (const p of activeParticipants) {
    // Même prudence que `resolveActiveCallSpeaker` : la relation
    // `participant` peut manquer sur une ligne, et l'accès nu jetait —
    // l'exception remontait au try/catch du handler, tuant le relais
    // pour TOUS les auditeurs, pas seulement celui dont la ligne est
    // incomplète.
    const userId = p.participant?.userId;
    if (!userId || userId === speaker.userId) continue;
    const lang = resolveUserLanguage(p.participant.user ?? {}, { deviceLocale: p.participant.user?.deviceLocale ?? undefined });
    if (typeof lang !== 'string' || lang === segmentLanguage) {
      sameLanguageListeners.push(userId);
      continue;
    }
    const listeners = listenersByLanguage.get(lang);
    if (listeners) listeners.push(userId);
    else listenersByLanguage.set(lang, [userId]);
  }
  const targetLanguages: string[] = [...listenersByLanguage.keys()];

  if (targetLanguages.length === 0) {
    socket.to(ROOMS.call(data.callId)).emit(
      CALL_EVENTS.TRANSLATED_SEGMENT,
      buildTranslatedSegment(data, speaker, data.segment.language)
    );
    return;
  }

  // Capture zmqClient once so TypeScript can narrow the type and inner
  // lambdas don't need force-unwrap (zmqClient could theoretically be
  // cleared between the outer check in handleTranscriptionSegment and the
  // async Promise execution inside Promise.allSettled).
  const zmqClient = deps.zmqClient();
  if (!zmqClient) {
    logger.warn('[CallEventsHandler] translateAndEmitSegment called without zmqClient — relaying original', { callId: data.callId });
    socket.to(ROOMS.call(data.callId)).emit(
      CALL_EVENTS.TRANSLATED_SEGMENT,
      buildTranslatedSegment(data, speaker, data.segment.language)
    );
    return;
  }

  // Les auditeurs de même langue sont servis TOUT DE SUITE, en original :
  // leur sous-titre n'attend pas le retour ZMQ des autres langues.
  emitTranslatedSegmentTo(
    socket,
    sameLanguageListeners,
    buildTranslatedSegment(data, speaker, data.segment.language)
  );

  // Scoped to this call+segment (shared across the segment's target
  // languages, disambiguated below by taskId) — NOT the global
  // `translationCompleted` bus. Subscribing to the global event here used
  // to leave a listener (per segment × target language, up to 10s) on a
  // process-wide EventEmitter with no cap, so every translation completing
  // anywhere (chat messages, stories, other calls) re-ran every pending
  // call's taskId filter. Listener count is now bounded by this call's
  // active target languages instead of process-wide traffic.
  const messageId = `call-${data.callId}-${data.segment.startMs}`;
  const scopedEvent = `translationCompleted:${messageId}`;

  await Promise.allSettled(
    targetLanguages.map(async (targetLanguage) => {
      const listeners = listenersByLanguage.get(targetLanguage) ?? [];
      try {
        const taskId = await zmqClient.translateText(
          data.segment.text,
          segmentLanguage,
          targetLanguage,
          messageId,
          data.callId
        );

        logger.debug('Call transcription segment translation requested', { callId: data.callId, taskId, targetLanguage });

        return new Promise<void>((resolve) => {
          const TIMEOUT_MS = 10_000;
          const timer = setTimeout(() => {
            zmqClient.off(scopedEvent, onResult);
            emitTranslatedSegmentTo(socket, listeners, buildTranslatedSegment(data, speaker, targetLanguage));
            resolve();
          }, TIMEOUT_MS);
          timer.unref?.();

          const onResult = (event: { taskId: string; result: { translatedText: string; targetLanguage: string } }) => {
            if (event.taskId !== taskId) return;
            clearTimeout(timer);
            zmqClient.off(scopedEvent, onResult);
            persistTranslation(deps, persistedTranscriptionId, targetLanguage, event.result.translatedText);
            emitTranslatedSegmentTo(
              socket, listeners,
              buildTranslatedSegment(data, speaker, targetLanguage, event.result.translatedText)
            );
            resolve();
          };
          zmqClient.on(scopedEvent, onResult);
        });
      } catch (err) {
        logger.warn('Call transcription translation failed, relaying original', { callId: data.callId, targetLanguage, err });
        emitTranslatedSegmentTo(socket, listeners, buildTranslatedSegment(data, speaker, targetLanguage));
      }
    })
  );
}

/**
 * Broadcast one translated segment to exactly the listeners who resolved
 * to `targetLanguage` — never the whole call room. `translateAndEmitSegment`
 * used to relay every target language's translation to `ROOMS.call(callId)`
 * wholesale: in a 3+-language group call every peer received EVERY
 * language's caption event, and the client-side journal merge
 * (`upsertCallTranscriptEntry`, keyed on speaker+timing — not
 * `targetLanguage`) let whichever language arrived last silently overwrite
 * the others, so the reader's own Prisme language was not guaranteed to
 * win. Chained `.to()` calls (never a loop of separate `.emit()`s) so a
 * listener sitting in more than one addressed room still receives the
 * event exactly once.
 */
export function emitTranslatedSegmentTo(
  socket: Socket,
  userIds: readonly string[],
  payload: CallTranslatedSegmentEvent
): void {
  if (userIds.length === 0) return;
  const [first, ...rest] = userIds;
  rest
    .reduce((broadcast, userId) => broadcast.to(ROOMS.user(userId)), socket.to(ROOMS.user(first)))
    .emit(CALL_EVENTS.TRANSLATED_SEGMENT, payload);
}