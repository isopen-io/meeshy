package me.meeshy.app.calls

import android.graphics.Bitmap
import java.io.File
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.call.montage.CallCaptureMachine
import me.meeshy.sdk.model.call.montage.CallCaptureScene
import me.meeshy.sdk.model.call.montage.CallCaptureSpec
import me.meeshy.sdk.model.call.montage.CallCaptureState
import me.meeshy.sdk.model.call.montage.CallCaptureStatus
import me.meeshy.sdk.model.call.montage.CallCaptureSubject
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
 * **LA CAPTURE D'UN APPEL** — jumelle de `CallCaptureController` (iOS, #8625) : deux tapes prennent une
 * photo du montage en cours (le cadre appliqué, sinon l'Écran classique) à pleine définition ; un appui
 * long filme le montage rendu à 15 images par seconde jusqu'au stop ; l'une et l'autre partent dans la
 * galerie. Les gardes et les issues sont la loi pure [CallCaptureMachine] ; ce contrôleur ne fait que
 * l'exécuter. Rien ne se publie au rythme des images : l'écran ne lit que [state].
 */
class CallCaptureController(
    private val frames: CallCaptureFrameSource,
    private val painter: CallCapturePainting,
    private val saver: CallCaptureSaving,
    private val recorders: () -> CallCaptureRecording,
    private val scope: CoroutineScope,
    private val clock: () -> Long,
    private val stamp: () -> String,
) {
    private val _state = MutableStateFlow(CallCaptureState())
    val state: StateFlow<CallCaptureState> = _state.asStateFlow()

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
        frames.detachAll()
    }

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
            painted.recycle()
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
