package me.meeshy.ui.motion

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.AnimatedVisibilityScope
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.core.MutableTransitionState
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier

@Stable
public class HeldPresence<T : Any> internal constructor(
    public val value: T?,
    public val visibleState: MutableTransitionState<Boolean>,
)

@Composable
public fun <T : Any> rememberHeldPresence(value: T?): HeldPresence<T> {
    val state = remember { MutableTransitionState(value != null) }
    state.targetState = value != null
    return HeldPresence(value, state)
}

@Composable
public fun <T : Any> MeeshyAnimatedVisibility(
    value: T?,
    modifier: Modifier = Modifier,
    enter: EnterTransition = fadeIn(),
    exit: ExitTransition = fadeOut(),
    label: String = "MeeshyAnimatedVisibility",
    content: @Composable AnimatedVisibilityScope.(T) -> Unit,
) {
    val presence = rememberHeldPresence(value)
    AnimatedVisibility(visibleState = presence.visibleState, modifier = modifier, enter = enter, exit = exit, label = label) {
        presence.value?.let { content(it) }
    }
}
