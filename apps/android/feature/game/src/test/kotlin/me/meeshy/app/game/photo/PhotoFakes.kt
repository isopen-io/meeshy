package me.meeshy.app.game.photo

import android.graphics.Bitmap
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import java.io.File
import me.meeshy.sdk.media.CaptureGallery
import me.meeshy.sdk.model.game.photo.CameraFailure
import me.meeshy.sdk.model.game.photo.GamePhotoMoment

internal class FakeCamera(var failure: CameraFailure? = null, var shot: Bitmap? = Bitmap.createBitmap(4, 8, Bitmap.Config.ARGB_8888)) :
    GamePhotoCamera {
    var stops = 0
    override suspend fun start(): CameraFailure? = failure
    override suspend fun capture(): Bitmap? = shot
    override fun stop() {
        stops++
    }

    @Composable override fun Preview(modifier: Modifier) = Unit
}

internal class FakeGallery(var succeeds: Boolean = true) : CaptureGallery {
    val saved = mutableListOf<Pair<ByteArray, String>>()
    override suspend fun saveImage(jpeg: ByteArray, displayName: String): Boolean {
        saved += jpeg to displayName
        return succeeds
    }

    override suspend fun saveVideo(file: File, displayName: String): Boolean = false
}

/** Un compositeur qui rend deux images d'un pixel et des octets reconnaissables : story 1, carré 2. */
internal class FakeComposer(var fails: Boolean = false) : GamePhotoComposing {
    val requests = mutableListOf<PhotoComposeRequest>()
    override suspend fun compose(request: PhotoComposeRequest): ComposedPhoto? {
        requests += request
        return if (fails) null else ComposedPhoto(pixel(), pixel(), byteArrayOf(1), byteArrayOf(2), request.mode)
    }
}

internal fun fakeSession(
    moment: GamePhotoMoment,
    camera: FakeCamera = FakeCamera(),
    composer: FakeComposer = FakeComposer(),
    notebook: FakePhotoNotebook = FakePhotoNotebook(),
    gallery: FakeGallery = FakeGallery(),
) = GamePhotoSession(
    moment, PhotoCanvasText("kicker", "Le titre du moment", "31 oct. 2026"), camera, composer, notebook, gallery,
    strikeMillis = 0, encodeSource = { byteArrayOf(7) },
)

private fun pixel(): ImageBitmap = Bitmap.createBitmap(1, 1, Bitmap.Config.ARGB_8888).asImageBitmap()
