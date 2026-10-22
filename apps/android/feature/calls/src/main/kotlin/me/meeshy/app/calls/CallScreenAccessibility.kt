package me.meeshy.app.calls

import android.provider.Settings
import androidx.annotation.StringRes
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import me.meeshy.feature.calls.R
import me.meeshy.ui.accessibility.LocalReduceMotion

/** Ce que TalkBack annonce à chaque transition de l'appel (iOS `onChange(of: callState)`). */
internal object CallAnnouncements {
    @StringRes
    fun resFor(status: CallStatus): Int? = when (status) {
        CallStatus.CONNECTING -> R.string.call_a11y_connecting
        CallStatus.CONNECTED -> R.string.call_a11y_connected
        CallStatus.RECONNECTING -> R.string.call_a11y_reconnecting
        CallStatus.ENDED -> R.string.call_a11y_ended
        CallStatus.IDLE, CallStatus.INCOMING, CallStatus.OUTGOING_RINGING -> null
    }
}

/** « Réduire les animations » : le réglage de l'application, ou l'échelle d'animation système à zéro. */
@Composable
internal fun rememberCallReduceMotion(): Boolean {
    val provided = LocalReduceMotion.current
    val context = LocalContext.current
    val system = remember(context) {
        runCatching {
            Settings.Global.getFloat(context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f
        }.getOrDefault(false)
    }
    return provided || system
}

/** Annonce [message] à TalkBack. */
@Composable
internal fun rememberCallAnnouncer(): (String) -> Unit {
    val view = LocalView.current
    return remember(view) { { message -> view.announceForAccessibility(message) } }
}

/** Annonce chaque changement de phase (une seule fois par transition). */
@Composable
internal fun CallStatusAnnouncer(status: CallStatus) {
    val context = LocalContext.current
    val announce = rememberCallAnnouncer()
    LaunchedEffect(status) {
        CallAnnouncements.resFor(status)?.let { announce(context.getString(it)) }
    }
}
