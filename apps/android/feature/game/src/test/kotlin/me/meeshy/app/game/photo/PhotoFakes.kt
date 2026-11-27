package me.meeshy.app.game.photo

import android.graphics.Bitmap
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import java.io.File
import kotlinx.coroutines.CompletableDeferred
import me.meeshy.sdk.game.ReferralLinkProviding
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

/** Le lien de parrainage : un jeton déjà là ([existing]) ou celui que « Partager » crée ([created], `null` = refus). */
internal class FakeReferralLinks(var existing: String? = null, var created: String? = NEW_LINK) : ReferralLinkProviding {
    var reads = 0
    var creations = 0

    /** Retient la création tant qu'il n'est pas complété : un second toucher arrive pendant qu'elle court. */
    var gate: CompletableDeferred<Unit>? = null

    override suspend fun existingLink(): String? {
        reads++
        return existing
    }

    override suspend fun shareableLink(): String? {
        creations++
        gate?.await()
        return existing ?: created
    }

    companion object {
        const val NEW_LINK = "https://meeshy.me/join/new"
    }
}

internal val fakeReferralText = PhotoReferralText(
    title = "Rejoins-moi sur Meeshy",
    qrLabel = "QR code de ton lien d'invitation",
    shareText = { link -> "Rejoins-moi sur Meeshy : $link" },
)

internal fun fakeSession(
    moment: GamePhotoMoment,
    camera: FakeCamera = FakeCamera(),
    composer: FakeComposer = FakeComposer(),
    notebook: FakePhotoNotebook = FakePhotoNotebook(),
    gallery: FakeGallery = FakeGallery(),
    referralLinks: FakeReferralLinks? = null,
) = GamePhotoSession(
    moment, PhotoCanvasText("kicker", "Le titre du moment", "31 oct. 2026"), camera, composer, notebook, gallery,
    strikeMillis = 0, encodeSource = { byteArrayOf(7) },
    referralLinks = referralLinks, referralText = referralLinks?.let { fakeReferralText },
)

private fun pixel(): ImageBitmap = Bitmap.createBitmap(1, 1, Bitmap.Config.ARGB_8888).asImageBitmap()
