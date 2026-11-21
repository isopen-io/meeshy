package me.meeshy.app.calls

import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.ui.platform.LocalView

/**
 * #19695 — tant qu'un appel vit, l'écran ne se met pas en veille : en audio comme en vidéo, et pendant un partage
 * d'écran. Même étendue qu'iOS (`isIdleTimerDisabled = callState.isActive`, sonnerie entrante comprise). En audio
 * collé à l'oreille, le capteur de proximité éteint l'écran de son côté ([CallProximityController]).
 */
object CallKeepAwake {
    private val AWAKE = setOf(
        CallStatus.INCOMING,
        CallStatus.OUTGOING_RINGING,
        CallStatus.CONNECTING,
        CallStatus.CONNECTED,
        CallStatus.RECONNECTING,
    )

    fun keepsScreenOn(status: CallStatus): Boolean = status in AWAKE
}

/** Garde l'écran allumé tant que [status] le demande, sur la vue racine : plein écran comme appel réduit. */
@Composable
fun CallKeepScreenOn(status: CallStatus) {
    val view = LocalView.current
    val keep = CallKeepAwake.keepsScreenOn(status)
    DisposableEffect(view, keep) {
        view.keepScreenOn = keep
        onDispose { view.keepScreenOn = false }
    }
}
