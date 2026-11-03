package me.meeshy.ui.story.canvas

import android.content.ComponentCallbacks2
import android.content.res.Configuration
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.wrapContentSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import coil.compose.AsyncImage
import me.meeshy.sdk.model.StickerAnimation
import me.meeshy.sdk.model.StorySticker
import me.meeshy.sdk.model.scene.MeeshySceneObject
import me.meeshy.sdk.model.scene.SceneItemLayout
import me.meeshy.sdk.model.scene.SceneStickerFrame
import me.meeshy.sdk.model.scene.StickerMotionFilter
import me.meeshy.sdk.model.sticker.StickerTemplateCatalog
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.sticker.StickerTemplateArtwork

internal const val SCENE_STICKER_TAG: String = "scene-sticker"
private const val TEMPLATE_BODY_FRACTION = 0.16f

/**
 * Un sticker (emoji, image/GIF intégrés ou gabarit), à la pose servie du plan : rotation, échelle (keyframes comprises),
 * fondus et fenêtres sont déjà résolus par le plan. L'emoji est un bitmap net à la taille rendue (cache purgé sur
 * `onTrimMemory`) ; l'image prime sur lui et le tient en place tant qu'elle charge ; un gabarit sans dessin retombe sur
 * son emoji de repli, jamais sur un vide. Le mouvement ne repose que la transformée et l'opacité de la couche.
 */
@Composable
internal fun SceneStickerLayer(node: SceneNode, events: SceneCanvasEvents, modifier: Modifier = Modifier) {
    val sticker = (node.item.source as? MeeshySceneObject.Sticker)?.value ?: return
    val pose = node.item.pose
    val drawn = SceneItemLayout.stickerSide(node.item)
    val motion = rememberStickerMotion(StickerMotionFilter.animation(node.item), sticker.id)
    BoxWithConstraints(modifier.fillMaxSize()) {
        val side = maxWidth * drawn.layout.toFloat()
        val density = LocalDensity.current
        val sidePx = with(density) { side.toPx() }
        Box(
            modifier = Modifier
                .wrapContentSize(Alignment.TopStart, unbounded = true)
                .offset(x = maxWidth * pose.x.toFloat() - side / 2, y = maxHeight * pose.y.toFloat() - side / 2)
                .size(side)
                .graphicsLayer {
                    val moving = motion()
                    rotationZ = pose.rotation.toFloat() + moving.rotationDegrees.toFloat()
                    scaleX = drawn.layerFloat * moving.scale.toFloat()
                    scaleY = drawn.layerFloat * moving.scale.toFloat()
                    translationX = (moving.offsetX * size.width).toFloat() * drawn.layerFloat
                    translationY = (moving.offsetY * size.height).toFloat() * drawn.layerFloat
                    alpha = moving.opacity.toFloat().coerceIn(0f, 1f)
                }
                .alpha(pose.opacity.toFloat().coerceIn(0f, 1f))
                .testTag(SCENE_STICKER_TAG),
            contentAlignment = Alignment.Center,
        ) {
            val rasterPx = SceneStickerFrame.rasterSide(sidePx * drawn.layer)
            when {
                sticker.templateId.isNotBlank() && StickerTemplateArtwork.knows(sticker.templateId) ->
                    StickerTemplateArtwork(sticker.templateId, sticker.slots, body = side * TEMPLATE_BODY_FRACTION)
                sticker.templateId.isNotBlank() -> StickerEmojiGlyph(templateFallbackEmoji(sticker), rasterPx)
                else -> ImageOverEmoji(node, sticker, events, rasterPx)
            }
        }
    }
}

private fun templateFallbackEmoji(sticker: StorySticker): String = sticker.wireEmoji(StickerTemplateCatalog::fallbackEmoji)

@Composable
private fun ImageOverEmoji(node: SceneNode, sticker: StorySticker, events: SceneCanvasEvents, rasterPx: Int) {
    var imageShown by remember(node.mediaUrl) { mutableStateOf(false) }
    if (sticker.emoji.isNotBlank() && !imageShown) StickerEmojiGlyph(sticker.emoji, rasterPx)
    val url = node.mediaUrl ?: return
    val context = LocalContext.current
    AsyncImage(
        model = StickerImageSource.request(context, url, rasterPx),
        imageLoader = StickerImageSource.loader(context),
        contentDescription = null,
        contentScale = ContentScale.Fit,
        modifier = Modifier.fillMaxSize(),
        onSuccess = { imageShown = true; events.onImageResolved(url) },
        onError = { events.onImageResolved(url) },
    )
}

@Composable
private fun StickerEmojiGlyph(emoji: String, rasterPx: Int) {
    val rasterizer = StickerEmojiRasterizer.shared
    val context = LocalContext.current
    DisposableEffect(context) {
        val callbacks = object : ComponentCallbacks2 {
            override fun onTrimMemory(level: Int) = rasterizer.onTrimMemory(level)
            override fun onConfigurationChanged(newConfig: Configuration) = Unit
            @Suppress("OVERRIDE_DEPRECATION")
            override fun onLowMemory() = rasterizer.clear()
        }
        context.applicationContext.registerComponentCallbacks(callbacks)
        onDispose { context.applicationContext.unregisterComponentCallbacks(callbacks) }
    }
    val bitmap = remember(emoji, rasterPx) { rasterizer.bitmap(emoji, rasterPx) } ?: return
    Image(bitmap = bitmap.asImageBitmap(), contentDescription = null, contentScale = ContentScale.Fit, modifier = Modifier.fillMaxSize())
}

/**
 * La pose de mouvement, lue dans la phase de DESSIN du calque (`graphicsLayer`) : l'horloge d'image écrit un état que
 * seule cette phase lit, donc la scène ne se recompose pas. Sans mouvement (ou animations réduites), aucune boucle.
 */
@Composable
private fun rememberStickerMotion(animation: StickerAnimation?, id: String): () -> StickerAnimation.Pose {
    val reduce = LocalReduceMotion.current
    var pose by remember(id) { mutableStateOf(StickerAnimation.Pose.IDENTITY) }
    LaunchedEffect(animation, reduce) {
        pose = StickerAnimation.Pose.IDENTITY
        if (animation == null || reduce) return@LaunchedEffect
        val clock = StickerMotionClock()
        while (!animation.isSettled(clock.elapsedSeconds)) {
            androidx.compose.runtime.withFrameNanos { clock.advance(it) }
            pose = animation.pose(clock.elapsedSeconds)
        }
        pose = StickerAnimation.Pose.IDENTITY
    }
    return { pose }
}
