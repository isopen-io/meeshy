package me.meeshy.ui.story.canvas

import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.wrapContentSize
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.testTag
import coil.compose.AsyncImage
import me.meeshy.sdk.model.scene.MeeshySceneObject
import me.meeshy.sdk.model.scene.SceneItemLayout

internal const val SCENE_MEDIA_TAG: String = "scene-media"
private const val MEDIA_CORNER_FRACTION = 0.06f

/**
 * Un média posé : image à sa place, à sa pose servie (position, échelle, rotation, opacité). Un média sans adresse
 * (hors ligne, pas encore arrivé) ou une vidéo (les lecteurs vidéo restent ceux de l'hôte) ne peignent rien.
 */
@Composable
internal fun SceneMediaLayer(node: SceneNode, events: SceneCanvasEvents, modifier: Modifier = Modifier) {
    val media = (node.item.source as? MeeshySceneObject.Media)?.value ?: return
    val url = node.mediaUrl ?: return
    if (media.mediaType != "image") return
    val (widthFraction, heightFraction) = SceneItemLayout.mediaSize(node.item) ?: return
    val pose = node.item.pose
    BoxWithConstraints(modifier.fillMaxSize()) {
        val width = maxWidth * widthFraction.toFloat()
        val height = maxWidth * heightFraction.toFloat()
        AsyncImage(
            model = url,
            contentDescription = null,
            contentScale = ContentScale.Crop,
            onSuccess = { events.onImageResolved(url) },
            onError = { events.onImageResolved(url) },
            modifier = Modifier
                .wrapContentSize(Alignment.TopStart, unbounded = true)
                .offset(x = maxWidth * pose.x.toFloat() - width / 2, y = maxHeight * pose.y.toFloat() - height / 2)
                .size(width, height)
                .graphicsLayer { rotationZ = pose.rotation.toFloat() }
                .alpha(pose.opacity.toFloat().coerceIn(0f, 1f))
                .clip(RoundedCornerShape(minOf(width, height) * MEDIA_CORNER_FRACTION))
                .testTag(SCENE_MEDIA_TAG),
        )
    }
}
