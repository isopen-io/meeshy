package me.meeshy.app.calls

import android.graphics.Bitmap
import java.io.File
import kotlin.coroutines.CoroutineContext
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import me.meeshy.sdk.model.call.frames.CallFrameDesign
import me.meeshy.sdk.model.call.frames.CallFrameScope
import me.meeshy.sdk.model.call.montage.CallCaptureLook
import me.meeshy.sdk.model.call.montage.CallCaptureMachine
import me.meeshy.sdk.model.call.montage.CallCapturePreviewRule
import me.meeshy.sdk.model.call.montage.CallCaptureScene
import me.meeshy.sdk.model.call.montage.CallCaptureSpec
import me.meeshy.sdk.model.call.montage.CallCaptureState
import me.meeshy.sdk.model.call.montage.CallCaptureStatus
import me.meeshy.sdk.model.call.montage.CallCaptureSubject
import me.meeshy.sdk.model.call.montage.CallMontageChoice
import me.meeshy.sdk.model.call.montage.CallMontageMoodChip
import me.meeshy.sdk.model.call.montage.CallMontagePick
import me.meeshy.sdk.model.call.montage.CallMontagePickRule
import me.meeshy.sdk.model.call.montage.CallMontageStyle
import org.webrtc.VideoTrack
import timber.log.Timber

/** Les images des pistes de l'appel, prises à la demande ([CallCaptureFrameGrabber] en production). */
interface CallCaptureFrameSource {
    fun attach(id: String, track: VideoTrack?)
    fun detachAll()

    /** L'image courante de chaque personne qui en a une ; `maxDimension == null` : pleine définition. */
    suspend fun snapshot(subjects: List<CallCaptureSubject>, maxDimension: Int?): Map<String, Bitmap>
}

/** Peindre une scène de capture à la taille donnée ([CallCapturePainter] en production). */
fun interface CallCapturePainting {
    fun paint(scene: CallCaptureScene, images: Map<String, Bitmap>, width: Int, height: Int): Bitmap?
}

/** Déposer une capture dans la galerie ([GalleryCallCaptureSaver] en production). */
interface CallCaptureSaving {
    suspend fun saveImage(image: Bitmap, name: String): Boolean
    suspend fun saveVideo(file: File, name: String): Boolean
}

/** Filmer le montage : ouvrir, poser chaque image rendue, fermer ([CallCaptureRecorder] en production). */
interface CallCaptureRecording {
    suspend fun start(width: Int, height: Int): Boolean
    suspend fun append(frame: Bitmap)
    suspend fun finish(): File?
    suspend fun cancel()
}

/**
 * Ce que l'aperçu doit peindre à un tour : la scène, si un cadre la montre déjà en direct, et les cadres dont
 * la vignette se peint sur les visages de l'appel (`CallMontagePickRule.frameWindow`, #13732).
 */
data class CallCapturePreviewRequest(
    val scene: CallCaptureScene,
    val liveFrameShown: Boolean,
    val frameWindow: List<CallFrameDesign> = emptyList(),
)

/**
 * L'aperçu peint du mode Montage (iOS `previewFeed`, `thumbnails` et `frameThumbnails`) : la scène dans le
 * rendu [look] qu'elle porte, les vignettes des classiques et celles des cadres (par identifiant), toutes
 * peintes sur les images de l'appel. Une image publiée n'est jamais recyclée : l'écran peut encore la dessiner.
 */
data class CallCapturePreviews(
    val look: CallCaptureLook? = null,
    val preview: Bitmap? = null,
    val thumbnails: Map<CallMontageStyle, Bitmap> = emptyMap(),
    val frameThumbnails: Map<String, Bitmap> = emptyMap(),
)

/**
 * **LA CAPTURE D'UN APPEL** — jumelle de `CallCaptureController` (iOS, #8625) : deux tapes prennent une
 * photo du montage en cours (le cadre appliqué, sinon l'Écran classique) à pleine définition ; un appui
 * long filme le montage rendu à 15 images par seconde jusqu'au stop ; l'une et l'autre partent dans la
 * galerie. Les gardes et les issues sont la loi pure [CallCaptureMachine] ; ce contrôleur ne fait que
 * l'exécuter. L'état ne change pas au rythme des images : l'aperçu peint (#13690) se publie à part,
 * dans [previews], et le choix du montage dans [pick].
 */
