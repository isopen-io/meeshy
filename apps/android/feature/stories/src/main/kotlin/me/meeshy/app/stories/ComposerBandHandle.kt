package me.meeshy.app.stories

import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.unit.dp
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.composer.ComposerBandResize

/**
 * The band's handle — a 44 dp touch target around a small grabber pill. Dragging resizes
 * the panel of ANY tool between [ComposerBandResize.MIN_HEIGHT_DP] and
 * [ComposerBandResize.MAX_HEIGHT_DP] (the law is the pure [ComposerBandResize]); pulling
 * more than 50 dp under the minimum closes the panel through [onDismiss], which gives the
 * tool row back.
 */
@Composable
internal fun ComposerBandHandle(
    heightDp: Float,
    onHeightChange: (Float) -> Unit,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val density = LocalDensity.current
    val currentHeight by rememberUpdatedState(heightDp)
    val currentChange by rememberUpdatedState(onHeightChange)
    val currentDismiss by rememberUpdatedState(onDismiss)
    val label = stringResource(R.string.story_composer_grabber)
    val hint = stringResource(R.string.story_composer_grabber_hint_resize)
    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(44.dp)
            .semantics {
                contentDescription = label
                stateDescription = hint
            }
            .pointerInput(Unit) {
                var base = 0f
                var travel = 0f
                detectVerticalDragGestures(
                    onDragStart = { base = currentHeight; travel = 0f },
                    onDragEnd = {
                        if (ComposerBandResize.shouldDismiss(base, travel)) currentDismiss()
                    },
                    onDragCancel = { currentChange(base) },
                ) { change, dy ->
                    change.consume()
                    travel += with(density) { dy.toDp().value }
                    currentChange(ComposerBandResize.height(base, travel))
                }
            },
        contentAlignment = Alignment.Center,
    ) {
        Box(
            modifier = Modifier
                .size(width = 36.dp, height = 5.dp)
                .background(MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.4f), RoundedCornerShape(50)),
        )
    }
}
