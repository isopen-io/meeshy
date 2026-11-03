package me.meeshy.ui.story.canvas

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.wrapContentSize
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.IntSize
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import me.meeshy.sdk.model.scene.CanvasGeometry
import me.meeshy.sdk.model.scene.MeeshySceneObject
import me.meeshy.ui.theme.hexColor

internal const val SCENE_TEXT_TAG: String = "scene-text"

/**
 * Un texte : le texte SERVI par le plan (Prisme), à sa pose. La taille suit la largeur de la scène (design 1080),
 * donc une tuile et un plein écran gardent les mêmes proportions.
 */
@Composable
internal fun SceneTextLayer(node: SceneNode, modifier: Modifier = Modifier) {
    val text = (node.item.source as? MeeshySceneObject.Text)?.value ?: return
    val shown = node.item.displayText?.takeIf { it.isNotEmpty() } ?: return
    val pose = node.item.pose
    BoxWithConstraints(modifier.fillMaxSize()) {
        val density = LocalDensity.current
        val widthPx = with(density) { maxWidth.toPx() }
        val fontPx = (text.fontSize * pose.scale * CanvasGeometry.scaleFactor(widthPx.toDouble())).toFloat()
        var measured by remember { mutableStateOf(IntSize.Zero) }
        Box(
            Modifier
                .wrapContentSize(Alignment.TopStart, unbounded = true)
                .offset(
                    x = maxWidth * pose.x.toFloat() - with(density) { (measured.width / 2f).toDp() },
                    y = maxHeight * pose.y.toFloat() - with(density) { (measured.height / 2f).toDp() },
                )
                .onSizeChanged { measured = it }
                .graphicsLayer { rotationZ = pose.rotation.toFloat() }
                .alpha(pose.opacity.toFloat().coerceIn(0f, 1f))
                .testTag(SCENE_TEXT_TAG),
        ) {
            Text(
                text = shown,
                color = text.textColor?.let { hexColor(it, Color.White) } ?: Color.White,
                fontSize = with(density) { fontPx.toSp() },
                fontWeight = FontWeight.Bold,
                textAlign = when (text.textAlign) {
                    "left" -> TextAlign.Start
                    "right" -> TextAlign.End
                    else -> TextAlign.Center
                },
            )
        }
    }
}
