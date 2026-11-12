package me.meeshy.sdk.model.reading.focal

import me.meeshy.sdk.model.CallSummaryMetadata
import me.meeshy.sdk.model.CallSummaryMetadata.Outcome

/**
 * Quelle bulle d'appel du fil se déplie en journal d'après l'appel (planche A1, A2 ; web `system-notice.tsx`) :
 * seulement un appel connecté, terminé et qui a réellement duré — un appel manqué, refusé, interrompu ou en cours
 * n'a rien dit. Même seuil que la durée affichée par [FocalCallNoticePresenter].
 */
object FocalCallJournalOffer {

    fun isOffered(summary: CallSummaryMetadata): Boolean =
        !summary.isLive && summary.outcome == Outcome.COMPLETED && summary.durationSeconds > 0 && summary.callId.isNotBlank()
}
