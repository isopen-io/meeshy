package me.meeshy.app.stories

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import me.meeshy.ui.component.chrome.StatusBarIconsOverDark

/**
 * Propriétaire : lot story-viewer-shell-open-close. Le lecteur est immersif (iOS `.statusBarHidden()`,
 * schéma sombre) : barres système masquées (réapparition transitoire au glissé du bord) pendant tout le
 * lecteur, icônes claires, et la fenêtre retrouve son état en le quittant.
 */
@Composable
internal fun StoryViewerImmersiveMode() {
    StatusBarIconsOverDark()
    val view = LocalView.current
    DisposableEffect(view) {
        val window = view.context.findActivity()?.window
        if (window == null) return@DisposableEffect onDispose { }
        val controller = WindowCompat.getInsetsController(window, view)
        val previousBehavior = controller.systemBarsBehavior
        controller.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        controller.hide(WindowInsetsCompat.Type.systemBars())
        onDispose {
            controller.show(WindowInsetsCompat.Type.systemBars())
            controller.systemBarsBehavior = previousBehavior
        }
    }
}

/** Passer en arrière-plan ferme le lecteur : la sortie libère players, audio et focus (iOS `scenePhase`). */
@Composable
internal fun StoryCloseOnStop(onStop: () -> Unit) {
    val current = rememberUpdatedState(onStop)
    LifecycleEventEffect(Lifecycle.Event.ON_STOP) { current.value() }
}

private tailrec fun Context.findActivity(): Activity? = when (this) {
    is Activity -> this
    is ContextWrapper -> baseContext.findActivity()
    else -> null
}
