package me.meeshy.app.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import me.meeshy.feature.chat.R
import me.meeshy.sdk.model.composer.ComposerPanelHandleLaw
import me.meeshy.sdk.model.composer.ComposerPanelHandleOutcome
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.theme.MeeshyTheme

/**
 * La poignée de 4 dp du panneau de pièces (iOS `ComposerPanelHandle`) : glisser vers le haut d'au
 * moins 44 dp (ou à vitesse équivalente) ouvre toute la photothèque, vers le bas ferme le panneau,
 * sinon rien. La cible tactile fait 48 dp ; TalkBack reçoit l'action « Ouvrir toute la photothèque ».
 */
@Composable
internal fun ComposerPanelHandle(
    onOpenFullLibrary: () -> Unit,
    onClose: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val haptics = rememberMeeshyHaptics()
    val density = LocalDensity.current
    val open by rememberUpdatedState(onOpenFullLibrary)
    val close by rememberUpdatedState(onClose)
    val label = stringResource(R.string.composer_panel_handle_label)
    val openLabel = stringResource(R.string.composer_panel_handle_open_library)
    val closeLabel = stringResource(R.string.composer_panel_handle_close)
    val fire: (ComposerPanelHandleOutcome) -> Unit = { outcome ->
        when (outcome) {
            ComposerPanelHandleOutcome.OPEN_FULL_LIBRARY -> { haptics.medium(); open() }
            ComposerPanelHandleOutcome.CLOSE_PANEL -> { haptics.medium(); close() }
            ComposerPanelHandleOutcome.IGNORE -> Unit
        }
    }
    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(48.dp)
            .semantics {
                contentDescription = label
                customActions = listOf(
                    CustomAccessibilityAction(openLabel) { open(); true },
                    CustomAccessibilityAction(closeLabel) { close(); true },
                )
            }
            .pointerInput(Unit) {
                var total = 0f
                var lastDelta = 0f
                detectVerticalDragGestures(
                    onDragStart = { total = 0f; lastDelta = 0f },
                    onDragEnd = {
                        val projected = total + lastDelta * PROJECTION_FRAMES
                        fire(
                            ComposerPanelHandleLaw.outcome(
                                translationDp = total / density.density,
                                predictedDp = projected / density.density,
                            ),
                        )
                    },
                    onDragCancel = { },
                    onVerticalDrag = { _, delta -> total += delta; lastDelta = delta },
                )
            },
        contentAlignment = Alignment.Center,
    ) {
        Box(
            Modifier
                .size(width = 36.dp, height = 4.dp)
                .clip(RoundedCornerShape(2.dp))
                .background(MeeshyTheme.tokens.textSecondary.copy(alpha = 0.4f)),
        )
    }
}

/** Le dernier pas de glissement, prolongé de ce nombre d'images, approche la course projetée d'iOS. */
private const val PROJECTION_FRAMES = 12f
