package me.meeshy.app.game.photo

import android.graphics.Bitmap
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import java.io.ByteArrayOutputStream
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import me.meeshy.sdk.media.CaptureGallery
import me.meeshy.sdk.model.composer.capture.CaptureOrigin
import me.meeshy.sdk.model.composer.capture.CaptureSaveLaw
import me.meeshy.sdk.model.composer.capture.CaptureZone
import me.meeshy.sdk.model.composer.capture.SavedVersion
import me.meeshy.sdk.model.composer.capture.TakeSaveState
import me.meeshy.sdk.model.game.photo.CameraFailure
import me.meeshy.sdk.model.game.photo.GamePhotoFlow
import me.meeshy.sdk.model.game.photo.GamePhotoMoment
import me.meeshy.sdk.model.game.photo.GamePhotoNotebookIndex
import me.meeshy.sdk.model.game.photo.NotebookKeepOutcome
import me.meeshy.sdk.model.game.photo.NotebookRecipe
import me.meeshy.sdk.model.game.photo.PhotoCameraPhase
import me.meeshy.sdk.model.game.photo.PhotoFlowEvent
import me.meeshy.sdk.model.game.photo.PhotoFlowState
import me.meeshy.sdk.model.game.photo.PhotoFormat
import me.meeshy.sdk.model.game.photo.PhotoMode

/** Ce que le déroulé dit après un geste — un ton et une phrase, jamais un code. */
enum class PhotoNotice(val good: Boolean) {
    Kept(true),
    NoSpace(false),
    KeepFailed(false),
    Saved(true),
    SaveFailed(false),
    Shared(true),
}

/**
 * LE DÉROULÉ D'UNE PHOTO (iOS `GamePhotoSession`, #9382, #13891) :
 *
 *  1. Mee propose : « On immortalise ? » — Selfie avec nous, Carte seule, Plus tard.
 *  2. Selfie : caméra avant, cadre du moment en surimpression ; LE CADRE EST LE DÉCLENCHEUR — sa case prend la photo et
 *     l'enregistre dans la galerie, la scène touchée deux fois la prend sans l'enregistrer (`CaptureSaveLaw`).
 *  3. Au déclenchement, Mee et Meo frappent l'emblème en place : la photo se fige.
 *  4. 9:16 pour la story, 1:1 pour le profil : enregistrer, partager, ou garder dans la Chronique.
 *  5. « Plus tard » laisse le moment en attente dans la Chronique, sans échéance.
 *
 * L'étape vit dans [GamePhotoFlow] (réducteur pur) ; cette classe y branche les effets, chacun INJECTÉ pour que le
 * déroulé se teste sans objectif ni disque. Aucune image n'est envoyée au serveur.
 */
