package me.meeshy.ui.appearance

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.PowerManager
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.layout.boundsInWindow
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import me.meeshy.sdk.model.game.GameOnScreenLaw
import me.meeshy.ui.accessibility.LocalReduceMotion

/** Ce que le mouvement d'un cadre fait : rien, tourner, ou figé en route (hors écran, arrière-plan). */
public enum class FrameMotionRun { STILL, PAUSED, RUNNING }

/**
 * La décision de mouvement d'un cadre (miroir de `FrameMotionHostView`, iOS) : le mouvement n'est POSÉ que si
 * l'app l'autorise (`animates`, faux pour un aperçu ou une vignette), si « Réduire les animations » est
 * éteint et si l'économie d'énergie l'est aussi — sinon le cadre fixe reste. Posé, il est mis en PAUSE hors
 * écran et quand l'application passe en arrière-plan.
 */
public object FrameVisibility {

    public fun motionAllowed(animates: Boolean, reduceMotion: Boolean, powerSaver: Boolean): Boolean =
        animates && !reduceMotion && !powerSaver

    public fun decide(
        animates: Boolean,
        reduceMotion: Boolean,
        powerSaver: Boolean,
        onScreen: Boolean,
        appForeground: Boolean,
    ): FrameMotionRun = when {
        !motionAllowed(animates, reduceMotion, powerSaver) -> FrameMotionRun.STILL
        onScreen && appForeground -> FrameMotionRun.RUNNING
        else -> FrameMotionRun.PAUSED
    }
}

/** `true` tant que le mode économie d'énergie du système est actif. */
@Composable
public fun rememberPowerSaver(): Boolean {
    val context = LocalContext.current
    var saver by remember(context) { mutableStateOf(readPowerSaver(context)) }
    DisposableEffect(context) {
        val receiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context, intent: Intent) {
                saver = readPowerSaver(context)
            }
        }
        runCatching {
            context.applicationContext.registerReceiver(receiver, IntentFilter(PowerManager.ACTION_POWER_SAVE_MODE_CHANGED))
        }
        onDispose { runCatching { context.applicationContext.unregisterReceiver(receiver) } }
    }
    return saver
}

private fun readPowerSaver(context: Context): Boolean = runCatching {
    (context.getSystemService(Context.POWER_SERVICE) as PowerManager).isPowerSaveMode
}.getOrDefault(false)

/** `true` tant que l'application est au premier plan (au moins STARTED). */
@Composable
public fun rememberAppForeground(): Boolean {
    val owner = LocalLifecycleOwner.current
    var foreground by remember(owner) {
        mutableStateOf(owner.lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED))
    }
    DisposableEffect(owner) {
        val observer = LifecycleEventObserver { _, _ ->
            foreground = owner.lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED)
        }
        owner.lifecycle.addObserver(observer)
        onDispose { owner.lifecycle.removeObserver(observer) }
    }
    return foreground
}

/** Dit à [onChange] quand la boîte entre dans la fenêtre ou en sort, défilement compris. */
public fun Modifier.frameOnScreen(onChange: (Boolean) -> Unit): Modifier = composed {
    val view = LocalView.current
    val last = remember { mutableStateOf<Boolean?>(null) }
    onGloballyPositioned { coordinates ->
        val bounds = coordinates.boundsInWindow()
        val visible = coordinates.isAttached && GameOnScreenLaw.isVisible(
            bounds.left, bounds.top, bounds.right, bounds.bottom,
            view.rootView.width.toFloat(), view.rootView.height.toFloat(),
        )
        if (last.value != visible) {
            last.value = visible
            onChange(visible)
        }
    }
}

/** La décision courante d'un cadre, avec le modificateur qui mesure sa visibilité. */
public class FrameMotionGate internal constructor(
    public val run: FrameMotionRun,
    public val modifier: Modifier,
)

@Composable
public fun rememberFrameMotionGate(animates: Boolean): FrameMotionGate {
    val onScreen = remember { mutableStateOf(true) }
    val run = FrameVisibility.decide(
        animates = animates,
        reduceMotion = LocalReduceMotion.current,
        powerSaver = rememberPowerSaver(),
        onScreen = onScreen.value,
        appForeground = rememberAppForeground(),
    )
    return FrameMotionGate(run, Modifier.frameOnScreen { onScreen.value = it })
}
