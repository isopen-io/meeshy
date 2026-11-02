package me.meeshy.ui.component.composer

import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.isImeVisible
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.input.nestedscroll.NestedScrollConnection
import androidx.compose.ui.input.nestedscroll.NestedScrollSource
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.unit.Velocity
import me.meeshy.sdk.model.composer.PullDownDismiss
import me.meeshy.sdk.model.composer.PullOutcome

/**
 * The pull down that closes a composer like its cross (the drafts autosave), fed by the leftover scroll of the content
 * ([connection]) and by a drag on a handle ([onDrag] / [onRelease]); with the keyboard up the same pull lowers it first.
 * Shared by [ComposerPlateau] and the story's scene-first layout.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
public fun rememberComposerPullDismiss(onDismiss: () -> Unit): ComposerPullDismiss {
    val density = LocalDensity.current.density
    val dismiss = rememberUpdatedState(onDismiss)
    val keyboardOpen = rememberUpdatedState(WindowInsets.isImeVisible)
    val keyboard = LocalSoftwareKeyboardController.current
    val focus = LocalFocusManager.current
    return remember {
        ComposerPullDismiss(density, keyboardOpen = { keyboardOpen.value }) { outcome ->
            when (outcome) {
                PullOutcome.DISMISS -> dismiss.value()
                PullOutcome.HIDE_KEYBOARD -> {
                    focus.clearFocus()
                    keyboard?.hide()
                }
                PullOutcome.NONE -> Unit
            }
        }
    }
}

/** Feeds [PullDownDismiss]; allocation-free per frame. */
public class ComposerPullDismiss internal constructor(
    private val density: Float,
    private val keyboardOpen: () -> Boolean,
    private val onOutcome: (PullOutcome) -> Unit,
) {
    private var pull = PullDownDismiss()

    public val connection: NestedScrollConnection = object : NestedScrollConnection {
        override fun onPostScroll(consumed: Offset, available: Offset, source: NestedScrollSource): Offset {
            if (source == NestedScrollSource.UserInput) onDrag(available.y)
            return Offset.Zero
        }

        override suspend fun onPostFling(consumed: Velocity, available: Velocity): Velocity {
            onRelease(available.y)
            return Velocity.Zero
        }
    }

    public fun onDrag(deltaPx: Float) {
        pull = pull.pulled(deltaPx / density)
    }

    public fun onRelease(velocityPx: Float) {
        val outcome = pull.outcome(velocityPx / density, keyboardOpen())
        pull = pull.released()
        onOutcome(outcome)
    }
}