@Stable
class GamePhotoSession(
    val moment: GamePhotoMoment,
    val text: PhotoCanvasText,
    val camera: GamePhotoCamera,
    private val composer: GamePhotoComposing,
    private val notebook: GamePhotoNotebooking,
    private val gallery: CaptureGallery,
    private val strikeMillis: Long = STRIKE_MILLIS,
    private val onStrike: () -> Unit = {},
    private val encodeSource: (Bitmap) -> ByteArray? = ::sourceJpeg,
) {
    var state: PhotoFlowState by mutableStateOf(PhotoFlowState.Offer)
        private set

    /** L'image figée pendant la frappe (selfie ou galerie) ; `null` pour la carte seule. */
    var frozen: Bitmap? by mutableStateOf(null)
        private set

    /** L'emblème se pose : 0 → 1 pendant la frappe en place. */
    var strike: Float by mutableStateOf(0f)
        private set

    var composed: ComposedPhoto? by mutableStateOf(null)
        private set

    var notice: PhotoNotice? by mutableStateOf(null)
        private set

    var squareFormat: Boolean by mutableStateOf(false)
        private set

    private var takeSave: TakeSaveState? by mutableStateOf(null)
    private var composedSource: Bitmap? = null
    private var taking = false

    /** « Enregistrer » n'existe que s'il sert : une prise déjà dans la galerie dans ce format ne le montre pas. */
    val showsSave: Boolean get() = takeSave?.let(CaptureSaveLaw::saveButtonVisible) ?: false

    /** Le moment a été reporté (« Plus tard »). */
    val wasDeferred: Boolean get() = (state as? PhotoFlowState.Done)?.deferred == true

    private fun send(event: PhotoFlowEvent) {
        state = GamePhotoFlow.reduce(state, event)
    }

    // 1. La proposition

    suspend fun chooseSelfie() {
        send(PhotoFlowEvent.Selfie)
        if (state != PhotoFlowState.Camera(PhotoCameraPhase.Opening)) return
        send(camera.start()?.let { PhotoFlowEvent.CameraFailed(it) } ?: PhotoFlowEvent.CameraReady)
    }

    suspend fun chooseCard() {
        camera.stop()
        send(PhotoFlowEvent.Card)
        strikeInPlace(source = null, mode = PhotoMode.Card, zone = CaptureZone.OUTSIDE)
    }

    suspend fun later() {
        notebook.postpone(moment)
        camera.stop()
        send(PhotoFlowEvent.Later)
    }

    fun close() {
        camera.stop()
        send(PhotoFlowEvent.Close)
    }

    // 2 et 3. La prise et la frappe en place

    /** Par la case du cadre ([CaptureZone.FRAME]) la prise part dans la galerie ; hors cadre, elle reste dans l'app. */
    suspend fun take(zone: CaptureZone) {
        if (state != PhotoFlowState.Camera(PhotoCameraPhase.Live) || taking) return
        taking = true
        try {
            val shot = camera.capture()
            if (shot == null) {
                send(PhotoFlowEvent.CameraFailed(CameraFailure.Unavailable))
                return
            }
            camera.stop()
            send(PhotoFlowEvent.Shutter)
            strikeInPlace(shot, PhotoMode.Selfie, zone)
        } finally {
            taking = false
        }
    }

    suspend fun useGalleryPhoto(image: Bitmap) {
        camera.stop()
        send(PhotoFlowEvent.Gallery)
        strikeInPlace(image, PhotoMode.Gallery, CaptureZone.OUTSIDE)
    }

    private suspend fun strikeInPlace(source: Bitmap?, mode: PhotoMode, zone: CaptureZone) {
        if (state !is PhotoFlowState.Striking) return
        frozen = source
        strike = 0f
        onStrike()
        if (strikeMillis > 0) {
            delay(FIRST_FRAME_MILLIS)
            strike = 1f
            delay(strikeMillis)
        } else {
            strike = 1f
        }
        composedSource = source
        val result = composer.compose(PhotoComposeRequest(moment, text, source, mode))
        if (result == null) {
            send(PhotoFlowEvent.ComposeFailed)
            return
        }
        composed = result
        send(PhotoFlowEvent.Composed)
        val format = format(squareFormat)
        val origin = if (zone == CaptureZone.FRAME) CaptureOrigin.Frame(moment.id, format) else CaptureOrigin.Outside(moment.id, format)
        val begun = CaptureSaveLaw.beginTake(origin)
        takeSave = begun
        if (CaptureSaveLaw.destination(zone).gallery) writeToGallery(begun.currentVersion)
    }

    // 4. Le résultat

    /** Le format montré et enregistré : la story ou le carré — une autre version, « Enregistrer » revient. */
    fun chooseFormat(square: Boolean) {
        squareFormat = square
        takeSave = takeSave?.let { CaptureSaveLaw.applyFormatChange(it, format(square)) }
    }

    /** Garde le 9:16, la photo d'origine réduite (jamais pour une carte seule) et la recette. */
    suspend fun keep() {
        if (state !is PhotoFlowState.Result) return
        val result = composed
        val outcome = if (result == null) {
            NotebookKeepOutcome.Unavailable
        } else {
            val taken = composedSource.takeIf { result.mode != PhotoMode.Card }
            val source = taken?.let { withContext(Dispatchers.Default) { encodeSource(it) } }
            val recipe = NotebookRecipe(frameId = moment.id, mirror = taken?.let { result.mode == PhotoMode.Selfie })
            notebook.keep(moment, KeptPhoto(result.storyJpeg, result.mode, source, recipe))
        }
        send(PhotoFlowEvent.Kept(outcome == NotebookKeepOutcome.Kept))
        notice = when (outcome) {
            NotebookKeepOutcome.Kept -> PhotoNotice.Kept
            NotebookKeepOutcome.NoSpace -> PhotoNotice.NoSpace
            NotebookKeepOutcome.Unavailable -> PhotoNotice.KeepFailed
        }
    }

    /** « Enregistrer » : la prise part dans la galerie, au format courant. Déjà enregistrée dans cette version, rien ne part. */
    suspend fun save() {
        val current = takeSave ?: return
        if (state !is PhotoFlowState.Result || !showsSave) return
        takeSave = CaptureSaveLaw.applySaved(current)
        writeToGallery(current.currentVersion)
    }

    /** Les octets qui partent au partage, dans le format choisi. */
    fun shareBytes(): ByteArray? = composed?.let { if (squareFormat) it.squareJpeg else it.storyJpeg }

    fun shared(completed: Boolean) {
        if (completed) notice = PhotoNotice.Shared
    }

    /** L'écriture dans la galerie, déjà comptée par l'état (optimiste) : un échec rend CETTE version à enregistrer. */
    private suspend fun writeToGallery(version: SavedVersion) {
        val result = composed
        val bytes = result?.let { if (version.format == PhotoFormat.Square.wire) it.squareJpeg else it.storyJpeg }
        val ok = bytes != null && gallery.saveImage(bytes, "meeshy-${GamePhotoNotebookIndex.sanitized(moment.id)}-${version.format}.jpg")
        if (ok) {
            notice = PhotoNotice.Saved
        } else {
            takeSave = takeSave?.let { CaptureSaveLaw.applySaveFailed(it, version) }
            notice = PhotoNotice.SaveFailed
        }
    }

    companion object {
        const val STRIKE_MILLIS = 1_200L
        private const val FIRST_FRAME_MILLIS = 40L

        fun format(square: Boolean): String = (if (square) PhotoFormat.Square else PhotoFormat.Story).wire

        /** La source gardée : 1 440 px de grand côté au plus (jamais agrandie), JPEG q0,85. Jamais en miroir. */
        fun sourceJpeg(image: Bitmap): ByteArray? {
            val (width, height) = GamePhotoNotebookIndex.reducedSize(image.width, image.height)
            if (width == 0) return null
            val reduced = if (width == image.width) image else Bitmap.createScaledBitmap(image, width, height, true)
            return ByteArrayOutputStream().use { out ->
                reduced.compress(Bitmap.CompressFormat.JPEG, GamePhotoNotebookIndex.SOURCE_QUALITY, out)
                out.toByteArray()
            }
        }
    }
}

private val PhotoFormat.wire: String get() = name.lowercase()
