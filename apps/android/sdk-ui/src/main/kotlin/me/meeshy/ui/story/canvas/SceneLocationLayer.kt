package me.meeshy.ui.story.canvas

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.wrapContentSize
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.IntSize
import me.meeshy.sdk.model.StoryLocationObject
import me.meeshy.sdk.model.scene.MeeshySceneObject
import me.meeshy.sdk.model.scene.SceneLocationPillMetrics
import me.meeshy.ui.R
import me.meeshy.ui.component.sticker.StickerTemplateRenderer
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.sticker.template.StickerTemplateMetrics
import me.meeshy.ui.sticker.template.StickerTemplateRegistry
import me.meeshy.ui.theme.MeeshyPalette

internal const val SCENE_LOCATION_TAG: String = "scene-location"
private const val SURFACE_ALPHA = 0.94f
private const val HAIRLINE_FRACTION = 0.045f

/** Le style du nom sur la capsule native : le corps (en px rendus) ne suit pas la taille de police du système. */
internal fun sceneLocationTextStyle(fontPx: Float, density: Density): TextStyle =
    TextStyle(fontSize = with(density) { fontPx.toSp() }, fontWeight = FontWeight.SemiBold, color = MeeshyPalette.Indigo900)

/** Le gabarit de lieu du registre que ce lieu désigne ET que ce binaire sait dessiner ; sinon `null` (capsule native). */
internal fun StoryLocationObject.drawnTemplateId(): String? =
    SceneLocationPillMetrics.templateId(styleId)?.takeIf(StickerTemplateRegistry::knows)

/**
 * La pastille de lieu : une capsule claire à liseré indigo, l'épingle de marque puis le nom du lieu (miroir de
 * `StoryLocationLayer`, iOS). Les mesures de design (corps 42, marges 22 et 14, espacement 10) sont projetées par le
 * facteur de la géométrie : une tuile, un plein écran et un export gardent les mêmes proportions. Le plan fournit la
 * pose (fenêtre, fondus, opacité) comme pour ses sœurs ; quand le style désigne un gabarit du registre, il le dessine,
 * sinon la capsule native. Le libellé d'accessibilité est « Lieu » suivi du nom servi.
 */
@Composable
internal fun SceneLocationLayer(node: SceneNode, modifier: Modifier = Modifier) {
    val location = (node.item.source as? MeeshySceneObject.Place)?.value ?: return
    val pose = node.item.pose
    val here = stringResource(R.string.scene_location_here)
    val label = SceneLocationPillMetrics.label(location.place, here)
    val spoken = stringResource(R.string.scene_location_a11y, label)
    BoxWithConstraints(modifier.fillMaxSize()) {
        val density = LocalDensity.current
        val widthPx = with(density) { maxWidth.toPx() }
        val measures = SceneLocationPillMetrics.measures(widthPx.toDouble(), pose.scale)
        var measured by remember { mutableStateOf(IntSize.Zero) }
        val anchor = location.anchor
        Box(
            Modifier
                .wrapContentSize(Alignment.TopStart, unbounded = true)
                .offset(
                    x = maxWidth * pose.x.toFloat() - with(density) { (measured.width * anchor.x.toFloat()).toDp() },
                    y = maxHeight * pose.y.toFloat() - with(density) { (measured.height * anchor.y.toFloat()).toDp() },
                )
                .onSizeChanged { measured = it }
                .graphicsLayer {
                    rotationZ = pose.rotation.toFloat()
                    transformOrigin = TransformOrigin(anchor.x.toFloat(), anchor.y.toFloat())
                }
                .alpha(pose.opacity.toFloat().coerceIn(0f, 1f))
                .semantics(mergeDescendants = true) { contentDescription = spoken }
                .testTag(SCENE_LOCATION_TAG),
        ) {
            val templateId = location.drawnTemplateId()
            if (templateId != null) {
                val unit = 1f / density.density
                StickerTemplateRenderer(
                    templateId = templateId,
                    slots = SceneLocationPillMetrics.slots(location.place, here),
                    metrics = StickerTemplateMetrics(
                        fontSize = measures.fontSize.toFloat() * unit,
                        horizontalPadding = measures.horizontalPadding.toFloat() * unit,
                        verticalPadding = measures.verticalPadding.toFloat() * unit,
                        gap = measures.gap.toFloat() * unit,
                    ),
                )
            } else {
                NativePill(label, measures, SceneLocationPillMetrics.maxTextWidth(measures, widthPx.toDouble()).toFloat())
            }
        }
    }
}

@Composable
private fun NativePill(label: String, measures: SceneLocationPillMetrics.Measures, maxTextPx: Float) {
    val density = LocalDensity.current
    val hairline = with(density) { maxOf(1f, measures.fontSize.toFloat() * HAIRLINE_FRACTION).toDp() }
    Row(
        modifier = Modifier
            .background(MeeshyPalette.Indigo50.copy(alpha = SURFACE_ALPHA), CircleShape)
            .border(BorderStroke(hairline, MeeshyPalette.Indigo300), CircleShape)
            .padding(
                horizontal = with(density) { measures.horizontalPadding.toFloat().toDp() },
                vertical = with(density) { measures.verticalPadding.toFloat().toDp() },
            ),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(with(density) { measures.gap.toFloat().toDp() }),
    ) {
        Icon(
            imageVector = MeeshyIcons.LocationFilled,
            contentDescription = null,
            tint = MeeshyPalette.Error,
            modifier = Modifier.size(with(density) { measures.pinSide.toFloat().toDp() }),
        )
        Text(
            text = label,
            style = sceneLocationTextStyle(measures.fontSize.toFloat(), density),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.widthIn(max = with(density) { maxTextPx.toDp() }),
        )
    }
}
