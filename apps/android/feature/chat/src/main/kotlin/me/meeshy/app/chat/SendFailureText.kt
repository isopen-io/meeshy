package me.meeshy.app.chat

import android.content.Context
import androidx.annotation.StringRes
import me.meeshy.feature.chat.R
import me.meeshy.sdk.model.send.SendFailure
import me.meeshy.sdk.model.send.SendFailureMessage
import me.meeshy.sdk.model.send.messageKey
import me.meeshy.sdk.model.send.retryAfterSeconds

/** Le libellé localisé d'un échec d'envoi : une chaîne par cause, les secondes seulement pour le mode lent. */
internal object SendFailureText {

    @StringRes
    fun resId(message: SendFailureMessage): Int = when (message) {
        SendFailureMessage.INELIGIBLE -> R.string.send_failure_ineligible
        SendFailureMessage.OFFLINE_ENQUEUE_FAILED -> R.string.send_failure_offline_enqueue_failed
        SendFailureMessage.WRITE_RESTRICTED -> R.string.send_failure_write_restricted
        SendFailureMessage.SLOW_MODE -> R.string.send_failure_slow_mode
        SendFailureMessage.RECIPIENT_BLOCKED -> R.string.send_failure_recipient_blocked
        SendFailureMessage.QUEUED_FOR_RETRY -> R.string.send_failure_queued_for_retry
        SendFailureMessage.RETRY_ENQUEUE_FAILED -> R.string.send_failure_retry_enqueue_failed
    }

    fun text(context: Context, failure: SendFailure): String {
        val id = resId(failure.messageKey)
        return failure.retryAfterSeconds?.let { context.getString(id, it) } ?: context.getString(id)
    }
}
