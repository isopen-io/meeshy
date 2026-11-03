package me.meeshy.ui.story.canvas

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.wrapContentSize
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import coil.compose.AsyncImage
import me.meeshy.sdk.model.scene.MeeshySceneObject
import me.meeshy.sdk.model.scene.SceneItemLayout
import me.meeshy.ui.sticker.StickerTemplateArtwork

internal const val SCENE_STICKER_TAG: String = "scene-sticker"
private const val GLYPH_FRACTION = 0.8f
private const val TEMPLATE_BODY_FRACTION = 0.16f

/**
 * Un sticker (emoji, image intégrée ou gabarit), à la pose servie du plan : rotation, échelle (keyframes comprises),
 * fondus et fenêtres sont déjà résolus par le plan. L'image prime sur l'emoji, qui ne tient la place que tant qu'elle charge.
 */
@Composable
internal fun SceneStickerLayer(node: SceneNode, events: SceneCanvasEvents, modifier: Modifier = Modifier) {
    val sticker = (node.item.source as? MeeshySceneObject.Sticker)?.value ?: return
    val pose = node.item.pose
    val drawn = SceneItemLayout.stickerSide(node.item)
    BoxWithConstraints(modifier.fillMaxSize()) {
        val side = maxWidth * drawn.layout.toFloat()
        val density = LocalDensity.current
        Box(
            modifier = Modifier
                .wrapContentSize(Alignment.TopStart, unbounded = true)
                .offset(x = maxWidth * pose.x.toFloat() - side / 2, y = maxHeight * pose.y.toFloat() - side / 2)
                .size(side)
                .graphicsLayer {
                    rotationZ = pose.rotation.toFloat()
                    scaleX = drawn.layerFloat
                    scaleY = drawn.layerFloat
                }
                .alpha(pose.opacity.toFloat().coerceIn(0f, 1f))
                .testTag(SCENE_STICKER_TAG),
            contentAlignment = Alignment.Center,
        ) {
            if (sticker.templateId.isNotBlank()) {
                StickerTemplateArtwork(sticker.templateId, sticker.slots, body = side * TEMPLATE_BODY_FRACTION)
            } else {
                var imageShown by remember(node.mediaUrl) { mutableStateOf(false) }
                if (sticker.emoji.isNotBlank() && !imageShown) {
                    Text(text = sticker.emoji, fontSize = with(density) { (side * GLYPH_FRACTION).toSp() }, maxLines = 1)
                }
                node.mediaUrl?.let { url ->
                    AsyncImage(
                        model = url,
                        contentDescription = null,
                        contentScale = ContentScale.Fit,
                        modifier = Modifier.fillMaxSize(),
                        onSuccess = { imageShown = true; events.onImageResolved(url) },
                        onError = { events.onImageResolved(url) },
                    )
                }
            }
        }
    }
}
