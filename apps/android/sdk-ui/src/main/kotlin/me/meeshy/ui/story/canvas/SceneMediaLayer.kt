package me.meeshy.ui.story.canvas

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.wrapContentSize
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.layout
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.Constraints
import coil.compose.AsyncImage
import me.meeshy.sdk.model.StoryMediaCrop
import me.meeshy.sdk.model.StoryMediaKind
import me.meeshy.sdk.model.scene.MeeshySceneObject
import me.meeshy.sdk.model.scene.SceneMediaFrame
import me.meeshy.sdk.model.scene.SceneMediaLayerRules
import kotlin.math.max
import kotlin.math.roundToInt

internal const val SCENE_MEDIA_TAG: String = "scene-media"
private const val MEDIA_CORNER_FRACTION = 0.06f

/**
 * Un média de premier plan (image, GIF / APNG animé ou vidéo) : cadre en pourcentage de la largeur design posé sur son
 * ancre, tourné autour d'elle, échelle servie, rognage non destructif. Une image retouchée du composeur (bitmap en
 * mémoire) prime sur l'adresse ; sans source, ou en erreur, l'élément est ignoré (jamais de spinner sur un cache non vide).
 */
@Composable
internal fun SceneMediaLayer(
    node: SceneNode,
    events: SceneCanvasEvents,
    modifier: Modifier = Modifier,
    environment: SceneMediaEnvironment = SceneMediaEnvironment.Default,
) {
    val media = (node.item.source as? MeeshySceneObject.Media)?.value ?: return
    val bitmap = environment.bitmapOf(media.id)
    val source = SceneMediaLayerRules.imageSource(media, node.mediaUrl, hasMemoryBitmap = bitmap != null)
    val isVideo = media.kind == StoryMediaKind.VIDEO
    if (source == SceneMediaLayerRules.ImageSource.None && !(isVideo && node.mediaUrl != null)) return
    var failed by remember(node.mediaUrl) { mutableStateOf(false) }
    if (failed) return
    val pose = node.item.pose
    val crop = SceneMediaLayerRules.crop(media)
    BoxWithConstraints(modifier.fillMaxSize()) {
        val frame = SceneMediaFrame.of(media, pose, canvasAspect = (maxHeight / maxWidth).toDouble())
        val width = maxWidth * frame.widthFraction.toFloat()
        val height = maxWidth * frame.heightFraction.toFloat()
        val frameModifier = Modifier
            .wrapContentSize(Alignment.TopStart, unbounded = true)
            .offset(x = maxWidth * frame.left.toFloat(), y = maxWidth * frame.top.toFloat())
            .size(width, height)
            .graphicsLayer {
                transformOrigin = TransformOrigin(frame.pivotX, frame.pivotY)
                rotationZ = frame.rotationDegrees
                scaleX = frame.layerScale
                scaleY = frame.layerScale
            }
            .alpha(pose.opacity.toFloat().coerceIn(0f, 1f))
            .clip(RoundedCornerShape(minOf(width, height) * MEDIA_CORNER_FRACTION))
            .testTag(SCENE_MEDIA_TAG)
        val content = Modifier.sceneCroppedSource(crop)
        when {
            bitmap != null -> {
                Image(bitmap.asImageBitmap(), null, frameModifier.then(content), contentScale = ContentScale.Crop)
            }
            isVideo -> {
                val url = node.mediaUrl.orEmpty()
                SceneVideoSurface(
                    url = url,
                    knownPoster = environment.posterOf(media.id),
                    window = SceneMediaLayerRules.sourceWindow(media),
                    volume = SceneMediaLayerRules.playbackVolume(media, environment.globalMuted, environment.muteLocked),
                    loop = media.loop,
                    play = environment.playsVideo,
                    modifier = frameModifier.then(content),
                )
            }
            source is SceneMediaLayerRules.ImageSource.Remote -> {
                val url = source.url
                val context = LocalContext.current
                AsyncImage(
                    model = sceneImageRequest(context, url, constraints.maxWidth, crop, environment.versionOf(url)),
                    contentDescription = null,
                    contentScale = ContentScale.Crop,
                    onSuccess = { events.onImageResolved(url) },
                    onError = {
                        failed = true
                        events.onImageResolved(url)
                    },
                    modifier = frameModifier.then(content),
                )
            }
        }
    }
}

/** Peint la source ENTIÈRE derrière le cadre qui n'en montre que [crop] : la source est mesurée plus grande et décalée, le cadre la coupe. */
internal fun Modifier.sceneCroppedSource(crop: StoryMediaCrop?): Modifier {
    if (crop == null || crop.isFull) return this
    return layout { measurable, constraints ->
        val width = constraints.maxWidth
        val height = constraints.maxHeight
        if (width == Constraints.Infinity || height == Constraints.Infinity) {
            val placeable = measurable.measure(constraints)
            return@layout layout(placeable.width, placeable.height) { placeable.place(0, 0) }
        }
        val layoutOfSource = crop.layoutIn(width.toDouble(), height.toDouble())
        val placeable = measurable.measure(
            Constraints.fixed(max(1, layoutOfSource.sourceWidth.roundToInt()), max(1, layoutOfSource.sourceHeight.roundToInt())),
        )
        layout(width, height) { placeable.place(layoutOfSource.offsetX.roundToInt(), layoutOfSource.offsetY.roundToInt()) }
    }
}
