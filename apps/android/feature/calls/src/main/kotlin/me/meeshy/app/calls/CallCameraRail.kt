package me.meeshy.app.calls

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.unit.dp
import me.meeshy.feature.calls.R
import me.meeshy.sdk.model.call.CallSelfTileControlsLaw
import me.meeshy.ui.icons.MeeshyIcons

private const val FOLD_SCRIM_ALPHA = 0.4f
private val FOLD_GLYPH = 18.dp
private val FOLD_VISUAL = 36.dp

/**
 * Petite vignette : les deux rangées se replient en UN bouton de 44 dp qui déplie la grille (iOS
 * `CallCameraRail.foldedMenu`). Il dit s'il est déplié, pour TalkBack.
 */
@Composable
internal fun CallCameraFoldButton(unfolded: Boolean, onTap: () -> Unit, modifier: Modifier = Modifier) {
    val haptics = LocalHapticFeedback.current
    val label = stringResource(R.string.call_camera_rail_fold_label)
    val state = stringResource(if (unfolded) R.string.call_camera_rail_unfolded else R.string.call_camera_rail_folded)
    Box(
        modifier = modifier
            .size(CallSelfTileControlsLaw.BUTTON_DP.dp)
            .clip(CircleShape)
            .clickable(role = Role.Button) {
                haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                onTap()
            }
            .semantics {
                contentDescription = label
                stateDescription = state
            },
        contentAlignment = Alignment.Center,
    ) {
        Box(Modifier.size(FOLD_VISUAL).clip(CircleShape).background(Color.Black.copy(alpha = FOLD_SCRIM_ALPHA)), contentAlignment = Alignment.Center) {
            Icon(
                imageVector = if (unfolded) MeeshyIcons.Close else MeeshyIcons.MoreHorizontal,
                contentDescription = null,
                tint = CallPalette.Ink,
                modifier = Modifier.size(FOLD_GLYPH),
            )
        }
    }
}

/**
 * Grille dépliée : un toucher ailleurs la referme et est CONSOMMÉ (iOS `consumesTapElsewhere`) — il n'active ni la
 * vignette ni la scène qu'il couvre. Posé sous les rangées, au-dessus du reste.
 */
@Composable
internal fun CallCameraRailScrim(onDismiss: () -> Unit, modifier: Modifier = Modifier) {
    Box(
        modifier
            .fillMaxSize()
            .pointerInput(onDismiss) { detectTapGestures(onTap = { onDismiss() }) },
    )
}
