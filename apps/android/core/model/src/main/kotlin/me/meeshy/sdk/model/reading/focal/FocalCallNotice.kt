package me.meeshy.sdk.model.reading.focal

import me.meeshy.sdk.model.CallSummaryMetadata
import me.meeshy.sdk.model.CallSummaryMetadata.MediaType
import me.meeshy.sdk.model.CallSummaryMetadata.Outcome

/** Le titre d'une notice d'appel — miroir de `CallNoticePresentation.title` (iOS), résolu chez le lecteur. */
enum class FocalCallTitle {
    LiveVideo, LiveAudio, Cancelled,
    VideoOutgoing, VideoIncoming, AudioOutgoing, AudioIncoming,
    MissedVideo, MissedAudio, RejectedSent, RejectedReceived, FailedVideo, FailedAudio,
}

/** La teinte sémantique : l'accent de la conversation, l'erreur (manqué, refusé) ou l'alerte (interrompu). */
enum class FocalCallTone { Accent, Error, Warning }

/**
 * Ce que la rangée plate dit d'un appel (iOS `CallNoticePresentation` + `BubbleCallNoticeView`) : une seule
 * dérivation pour la carte, son libellé TalkBack et le rappel. Un appel EN COURS se lit avant son outcome (qui n'est
 * qu'un substitut neutre) et se rejoint au lieu de se rappeler.
 */
data class FocalCallNotice(
    val title: FocalCallTitle,
    val tone: FocalCallTone,
    val isVideo: Boolean,
    val isOutgoing: Boolean,
    val isLive: Boolean,
    /** Durée seulement pour un appel connecté qui a réellement duré. */
    val durationLabel: String?,
    val dataLabel: String?,
)

object FocalCallNoticePresenter {

    fun of(summary: CallSummaryMetadata, isOutgoing: Boolean): FocalCallNotice {
        val isVideo = summary.callType == MediaType.VIDEO
        return FocalCallNotice(
            title = title(summary, isOutgoing, isVideo),
            tone = tone(summary),
            isVideo = isVideo,
            isOutgoing = isOutgoing,
            isLive = summary.isLive,
            durationLabel = summary.durationLabel.takeIf { !summary.isLive && summary.outcome == Outcome.COMPLETED && summary.durationSeconds > 0 },
            dataLabel = summary.dataSpentLabel,
        )
    }

    private fun tone(summary: CallSummaryMetadata): FocalCallTone = when {
        summary.isLive -> FocalCallTone.Accent
        else -> when (summary.outcome) {
            Outcome.COMPLETED -> FocalCallTone.Accent
            Outcome.MISSED, Outcome.REJECTED -> FocalCallTone.Error
            Outcome.FAILED -> FocalCallTone.Warning
        }
    }

    private fun title(summary: CallSummaryMetadata, isOutgoing: Boolean, isVideo: Boolean): FocalCallTitle = when {
        summary.isLive -> if (isVideo) FocalCallTitle.LiveVideo else FocalCallTitle.LiveAudio
        summary.isCancelled(viewerIsInitiator = isOutgoing) -> FocalCallTitle.Cancelled
        else -> when (summary.outcome) {
            Outcome.COMPLETED -> when {
                isVideo && isOutgoing -> FocalCallTitle.VideoOutgoing
                isVideo -> FocalCallTitle.VideoIncoming
                isOutgoing -> FocalCallTitle.AudioOutgoing
                else -> FocalCallTitle.AudioIncoming
            }
            Outcome.MISSED -> if (isVideo) FocalCallTitle.MissedVideo else FocalCallTitle.MissedAudio
            Outcome.REJECTED -> if (isOutgoing) FocalCallTitle.RejectedSent else FocalCallTitle.RejectedReceived
            Outcome.FAILED -> if (isVideo) FocalCallTitle.FailedVideo else FocalCallTitle.FailedAudio
        }
    }
}

/** Quelle rangée spéciale la rangée plate dessine (iOS `FocalSystemRows.view(for:)`). */
enum class FocalSpecialRow { None, Deleted, CallNotice, JoinNotice, SystemNotice, Empty }

object FocalSpecialRowRouting {

    /** Un avis (système) se résout AVANT la suppression, comme `BubbleRenderKind` ; appel avant arrivée avant texte. */
    fun of(isDeleted: Boolean, isSystem: Boolean, hasCallSummary: Boolean, hasJoinNotice: Boolean, hasText: Boolean): FocalSpecialRow = when {
        isSystem -> when {
            hasCallSummary -> FocalSpecialRow.CallNotice
            hasJoinNotice -> FocalSpecialRow.JoinNotice
            hasText -> FocalSpecialRow.SystemNotice
            else -> FocalSpecialRow.Empty
        }
        isDeleted -> FocalSpecialRow.Deleted
        else -> FocalSpecialRow.None
    }
}
