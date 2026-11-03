package me.meeshy.app.calls

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.call.CallChromeVisibility
import me.meeshy.sdk.model.call.CallSelfTileControlFrames
import me.meeshy.sdk.model.call.CallSelfTileControlsLaw
import me.meeshy.sdk.model.call.CallTileRect
import me.meeshy.sdk.model.call.CallTileSize
import kotlin.math.roundToInt

/**
 * Une rangée posée hors de ma vignette (iOS `selfTileControlRows`) : miroitée en lecture droite-à-gauche, décalée du
 * glissé en cours par [CallSelfTileControlsLaw.following] — elle suit le doigt et reste dans l'écran.
 */
@Composable
internal fun CallCameraRailRowSlot(
    row: CallTileRect,
    container: CallTileSize,
    rtl: Boolean,
    drag: Offset,
    visible: Boolean,
    content: @Composable () -> Unit,
) {
    val density = LocalDensity.current.density
    val mirrored = row.copy(xDp = if (rtl) container.widthDp - row.xDp - row.widthDp else row.xDp)
    val placed = CallSelfTileControlsLaw.following(
        CallSelfTileControlFrames(effects = mirrored, camera = null),
        dxDp = drag.x / density,
        dyDp = drag.y / density,
        within = CallTileRect(0f, 0f, container.widthDp, container.heightDp),
    ).effects ?: mirrored
    AnimatedVisibility(
        visible = visible,
        enter = fadeIn(tween(CallChromeVisibility.FADE_DURATION_MILLIS.toInt())),
        exit = fadeOut(tween(CallChromeVisibility.FADE_DURATION_MILLIS.toInt())),
        modifier = Modifier
            .offset { IntOffset((placed.xDp * density).roundToInt(), (placed.yDp * density).roundToInt()) }
            .size(placed.widthDp.dp, placed.heightDp.dp),
    ) { content() }
}
