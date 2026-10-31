package me.meeshy.app.stories

import android.graphics.Bitmap
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.AnimationVector1D
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.requiredSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.rememberGraphicsLayer
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalView
import java.io.File
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import me.meeshy.sdk.media.scene.SceneExportLog
import me.meeshy.ui.theme.hexColor

/**
 * Peint la slide à chaque instant demandé, à la taille de la vidéo : le contenu s'enregistre dans un calque graphique
 * sans jamais se dessiner à l'écran. Le fond n'y entre que lorsqu'aucune vidéo ne le porte ; les vidéos posées s'y
 * montrent à leur affiche ; la légende y est gravée.
 */
@Composable
internal fun StoryExportPainter(request: StoryExportPaintRequest, onPainted: (List<File>?) -> Unit) {
    val density = LocalDensity.current
    val layer = rememberGraphicsLayer()
    val recording = remember { StoryExportLayerRecording() }
    var passes by remember { mutableIntStateOf(0) }
    val view = LocalView.current
    val progress = remember(request) { Animatable(0f) }
    var imageReady by remember(request) { mutableStateOf(!request.withBackground || request.slide.imageUrl == null) }
    val durationMs = request.durationMillis.coerceIn(1L, Int.MAX_VALUE.toLong()).toInt()
    val width = with(density) { request.format.width.toDp() }
    val height = with(density) { request.format.height.toDp() }

    StoryExportScene(
        slide = request.slide,
        withBackground = request.withBackground,
        progress = progress,
        slideDurationMs = durationMs,
        onImageResolved = { imageReady = true },
        modifier = Modifier
            .requiredSize(width, height)
            .drawWithContent {
                if (passes >= 0) recording.pass { layer.record { recording.record { this@drawWithContent.drawContent() } } }
            },
    )
    LaunchedEffect(request) {
        val files = try {
            withTimeoutOrNull(IMAGE_WAIT_MILLIS) { snapshotFlow { imageReady }.first { it } }
            delay(WARM_UP_MILLIS)
            request.frames.mapIndexed { index, frame ->
                progress.snapTo((frame.startMillis.toFloat() / durationMs).coerceIn(0f, 1f))
                repeat(SETTLE_FRAMES) { withFrameNanos { } }
                val captured = recording.capture(
                    capture = { layer.toImageBitmap() },
                    redraw = {
                        SceneExportLog.info("calque rejoué hors de son passage de dessin (fenêtre attachée : ${view.isAttachedToWindow}), repeint")
                        passes++
                        repeat(SETTLE_FRAMES) { withFrameNanos { } }
                    },
                )
                writeLayer(captured, request, File(request.directory, if (request.still) STILL_LAYER_NAME else "calque-$index.png"))
            }
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (failure: Exception) {
            SceneExportLog.warn("calques non peints (${request.frames.size} images, ${request.directory.name})", failure)
            null
        }
        onPainted(files)
    }
}

private suspend fun writeLayer(image: ImageBitmap, request: StoryExportPaintRequest, target: File): File {
    val captured = image.asAndroidBitmap().copy(Bitmap.Config.ARGB_8888, false)
    return withContext(Dispatchers.IO) {
        val sized = if (captured.width == request.format.width && captured.height == request.format.height) captured
        else Bitmap.createScaledBitmap(captured, request.format.width, request.format.height, true)
        try {
            target.outputStream().use {
                if (request.still) sized.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, it)
                else sized.compress(Bitmap.CompressFormat.PNG, PNG_QUALITY, it)
            }
        } finally {
            if (sized !== captured) sized.recycle()
            captured.recycle()
        }
        target
    }
}

private const val IMAGE_WAIT_MILLIS = 5_000L
private const val WARM_UP_MILLIS = 600L
private const val SETTLE_FRAMES = 3
private const val PNG_QUALITY = 100
private const val JPEG_QUALITY = 95
private const val STILL_LAYER_NAME = "scene.jpg"

/**
 * Ce que la vidéo montre d'une slide : son fond quand aucune vidéo ne le porte, ses objets à l'instant de [progress], et la
 * légende (`slide.text`) telle que le lecteur l'ouvre.
 */
@Composable
internal fun StoryExportScene(
    slide: StorySlideView,
    withBackground: Boolean,
    progress: Animatable<Float, AnimationVector1D>,
    slideDurationMs: Int,
    onImageResolved: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    Box(modifier) {
        if (withBackground) {
            Box(Modifier.fillMaxSize().background(hexColor(slide.accentHex)))
            StorySceneBackground(
                slide = slide,
                playing = false,
                muted = true,
                stillFrame = true,
                onImageResolved = onImageResolved,
            )
        }
        StorySceneOverlays(
            slide = slide,
            progress = progress,
            slideDurationMs = slideDurationMs,
            playing = false,
            muted = true,
            players = false,
        )
        if (slide.text.isNotBlank()) StoryExportCaption(slide.text, Modifier.align(Alignment.BottomStart))
    }
}

internal const val STORY_EXPORT_CAPTION_TAG = "stories.export.caption"
