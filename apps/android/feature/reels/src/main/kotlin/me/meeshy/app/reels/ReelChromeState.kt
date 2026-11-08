package me.meeshy.app.reels

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.Saver
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import me.meeshy.sdk.model.ReelChromeState
import me.meeshy.sdk.model.ReelContentTap

/**
 * Le mode immersif posé sur la loi [ReelChromeState] : un seul propriétaire, partagé par l'hôte (qui
 * l'efface au changement de réel) et par les pages (appui long, toucher). Survit à la rotation.
 */
@Stable
internal class ReelChromeHolder(initial: ReelChromeState = ReelChromeState()) {
    private var state by mutableStateOf(initial)

    val hidden: Boolean get() = state.immersive

    fun setHidden(hidden: Boolean) {
        state = if (hidden) state.enterImmersive() else state.restore()
    }

    fun onPageChanged() {
        state = state.onPageChanged()
    }

    /** Un toucher sur le média : ce que la page doit en faire (le chrome revient SANS basculer la lecture). */
    fun onContentTap(hasPlayableMedia: Boolean): ReelContentTap.Outcome {
        val result = state.onContentTap(hasPlayableMedia)
        state = result.state
        return result.outcome
    }

    companion object {
        val Saver: Saver<ReelChromeHolder, Boolean> = Saver(
            save = { it.hidden },
            restore = { ReelChromeHolder(ReelChromeState(immersive = it)) },
        )
    }
}

@Composable
internal fun rememberReelChromeHolder(): ReelChromeHolder =
    rememberSaveable(saver = ReelChromeHolder.Saver) { ReelChromeHolder() }

/**
 * Le lecteur est plein cadre (iOS `.statusBarHidden()`) : barres système masquées, réapparition
 * transitoire au glissé du bord, et la fenêtre retrouve son état en quittant l'écran.
 */
@Composable
internal fun ReelsSystemBarsHidden() {
    val view = LocalView.current
    DisposableEffect(view) {
        val window = view.context.findActivity()?.window ?: return@DisposableEffect onDispose { }
        val controller = WindowCompat.getInsetsController(window, view)
        val previousBehavior = controller.systemBarsBehavior
        controller.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        controller.hide(WindowInsetsCompat.Type.statusBars())
        onDispose {
            controller.show(WindowInsetsCompat.Type.statusBars())
            controller.systemBarsBehavior = previousBehavior
        }
    }
}

private tailrec fun Context.findActivity(): Activity? = when (this) {
    is Activity -> this
    is ContextWrapper -> baseContext.findActivity()
    else -> null
}
