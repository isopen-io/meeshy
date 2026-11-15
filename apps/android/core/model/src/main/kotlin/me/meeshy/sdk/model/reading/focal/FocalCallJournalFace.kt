package me.meeshy.sdk.model.reading.focal

import me.meeshy.sdk.model.call.CallTranscriptState

/**
 * Ce que le journal déplié sous la bulle d'appel MONTRE : rien encore (la copie de l'appareil se lit), l'attente du
 * replay sur cache vide (A1.14), « Aucune transcription », ou le journal (ses phrases, ou sa reprise sur échec). Le
 * passage d'une face à l'autre se fait en fondu ; une revalidation qui garde la face ne refait aucun fondu.
 */
enum class FocalCallJournalFace {
    Unread,
    Waiting,
    NothingKept,
    Journal,
    ;

    companion object {
        fun of(state: CallTranscriptState): FocalCallJournalFace = when {
            FocalCallJournalOffer.saysNothingWasKept(state) -> NothingKept
            FocalCallJournalOffer.showsWaiting(state) -> Waiting
            state == CallTranscriptState.ReadingCopy -> Unread
            else -> Journal
        }
    }
}
