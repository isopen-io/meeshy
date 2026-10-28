package me.meeshy.app.feed

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.minimumInteractiveComponentSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.hexColor

private val SCENE_MAX_HEIGHT = 360.dp
private val SWATCH_SIZE = 32.dp
private const val SCENE_RATIO = 9f / 16f
private val SceneIn = fadeIn(spring(stiffness = Spring.StiffnessMediumLow)) +
    expandVertically(spring(dampingRatio = Spring.DampingRatioLowBouncy, stiffness = Spring.StiffnessMediumLow), Alignment.Top)
private val SceneOut = fadeOut(spring(stiffness = Spring.StiffnessMedium)) +
    shrinkVertically(spring(stiffness = Spring.StiffnessMedium), Alignment.Top)

/**
 * The focus the content field answers to, and the keyboard debt of a door that promised writing paid on it once —
 * shared by the plateau's card and the modal sheet, so both presentations honour the promise (#13547).
 */
@Composable
internal fun rememberContentFocus(raiseKeyboard: Boolean, onKeyboardRaised: () -> Unit): FocusRequester {
    val requester = remember { FocusRequester() }
    val keyboard = LocalSoftwareKeyboardController.current
    val raised by rememberUpdatedState(onKeyboardRaised)
    LaunchedEffect(raiseKeyboard) {
        if (!raiseKeyboard) return@LaunchedEffect
        payKeyboardDebt(
            requestFocus = { runCatching { requester.requestFocus() }.isSuccess },
            nextFrame = { withFrameNanos { } },
            showKeyboard = { keyboard?.show() },
            onPaid = { raised() },
        )
    }
    return requester
}

/**
 * The scene born by the background (view `1b`): it appears at the TOP of the document, rounded and 9:16, painted with the
 * chosen colour, and the text below slides down — the size animation of the visibility moves the siblings, and the field
 * keeps its place in the column, so it keeps the focus it had. The swatches open under the scene when [paletteOpen].
 */
@Composable
internal fun PostSceneBlock(background: String?, paletteOpen: Boolean, onPick: (String) -> Unit) {
    Column {
        AnimatedVisibility(visible = background != null, enter = SceneIn, exit = SceneOut) {
            PostScene(background, Modifier.padding(bottom = MeeshySpacing.md))
        }
        AnimatedVisibility(visible = paletteOpen, enter = SceneIn, exit = SceneOut) {
            BackgroundSwatches(selected = background, onPick = onPick, modifier = Modifier.padding(bottom = MeeshySpacing.md))
        }
    }
}

@Composable
private fun PostScene(background: String?, modifier: Modifier) {
    // The colour is kept while the scene leaves, so the exit shrinks the painted card instead of flashing blank.
    val last = remember { arrayOfNulls<String>(1) }
    background?.let { last[0] = it }
    val paint by animateColorAsState(last[0]?.let(::hexColor) ?: Color.Transparent, label = "postSceneBackground")
    Box(modifier = modifier.fillMaxWidth()) {
        Box(
            modifier = Modifier
                .align(Alignment.Center)
                .heightIn(max = SCENE_MAX_HEIGHT)
                .aspectRatio(SCENE_RATIO)
                .clip(RoundedCornerShape(MeeshyRadius.xlPlus))
                .background(paint),
        )
    }
}

@Composable
private fun BackgroundSwatches(selected: String?, onPick: (String) -> Unit, modifier: Modifier) {
    Row(
        modifier = modifier.horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        PostSceneLaw.swatches.forEach { hex ->
            val chosen = hex == selected
            Box(
                modifier = Modifier
                    .minimumInteractiveComponentSize()
                    .size(SWATCH_SIZE)
                    .clip(CircleShape)
                    .background(hexColor(hex))
                    .border(if (chosen) 3.dp else 1.dp, if (chosen) Color.White else Color.White.copy(alpha = 0.35f), CircleShape)
                    .semantics { this.selected = chosen }
                    .clickable(role = Role.RadioButton) { onPick(hex) },
            )
        }
    }
}