class CallCaptureController(
    private val frames: CallCaptureFrameSource,
    private val painter: CallCapturePainting,
    private val saver: CallCaptureSaving,
    private val recorders: () -> CallCaptureRecording,
    private val scope: CoroutineScope,
    private val clock: () -> Long,
    private val stamp: () -> String,
    private val paintContext: CoroutineContext = Dispatchers.Default,
) {
    private val _state = MutableStateFlow(CallCaptureState())
    val state: StateFlow<CallCaptureState> = _state.asStateFlow()

    private val _pick = MutableStateFlow(CallMontagePick())
    val pick: StateFlow<CallMontagePick> = _pick.asStateFlow()

    private val _previews = MutableStateFlow(CallCapturePreviews())
    val previews: StateFlow<CallCapturePreviews> = _previews.asStateFlow()

    private var previewing: Job? = null
    private var previewRequest: (() -> CallCapturePreviewRequest)? = null
    private var previewsSinceThumbnails = 0

    private var recorder: CallCaptureRecording? = null
    private var recording: Job? = null
    private var settling: Job? = null

    /** Le mode s'ouvre : chaque personne branchée sur sa piste (`null` : pas de vidéo). */
    fun start(tracks: Map<String, VideoTrack?>) {
        tracks.forEach { (id, track) -> frames.attach(id, track) }
    }

    /** Le mode se ferme : un film en cours s'enregistre (comme iOS), les pistes se débranchent. */
    fun stop() {
        if (_state.value.isRecording) scope.launch { stopRecording() }
        previewing?.cancel()
        previewing = null
        previewRequest = null
        previewsSinceThumbnails = 0
        _previews.value = CallCapturePreviews()
        frames.detachAll()
    }

    /** Un classique ou un cadre choisi dans le carrousel : il ne sert que la capture (#13732), jamais l'appel. */
    fun select(choice: CallMontageChoice) = _pick.update { CallMontagePickRule.selecting(it, choice) }

    /** Toucher une puce : son dernier choix, sinon son premier élément, est pris (iOS `show`). */
    fun show(chip: CallMontageMoodChip, people: Int) = _pick.update { CallMontagePickRule.showing(it, chip, people) }

    /** « Plus d'ambiances » / « Moins d'ambiances » (#12683). */
    fun setScope(scope: CallFrameScope, people: Int) = _pick.update { CallMontagePickRule.settingScope(it, scope, people) }

    /** Le mode s'ouvre : le cadre gardé pendant l'appel devient le choix (iOS `onAppear`). */
    fun open(heldFrameId: String?) = _pick.update { CallMontagePickRule.opening(it, heldFrameId) }

    /** L'aperçu tourne toutes les [CallCapturePreviewRule.INTERVAL_MILLIS] tant que le mode est ouvert ; [request] se relit à chaque tour. */
    fun startPreview(request: () -> CallCapturePreviewRequest) {
        previewRequest = request
        if (previewing == null) previewing = previewLoop(request)
    }

    /** Le choix a changé : il se peint tout de suite, vignettes de son voisinage comprises (iOS `refreshSoon`). */
    fun refreshSoon() {
        val request = previewRequest ?: return
        if (_state.value.isRecording) return
        previewsSinceThumbnails = CallCapturePreviewRule.THUMBNAIL_EVERY_PREVIEWS
        previewing?.cancel()
        previewing = previewLoop(request)
    }

    private fun previewLoop(request: () -> CallCapturePreviewRequest): Job = scope.launch {
        while (isActive) {
            refreshPreview(request())
            delay(CallCapturePreviewRule.INTERVAL_MILLIS)
        }
    }

    suspend fun refreshPreview(request: CallCapturePreviewRequest) {
        if (_state.value.isRecording) return
        val scene = request.scene
        val plan = CallCapturePreviewRule.plan(
            look = scene.look,
            liveFrameShown = request.liveFrameShown,
            hasThumbnails = hasThumbnails(scene.look, request.frameWindow),
            previewsSinceThumbnails = previewsSinceThumbnails,
            frameWindow = request.frameWindow,
        )
        previewsSinceThumbnails = if (plan.thumbnails.isEmpty() && plan.frames.isEmpty()) previewsSinceThumbnails + 1 else 1
        if (plan.isEmpty || scene.subjects.isEmpty()) return
        val images = frames.snapshot(scene.subjects, CallCapturePreviewRule.MAX_DIMENSION)
        val painted = try {
            withContext(paintContext) {
                val preview = if (plan.preview) {
                    painter.paint(scene, images, CallCapturePreviewRule.PREVIEW_WIDTH, CallCapturePreviewRule.PREVIEW_HEIGHT)
                } else {
                    null
                }
                val thumbnails = plan.thumbnails.mapNotNull { style ->
                    painter.paint(
                        scene.copy(look = CallCaptureLook.Classic(style)),
                        images,
                        CallCapturePreviewRule.THUMBNAIL_WIDTH,
                        CallCapturePreviewRule.THUMBNAIL_HEIGHT,
                    )?.let { style to it }
                }.toMap()
                val frames = plan.frames.mapNotNull { design ->
                    painter.paint(
                        scene.copy(look = CallCaptureLook.Frame(design)),
                        images,
                        CallCapturePreviewRule.THUMBNAIL_WIDTH,
                        CallCapturePreviewRule.THUMBNAIL_HEIGHT,
                    )?.let { design.id to it }
                }.toMap()
                PaintedPreviews(preview, thumbnails, frames)
            }
        } finally {
            images.values.forEach(Bitmap::recycle)
        }
        if (_state.value.isRecording) return
        _previews.update { current ->
            current.copy(
                look = if (painted.preview != null) scene.look else current.look,
                preview = painted.preview ?: current.preview,
                thumbnails = current.thumbnails + painted.thumbnails,
                frameThumbnails = current.frameThumbnails + painted.frames,
            )
        }
    }

    /** Les vignettes du carrousel affiché sont-elles toutes là ? (iOS `hasThumbnails(for:)`) */
    private fun hasThumbnails(look: CallCaptureLook, frameWindow: List<CallFrameDesign>): Boolean = when (look) {
        is CallCaptureLook.Classic -> _previews.value.thumbnails.isNotEmpty()
        is CallCaptureLook.Frame -> frameWindow.isNotEmpty() && frameWindow.all { it.id in _previews.value.frameThumbnails }
    }

    private class PaintedPreviews(val preview: Bitmap?, val thumbnails: Map<CallMontageStyle, Bitmap>, val frames: Map<String, Bitmap>)

    suspend fun capture(scene: CallCaptureScene, mayWrite: suspend () -> Boolean) {
        val shot = CallCaptureMachine.shoot(_state.value) ?: return
        settling?.cancel()
        _state.value = shot
        if (!mayWrite()) return finish(CallCaptureStatus.Denied)
        val images = frames.snapshot(scene.subjects, maxDimension = null)
        if (images.isEmpty()) return finish(CallCaptureStatus.NoVideo)
        val painted = painter.paint(scene, images, CallCaptureSpec.PHOTO_WIDTH, CallCaptureSpec.PHOTO_HEIGHT)
        images.values.forEach(Bitmap::recycle)
        painted ?: return finish(CallCaptureStatus.Failed)
        val saved = saver.saveImage(painted, CallCaptureSpec.photoName(stamp()))
        painted.recycle()
        finish(if (saved) CallCaptureStatus.Saved else CallCaptureStatus.Failed)
    }

    /** [scene] se relit à chaque image : le film suit le cadre qu'on change en chemin. */
    suspend fun startRecording(scene: () -> CallCaptureScene, mayWrite: suspend () -> Boolean) {
        if (CallCaptureMachine.recordingStarted(_state.value, clock()) == null) return
        if (!mayWrite()) return finish(CallCaptureStatus.Denied)
        val opened = recorders()
        if (!opened.start(CallCaptureSpec.VIDEO_WIDTH, CallCaptureSpec.VIDEO_HEIGHT)) return finish(CallCaptureStatus.Failed)
        val started = CallCaptureMachine.recordingStarted(_state.value, clock()) ?: return opened.cancel()
        settling?.cancel()
        recorder = opened
        _state.value = started
        recording = scope.launch {
            while (isActive) {
                recordFrame(opened, scene())
                delay(CallCaptureSpec.VIDEO_FRAME_INTERVAL_MILLIS)
            }
        }
    }

    suspend fun stopRecording() {
        val stopping = CallCaptureMachine.recordingStopped(_state.value) ?: return
        _state.value = stopping
        recording?.cancel()
        recording?.join()
        recording = null
        val opened = recorder ?: return finish(CallCaptureStatus.Failed)
        recorder = null
        val file = opened.finish() ?: return finish(CallCaptureStatus.Failed)
        val saved = saver.saveVideo(file, CallCaptureSpec.videoName(stamp()))
        file.delete()
        finish(if (saved) CallCaptureStatus.VideoSaved else CallCaptureStatus.Failed)
    }

    private suspend fun recordFrame(opened: CallCaptureRecording, scene: CallCaptureScene) {
        try {
            val images = frames.snapshot(scene.subjects, CallCaptureSpec.VIDEO_MAX_DIMENSION)
            val painted = painter.paint(scene, images, CallCaptureSpec.VIDEO_WIDTH, CallCaptureSpec.VIDEO_HEIGHT)
            images.values.forEach(Bitmap::recycle)
            painted ?: return
            opened.append(painted)
            _previews.update { it.copy(look = scene.look, preview = painted) }
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (failure: Exception) {
            Timber.w(failure, "call-capture: frame dropped")
        }
    }

    private fun finish(outcome: CallCaptureStatus) {
        _state.value = CallCaptureMachine.finished(_state.value, outcome)
        settling?.cancel()
        settling = scope.launch {
            delay(CallCaptureMachine.STATUS_DISPLAY_MILLIS)
            _state.value = CallCaptureMachine.settled(_state.value, outcome)
        }
    }
}
