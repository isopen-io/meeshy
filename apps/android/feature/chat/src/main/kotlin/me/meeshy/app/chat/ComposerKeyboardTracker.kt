package me.meeshy.app.chat

import android.os.Build
import android.os.SystemClock
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.tween
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.ime
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Dp
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.distinctUntilChanged
import me.meeshy.sdk.model.composer.ComposerKeyboardTracker
import me.meeshy.sdk.model.composer.ComposerKeyboardTransition

/**
 * Ce que l'écran sait du clavier : le mouvement en cours ([transition]) et la dernière hauteur
 * STABLE ([settledHeightDp], posée une fois le mouvement fini). Les insets IME de Compose
 * arrivent image par image dès l'API 30 ; ici on n'en tire que le tempo et la hauteur finale.
 */
@Stable
internal class ComposerKeyboardState {
    var transition by mutableStateOf<ComposerKeyboardTransition?>(null)
        internal set
    var settledHeightDp by mutableStateOf<Float?>(null)
        internal set
}

@Composable
internal fun rememberComposerKeyboardState(): ComposerKeyboardState {
    val state = remember { ComposerKeyboardState() }
    val density = LocalDensity.current
    val ime = WindowInsets.ime
    LaunchedEffect(density) {
        snapshotFlow { ime.getBottom(density) / density.density }
            .distinctUntilChanged()
            .collectLatest { heightDp ->
                val now = SystemClock.uptimeMillis()
                val next = ComposerKeyboardTracker.onInset(
                    state.transition, heightDp, null, now, Build.VERSION.SDK_INT >= Build.VERSION_CODES.R,
                )
                state.transition = next
                val duration = next?.durationMs ?: ComposerKeyboardTransition.FALLBACK_DURATION_MS
                delay(duration + ComposerKeyboardTransition.LIVE_SLACK_MS + 1L)
                ComposerKeyboardTracker.settledHeight(next, SystemClock.uptimeMillis())?.let { state.settledHeightDp = it }
            }
    }
    return state
}

/**
 * La réserve basse du fil : elle suit l'inset tel quel pendant un mouvement de clavier avec insets
 * image par image, la durée du clavier sans eux, et la courbe courte du composeur quand seul
 * celui-ci change ([ChatScrollGeometry.bottomInsetAnimationMs]) — jamais un saut en une image.
 */
@Composable
internal fun rememberKeyboardFollowingInset(target: Dp, keyboard: ComposerKeyboardState): Dp {
    val ms = ChatScrollGeometry.bottomInsetAnimationMs(keyboard.transition, SystemClock.uptimeMillis())
    val animated by animateDpAsState(target, if (ms == 0) snap<Dp>() else tween<Dp>(ms), label = "list-bottom-inset")
    return animated
}
