package me.meeshy.app.game.photo

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.Bitmap
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleOwner
import java.io.File
import java.util.UUID
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import me.meeshy.sdk.model.composer.capture.CaptureLensFacing
import me.meeshy.sdk.model.game.photo.CameraFailure
import me.meeshy.ui.component.capture.CameraXCaptureEngine
import me.meeshy.ui.component.capture.CaptureEngineSignal
import me.meeshy.ui.component.retouch.RetouchSourceDecoder

/**
 * LA CAMÉRA DU DÉROULÉ (iOS `GamePhotoCameraProviding`) : la caméra AVANT, ouverte à la demande, rendue à [stop]. Un
 * refus se NOMME ([CameraFailure]) ; la galerie et la carte seule restent possibles.
 */
interface GamePhotoCamera {
    /** `null` : la caméra vit ; sinon, pourquoi elle ne s'ouvre pas. */
    suspend fun start(): CameraFailure?

    /** La prise, debout (orientation appliquée) ; `null` si elle échoue. */
    suspend fun capture(): Bitmap?

    fun stop()

    @Composable
    fun Preview(modifier: Modifier)
}

/** La caméra de l'appareil, sur le moteur CameraX du viewfinder ([CameraXCaptureEngine]). */
class CameraXGamePhotoCamera(private val context: Context, lifecycleOwner: LifecycleOwner) : GamePhotoCamera {

    private var bound: CompletableDeferred<CameraFailure?>? = null
    private var shot: CompletableDeferred<File?>? = null
    private val engine = CameraXCaptureEngine(context, lifecycleOwner, ::onSignal)

    private fun onSignal(signal: CaptureEngineSignal) {
        when (signal) {
            is CaptureEngineSignal.Bound -> bound?.complete(null)
            is CaptureEngineSignal.BindFailed -> bound?.complete(CameraFailure.Unavailable)
            is CaptureEngineSignal.PhotoSaved -> shot?.complete(signal.file)
            is CaptureEngineSignal.PhotoFailed -> shot?.complete(null)
            else -> Unit
        }
    }

    override suspend fun start(): CameraFailure? {
        if (!context.packageManager.hasSystemFeature(PackageManager.FEATURE_CAMERA_ANY)) return CameraFailure.Unsupported
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            return CameraFailure.Denied
        }
        val waiting = CompletableDeferred<CameraFailure?>().also { bound = it }
        engine.bind(CaptureLensFacing.FRONT)
        return withTimeoutOrNull(BIND_TIMEOUT_MILLIS) { waiting.await() } ?: CameraFailure.Unavailable
    }

    override suspend fun capture(): Bitmap? {
        val directory = File(context.cacheDir, "captures").apply { mkdirs() }
        val file = File(directory, "game-photo-${UUID.randomUUID()}.jpg")
        val waiting = CompletableDeferred<File?>().also { shot = it }
        engine.takePhoto(file.name, file)
        val saved = withTimeoutOrNull(CAPTURE_TIMEOUT_MILLIS) { waiting.await() } ?: return null
        return withContext(Dispatchers.IO) {
            try {
                RetouchSourceDecoder.decode(saved.readBytes(), SOURCE_LONG_SIDE)
            } finally {
                saved.delete()
            }
        }
    }

    override fun stop() = engine.release()

    @Composable
    override fun Preview(modifier: Modifier) = engine.PreviewSurface(modifier)

    private companion object {
        const val BIND_TIMEOUT_MILLIS = 8_000L
        const val CAPTURE_TIMEOUT_MILLIS = 8_000L
        /** La prise est décodée au plus près de la story (1 920 px de grand côté), jamais 12 Mpx en mémoire. */
        const val SOURCE_LONG_SIDE = 1920
    }
}
