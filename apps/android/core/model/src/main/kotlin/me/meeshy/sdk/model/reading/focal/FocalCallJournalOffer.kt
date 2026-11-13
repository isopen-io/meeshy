package me.meeshy.sdk.model.reading.focal

import me.meeshy.sdk.model.CallSummaryMetadata
import me.meeshy.sdk.model.CallSummaryMetadata.Outcome
import me.meeshy.sdk.model.call.CallTranscriptState

/**
 * Quelle bulle d'appel du fil se déplie en journal d'après l'appel (planche A1, A2 ; web `system-notice.tsx`) :
 * seulement un appel connecté, terminé et qui a réellement duré — un appel manqué, refusé, interrompu ou en cours
 * n'a rien dit. Même seuil que la durée affichée par [FocalCallNoticePresenter].
 */
object FocalCallJournalOffer {

    fun isOffered(summary: CallSummaryMetadata): Boolean =
        !summary.isLive && summary.outcome == Outcome.COMPLETED && summary.durationSeconds > 0 && summary.callId.isNotBlank()

    /**
     * Le journal déplié d'un appel qui n'a rien gardé (ni phrase ni capture, conversation chiffrée de bout en bout,
     * transcription supprimée de l'appareil) dit « Aucune transcription » au lieu de s'ouvrir sur du vide (web
     * `callTranscript.empty`). Le chargement ne dit rien : la copie de l'appareil se dessine aussitôt quand elle existe.
     */
    fun saysNothingWasKept(state: CallTranscriptState): Boolean = state == CallTranscriptState.Absent

    /**
     * A1.14 — sur cache vide, le journal déplié attend le replay du serveur avec un indicateur sobre (iOS `ProgressView`,
     * `BubbleCallJournalUnderCard`). Une copie déjà là se dessine aussitôt : elle n'est jamais en [CallTranscriptState.Loading].
     */
    fun showsWaiting(state: CallTranscriptState): Boolean = state == CallTranscriptState.Loading
}
