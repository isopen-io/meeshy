package me.meeshy.app.calls

import androidx.annotation.StringRes
import me.meeshy.sdk.model.call.CallRefusalMessage
import me.meeshy.feature.calls.R
import me.meeshy.sdk.model.call.CallRefusalReason

/** Le libellé localisé d'un refus d'appel nommé par un code typé, ou `null` (repli de l'appelant). */
object CallRefusalText {
    @StringRes
    fun resFor(code: String?): Int? = when (CallRefusalMessage.reasonForCode(code)) {
        CallRefusalReason.CALLEE_REFUSES_NON_CONTACTS -> R.string.call_error_callee_refuses_non_contacts
        null -> null
    }
}
