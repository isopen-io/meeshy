package me.meeshy.app.chat

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.view.Window
import android.view.WindowManager
import java.util.WeakHashMap
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

    private val holds = WeakHashMap<Window, SecureHolds>()

    /** Les boucliers d'UNE fenêtre partagée : deux fils protégés s'y chevauchent pendant une transition. */
    internal fun holds(window: Window): SecureHolds = synchronized(holds) { holds.getOrPut(window) { SecureHolds() } }
}

/**
 * Le COMPTE des boucliers posés sur une fenêtre : le drapeau ne se pose qu'au premier et ne se retire qu'au dernier.
 * Sans lui, le fil qui sort retirerait la protection du fil qui entre (A → B, puis le `onDispose` de A).
 */
class SecureHolds {
    private var count = 0

    /** Rend vrai quand c'est le PREMIER bouclier : poser le drapeau. */
    fun acquire(): Boolean = synchronized(this) { ++count == 1 }

    /** Rend vrai quand c'était le DERNIER bouclier : retirer le drapeau. */
    fun release(): Boolean = synchronized(this) {
        if (count == 0) return@synchronized false
        --count == 0
    }
}

/** Tient un bouclier sur la fenêtre de l'activité tant que [active] ; `FLAG_SECURE` suit le compte, pas le dernier venu. */
@Composable
internal fun ChatWindowCaptureShield(active: Boolean) {
    val activity = LocalContext.current.findActivity()
    DisposableEffect(active, activity) {
        val window = activity?.window
        val holds = window?.takeIf { active }?.let(ChatCaptureShield::holds)
        if (holds?.acquire() == true) window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
        onDispose { if (holds?.release() == true) window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE) }
    }
}

private tailrec fun Context.findActivity(): Activity? = when (this) {
    is Activity -> this
    is ContextWrapper -> baseContext.findActivity()
    else -> null
}
