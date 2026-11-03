package me.meeshy.ui.story.canvas

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Constraints
import me.meeshy.sdk.model.StoryLocationObject
import me.meeshy.sdk.model.scene.SceneLocationPillMetrics
import me.meeshy.sdk.model.scene.SceneTapFrame
import me.meeshy.sdk.model.scene.StoryLocationTapFrame
import me.meeshy.ui.R
import me.meeshy.ui.sticker.template.StickerTemplateMetrics
import me.meeshy.ui.sticker.template.StickerTemplateRegistry

/**
 * Le cadre tapable (px du canevas) d'une pastille de lieu, calé sur le badge que [SceneLocationLayer] dessine : même
 * style, même mesure, même gabarit du registre. [minimumSidePx] garde une cible d'au moins 48 dp à un badge minuscule.
 */
@Composable
public fun rememberSceneLocationTapFrame(
    location: StoryLocationObject,
    canvasWidthPx: Float,
    canvasHeightPx: Float,
    minimumSidePx: Float,
): SceneTapFrame {
    val density = LocalDensity.current
    val measurer = rememberTextMeasurer()
    val here = stringResource(R.string.scene_location_here)
    return remember(location, canvasWidthPx, canvasHeightPx, minimumSidePx, here, density) {
        val width = canvasWidthPx.toDouble()
        val templateId = location.drawnTemplateId()
        val measures = SceneLocationPillMetrics.measures(width, location.scale)
        val templateSize = templateId?.let {
            val unit = 1f / density.density
            val metrics = StickerTemplateMetrics(
                measures.fontSize.toFloat() * unit,
                measures.horizontalPadding.toFloat() * unit,
                measures.verticalPadding.toFloat() * unit,
                measures.gap.toFloat() * unit,
            )
            StickerTemplateRegistry.measuredSize(it, SceneLocationPillMetrics.slots(location.place, here), metrics)
        }
        if (templateSize != null) {
            StoryLocationTapFrame.ofSize(
                location, width, canvasHeightPx.toDouble(),
                templateSize.width * density.density.toDouble(), templateSize.height * density.density.toDouble(),
                minimumSidePx.toDouble(),
            )
        } else {
            val text = measurer.measure(
                text = SceneLocationPillMetrics.label(location.place, here),
                style = sceneLocationTextStyle(measures.fontSize.toFloat(), density),
                overflow = TextOverflow.Ellipsis,
                maxLines = 1,
                constraints = Constraints(maxWidth = SceneLocationPillMetrics.maxTextWidth(measures, width).toInt().coerceAtLeast(0)),
            )
            StoryLocationTapFrame.of(
                location, width, canvasHeightPx.toDouble(),
                text.size.width.toDouble(), text.size.height.toDouble(), minimumSidePx.toDouble(),
            )
        }
    }
}
