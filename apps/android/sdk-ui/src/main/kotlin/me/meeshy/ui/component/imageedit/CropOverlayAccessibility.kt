package me.meeshy.ui.component.imageedit

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import java.text.NumberFormat
import java.util.Locale
import me.meeshy.sdk.model.imageedit.CropFrameMove
import me.meeshy.sdk.model.imageedit.CropGeometry
import me.meeshy.sdk.model.imageedit.CropOverlayHandle
import me.meeshy.sdk.model.imageedit.CropRect
import me.meeshy.ui.R
import kotlin.math.roundToInt

/** Pourcentage entier localisé, comme `MeeshyAccessibleValue.percent` (iOS). */
public fun cropPercent(fraction: Double, locale: Locale): String =
    NumberFormat.getPercentInstance(locale).apply { maximumFractionDigits = 0 }.format(fraction)

private fun handleLabelRes(handle: CropOverlayHandle): Int = when (handle) {
    CropOverlayHandle.TOP_LEFT -> R.string.media_crop_a11y_handle_topLeft
    CropOverlayHandle.TOP_RIGHT -> R.string.media_crop_a11y_handle_topRight
    CropOverlayHandle.BOTTOM_LEFT -> R.string.media_crop_a11y_handle_bottomLeft
    CropOverlayHandle.BOTTOM_RIGHT -> R.string.media_crop_a11y_handle_bottomRight
    CropOverlayHandle.TOP -> R.string.media_crop_a11y_handle_top
    CropOverlayHandle.BOTTOM -> R.string.media_crop_a11y_handle_bottom
    CropOverlayHandle.LEFT -> R.string.media_crop_a11y_handle_left
    CropOverlayHandle.RIGHT -> R.string.media_crop_a11y_handle_right
    CropOverlayHandle.CENTER, CropOverlayHandle.NONE -> R.string.media_crop_a11y_handle_frame
}

private fun moveLabelRes(move: CropFrameMove): Int = when (move) {
    CropFrameMove.LEFT -> R.string.media_crop_a11y_move_left
    CropFrameMove.RIGHT -> R.string.media_crop_a11y_move_right
    CropFrameMove.UP -> R.string.media_crop_a11y_move_up
    CropFrameMove.DOWN -> R.string.media_crop_a11y_move_down
}

/**
 * Couche sémantique du cadre : un nœud de 48 dp par poignée accessible (bords absents en mode ratio)
 * plus le cadre entier. Chaque nœud annonce sa taille en pourcentages et expose des actions
 * personnalisées d'agrandissement et de réduction par pas de 1 % ; le cadre ajoute gauche, droite,
 * haut et bas. Aucun nœud ne capte de geste : le tactile reste au [CropOverlayView].
 */
@Composable
internal fun CropAccessibilityLayer(
    cropRect: CropRect,
    imageDisplayRect: CropRect,
    aspectRatio: Double?,
    minCropSize: Float,
    onInteraction: () -> Unit,
    onCropRectChange: (CropRect) -> Unit,
) {
    val rect by rememberUpdatedState(cropRect)
    val locale = LocalConfiguration.current.locales[0] ?: Locale.getDefault()
    val density = LocalDensity.current
    val hit = with(density) { CropGeometry.HANDLE_HIT_AREA_DP.dp.roundToPx() }
    val shares = CropGeometry.percentages(cropRect, imageDisplayRect)
    val sizeValue = stringResource(
        R.string.media_crop_a11y_size,
        cropPercent(shares.width, locale),
        cropPercent(shares.height, locale),
    )
    val positionValue = stringResource(
        R.string.media_crop_a11y_position,
        cropPercent(shares.x, locale),
        cropPercent(shares.y, locale),
    )
    val grow = stringResource(R.string.image_crop_action_grow)
    val shrink = stringResource(R.string.image_crop_action_shrink)

    fun step(handle: CropOverlayHandle, growing: Boolean): Boolean {
        val next = CropGeometry.stepped(rect, handle, growing, aspectRatio, imageDisplayRect, minCropSize)
            ?: return false
        onInteraction()
        onCropRectChange(next)
        return true
    }

    CropGeometry.accessibleHandles(aspectRatio).forEach { handle ->
        val isFrame = handle == CropOverlayHandle.CENTER
        val label = stringResource(handleLabelRes(handle))
        val moves = if (isFrame) CropFrameMove.entries.map { move ->
            CustomAccessibilityAction(stringResource(moveLabelRes(move))) {
                val next = CropGeometry.moved(rect, move, imageDisplayRect, minCropSize)
                if (next != null) { onInteraction(); onCropRectChange(next) }
                next != null
            }
        } else emptyList()
        val center = handleCenter(rect, handle)
        Box(
            Modifier
                .offset { IntOffset((center.first - hit / 2f).roundToInt(), (center.second - hit / 2f).roundToInt()) }
                .size(CropGeometry.HANDLE_HIT_AREA_DP.dp)
                .semantics {
                    contentDescription = label
                    stateDescription = if (isFrame) "$sizeValue. $positionValue" else sizeValue
                    customActions = listOf(
                        CustomAccessibilityAction(grow) { step(handle, true) },
                        CustomAccessibilityAction(shrink) { step(handle, false) },
                    ) + moves
                },
        )
    }
}

internal fun handleCenter(rect: CropRect, handle: CropOverlayHandle): Pair<Float, Float> = when (handle) {
    CropOverlayHandle.TOP_LEFT -> rect.left to rect.top
    CropOverlayHandle.TOP_RIGHT -> rect.right to rect.top
    CropOverlayHandle.BOTTOM_LEFT -> rect.left to rect.bottom
    CropOverlayHandle.BOTTOM_RIGHT -> rect.right to rect.bottom
    CropOverlayHandle.TOP -> rect.centerX to rect.top
    CropOverlayHandle.BOTTOM -> rect.centerX to rect.bottom
    CropOverlayHandle.LEFT -> rect.left to rect.centerY
    CropOverlayHandle.RIGHT -> rect.right to rect.centerY
    CropOverlayHandle.CENTER, CropOverlayHandle.NONE -> rect.centerX to rect.centerY
}
