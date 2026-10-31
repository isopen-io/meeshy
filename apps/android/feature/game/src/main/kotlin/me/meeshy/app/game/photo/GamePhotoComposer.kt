package me.meeshy.app.game.photo

import android.graphics.Bitmap
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.wrapContentSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.graphics.layer.GraphicsLayer
import androidx.compose.ui.graphics.rememberGraphicsLayer
import androidx.compose.ui.unit.dp
import java.io.ByteArrayOutputStream
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import me.meeshy.sdk.model.game.photo.GamePhotoMoment
import me.meeshy.sdk.model.game.photo.PhotoFormat
import me.meeshy.sdk.model.game.photo.PhotoMode

/** L'image finale d'un moment, dans ses deux formats : prête à garder, enregistrer ou partager. */
class ComposedPhoto(
    val story: ImageBitmap,
    val square: ImageBitmap,
    val storyJpeg: ByteArray,
    val squareJpeg: ByteArray,
    val mode: PhotoMode,
)

/** Ce que le compositeur rend : la photo du moment (selfie retourné, galerie) ou la carte seule (`source` nulle). */
data class PhotoComposeRequest(
    val moment: GamePhotoMoment,
    val text: PhotoCanvasText,
    val source: Bitmap?,
    val mode: PhotoMode,
) {
    val background: PhotoBackground
        get() = source?.let { PhotoBackground.Photo(it, mirrored = mode == PhotoMode.Selfie) } ?: PhotoBackground.Card
}

/** LA COMPOSITION DE L'IMAGE (iOS `GamePhotoComposing`) — locale, sans réseau : aucune image ne quitte l'appareil. */
fun interface GamePhotoComposing {
    suspend fun compose(request: PhotoComposeRequest): ComposedPhoto?
}

/**
 * Le compositeur de l'appareil : il rend [GamePhotoCanvas] — la MÊME vue que l'aperçu — dans deux calques de la taille
 * de l'image finale (1 080 × 1 920 et 1 080 × 1 080), jamais peints à l'écran, puis les lit en JPEG q0,9. L'hôte
 * ([GamePhotoCaptureHost]) doit être monté dans le déroulé ; il attend que Mee et Meo soient chargés avant d'enregistrer.
 */
@Stable
class GamePhotoCanvasCapture : GamePhotoComposing {
    internal var request: PhotoComposeRequest? by mutableStateOf(null)
    internal var story: GraphicsLayer? = null
    internal var square: GraphicsLayer? = null
    @Volatile internal var recorded: PhotoComposeRequest? = null
    @Volatile internal var birdsReady: Boolean = false

    override suspend fun compose(request: PhotoComposeRequest): ComposedPhoto? {
        recorded = null
        birdsReady = false
        this.request = request
        repeat(MAX_FRAMES) {
            withFrameNanos { }
            if (recorded == request && birdsReady) return capture(request)
        }
        return if (recorded == request) capture(request) else null
    }

    private suspend fun capture(request: PhotoComposeRequest): ComposedPhoto? {
        val storyImage = story?.toImageBitmap() ?: return null
        val squareImage = square?.toImageBitmap() ?: return null
        return withContext(Dispatchers.Default) {
            ComposedPhoto(storyImage, squareImage, jpeg(storyImage), jpeg(squareImage), request.mode)
        }
    }

    private companion object {
        /** Une seconde et demie à 60 images/s : au-delà, la photo part sans attendre un film qui ne charge pas. */
        const val MAX_FRAMES = 90
        const val JPEG_QUALITY = 90

        fun jpeg(image: ImageBitmap): ByteArray {
            val bitmap = image.asAndroidBitmap().let { if (it.config == Bitmap.Config.HARDWARE) it.copy(Bitmap.Config.ARGB_8888, false) else it }
            return ByteArrayOutputStream().use { out ->
                bitmap.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, out)
                out.toByteArray()
            }
        }
    }
}

/**
 * L'hôte du compositeur : les deux formats se dessinent dans leurs calques, hors de l'écran (rien n'est peint par
 * l'hôte lui-même). Sans demande en cours, il ne compose rien.
 */
@Composable
fun GamePhotoCaptureHost(capture: GamePhotoCanvasCapture) {
    val request = capture.request ?: return
    val story = rememberGraphicsLayer()
    val square = rememberGraphicsLayer()
    capture.story = story
    capture.square = square
    Box(Modifier.size(0.dp)) {
        CaptureLayer(request, PhotoFormat.Story, story, onBirdsReady = { capture.birdsReady = it }) {
            capture.recorded = request
        }
        CaptureLayer(request, PhotoFormat.Square, square, onBirdsReady = {}) {}
    }
}

@Composable
private fun CaptureLayer(
    request: PhotoComposeRequest,
    format: PhotoFormat,
    layer: GraphicsLayer,
    onBirdsReady: (Boolean) -> Unit,
    onRecorded: () -> Unit,
) {
    GamePhotoCanvas(
        moment = request.moment,
        text = request.text,
        format = format,
        background = request.background,
        modifier = Modifier
            .wrapContentSize(Alignment.TopStart, unbounded = true)
            .drawWithContent {
                layer.record { this@drawWithContent.drawContent() }
                onRecorded()
            },
        onBirdsReady = onBirdsReady,
    )
}
