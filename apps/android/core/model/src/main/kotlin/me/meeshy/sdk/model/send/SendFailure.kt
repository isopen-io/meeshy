package me.meeshy.sdk.model.send

import me.meeshy.sdk.model.ConversationWriteRestriction
import me.meeshy.sdk.model.net.NewcomerSlowMode

/** Pourquoi un envoi n'a pas été acquitté par le serveur — miroir de `SendFailure` (iOS). */
sealed interface SendFailure {
    /** Rien d'envoyable : ni texte, ni pièce, ni lieu. */
    data object Ineligible : SendFailure

    data class OfflineEnqueueFailed(val reason: String) : SendFailure

    data class WriteRestricted(val restriction: ConversationWriteRestriction) : SendFailure

    data class SlowMode(val slowMode: NewcomerSlowMode) : SendFailure

    data object RecipientBlocked : SendFailure

    data class QueuedForRetry(val reason: String) : SendFailure

    data class RetryEnqueueFailed(val reason: String) : SendFailure
}

/** La cause d'un échec, pour choisir le libellé localisé côté écran (les chaînes vivent dans les ressources). */
enum class SendFailureMessage { INELIGIBLE, OFFLINE_ENQUEUE_FAILED, WRITE_RESTRICTED, SLOW_MODE, RECIPIENT_BLOCKED, QUEUED_FOR_RETRY, RETRY_ENQUEUE_FAILED }

/** Un message par cause, sans argument libre : `slowMode` expose ses secondes pour le libellé paramétré. */
val SendFailure.messageKey: SendFailureMessage
    get() = when (this) {
        SendFailure.Ineligible -> SendFailureMessage.INELIGIBLE
        is SendFailure.OfflineEnqueueFailed -> SendFailureMessage.OFFLINE_ENQUEUE_FAILED
        is SendFailure.WriteRestricted -> SendFailureMessage.WRITE_RESTRICTED
        is SendFailure.SlowMode -> SendFailureMessage.SLOW_MODE
        SendFailure.RecipientBlocked -> SendFailureMessage.RECIPIENT_BLOCKED
        is SendFailure.QueuedForRetry -> SendFailureMessage.QUEUED_FOR_RETRY
        is SendFailure.RetryEnqueueFailed -> SendFailureMessage.RETRY_ENQUEUE_FAILED
    }

/** Les secondes à patienter, seulement pour le mode lent. */
val SendFailure.retryAfterSeconds: Int? get() = (this as? SendFailure.SlowMode)?.slowMode?.retryAfterSeconds
