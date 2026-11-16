package me.meeshy.app.chat

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.view.WindowManager
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.ui.platform.LocalContext
import me.meeshy.sdk.model.MessageExitOffer

/**
 * La capture du FIL (#18831, #18842) : un message flouté, éphémère ou à vue unique sort NOIR de toute capture d'écran.
 * Android ne protège qu'une fenêtre entière, jamais une bulle (même règle que le hub, [HubCaptureShield]) : un seul
 * message chargé dont le verdict RENDU protège suffit à fermer la fenêtre du fil. Le verdict rendu
 * ([MessageExitOffer.capture]) compte le flou ; ce qui se déclare à la passerelle ne le compte pas.
 */
object ChatCaptureShield {
    fun shields(offers: List<MessageExitOffer>): Boolean = offers.any { it.capture.shieldsCapture() }
}

/** Pose `FLAG_SECURE` sur la fenêtre de l'activité tant que [active] ; le retire en sortant. */
@Composable
internal fun ChatWindowCaptureShield(active: Boolean) {
    val activity = LocalContext.current.findActivity()
    DisposableEffect(active, activity) {
        val window = activity?.window
        if (active) window?.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
        onDispose { if (active) window?.clearFlags(WindowManager.LayoutParams.FLAG_SECURE) }
    }
}

private tailrec fun Context.findActivity(): Activity? = when (this) {
    is Activity -> this
    is ContextWrapper -> baseContext.findActivity()
    else -> null
}
