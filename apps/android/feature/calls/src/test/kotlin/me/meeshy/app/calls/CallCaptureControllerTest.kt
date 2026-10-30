package me.meeshy.app.calls

import android.graphics.Bitmap
import com.google.common.truth.Truth.assertThat
import io.mockk.mockk
import java.io.File
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.call.montage.CallCaptureLook
import me.meeshy.sdk.model.call.montage.CallCaptureMachine
import me.meeshy.sdk.model.call.montage.CallCaptureScene
import me.meeshy.sdk.model.call.montage.CallCaptureSpec
import me.meeshy.sdk.model.call.montage.CallCaptureStatus
import me.meeshy.sdk.model.call.montage.CallCaptureSubject
import me.meeshy.sdk.model.call.montage.CallMontageStyle
import org.junit.Test
import org.webrtc.VideoTrack

/**
 * La capture d'un appel côté Android, jumelle de `CallCaptureControllerTests.swift` : la photo se peint
 * avec le cadre en cours et part en galerie ; un refus d'accès, l'absence d'image et un échec se disent ;
 * l'appui long filme jusqu'au stop, puis la vidéo part en galerie et le fichier provisoire disparaît.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class CallCaptureControllerTest {

    private class FakeFrames(var images: Map<String, Bitmap>) : CallCaptureFrameSource {
        val attached = mutableMapOf<String, VideoTrack?>()
        var detached = 0
        val requests = mutableListOf<Int?>()
        override fun attach(id: String, track: VideoTrack?) { attached[id] = track }
        override fun detachAll() { detached += 1; attached.clear() }
        override suspend fun snapshot(subjects: List<CallCaptureSubject>, maxDimension: Int?): Map<String, Bitmap> {
            requests += maxDimension
            return images.filterKeys { id -> subjects.any { it.id == id && it.showsVideo } }
        }
    }

    private class FakePainter(var result: Bitmap?) : CallCapturePainting {
        val calls = mutableListOf<Triple<CallCaptureLook, Set<String>, Pair<Int, Int>>>()
        override fun paint(scene: CallCaptureScene, images: Map<String, Bitmap>, width: Int, height: Int): Bitmap? {
            calls += Triple(scene.look, images.keys, width to height)
            return result
        }
    }

    private class FakeSaver(var accepts: Boolean = true) : CallCaptureSaving {
        val images = mutableListOf<String>()
        val videos = mutableListOf<Pair<File, String>>()
        override suspend fun saveImage(image: Bitmap, name: String): Boolean { images += name; return accepts }
        override suspend fun saveVideo(file: File, name: String): Boolean { videos += file to name; return accepts }
    }

    private class FakeRecorder(private val file: File?, private val starts: Boolean = true) : CallCaptureRecording {
        var started: Pair<Int, Int>? = null
        var appended = 0
        var cancelled = false
        override suspend fun start(width: Int, height: Int): Boolean { started = width to height; return starts }
        override suspend fun append(frame: Bitmap) { appended += 1 }
        override suspend fun finish(): File? = file
        override suspend fun cancel() { cancelled = true }
    }

    private val bitmap: Bitmap = mockk(relaxed = true)
    private val me = CallCaptureSubject("me", "Ana", null, isSelf = true, isMirrored = true, showsVideo = true)
    private val peer = CallCaptureSubject("peer", "Bo", null, isSelf = false, isMirrored = false, showsVideo = true)
    private val scene = CallCaptureScene(CallCaptureLook.Classic(CallMontageStyle.SCREEN), listOf(me, peer))

    private class Rig(
        val scope: TestScope,
        val frames: FakeFrames,
        val painter: FakePainter,
        val saver: FakeSaver,
        val recorder: FakeRecorder,
        val controller: CallCaptureController,
    )

    private fun rig(
        images: Map<String, Bitmap> = mapOf("me" to bitmap, "peer" to bitmap),
        painted: Bitmap? = bitmap,
        recorded: File? = File.createTempFile("montage", ".mp4"),
        recorderStarts: Boolean = true,
        block: suspend Rig.() -> Unit,
    ) = runTest(StandardTestDispatcher()) {
        val frames = FakeFrames(images)
        val painter = FakePainter(painted)
        val saver = FakeSaver()
        val recorder = FakeRecorder(recorded, recorderStarts)
        val controller = CallCaptureController(
            frames = frames,
            painter = painter,
            saver = saver,
            recorders = { recorder },
            scope = CoroutineScope(StandardTestDispatcher(testScheduler)),
            clock = { testScheduler.currentTime },
            stamp = { "STAMP" },
        )
        Rig(this, frames, painter, saver, recorder, controller).block()
        controller.stop()
        runCurrent()
    }

    @Test
    fun `entrer dans le mode branche les deux pistes, en sortir les debranche`() = rig {
        controller.start(mapOf("me" to null, "peer" to null))
        controller.stop()

        assertThat(frames.detached).isEqualTo(1)
    }

    @Test
    fun `deux tapes, la photo se peint en 1080 x 1920 a pleine definition et part en galerie`() = rig {
        controller.capture(scene) { true }

        assertThat(frames.requests).containsExactly(null)
        assertThat(painter.calls.single().third).isEqualTo(CallCaptureSpec.PHOTO_WIDTH to CallCaptureSpec.PHOTO_HEIGHT)
        assertThat(painter.calls.single().second).containsExactly("me", "peer")
        assertThat(saver.images).containsExactly("Meeshy-STAMP.jpg")
        assertThat(controller.state.value.status).isEqualTo(CallCaptureStatus.Saved)
        assertThat(controller.state.value.flashCount).isEqualTo(1)
    }

    @Test
    fun `la photo prend le cadre en cours`() = rig {
        val framed = scene.copy(look = CallCaptureLook.Classic(CallMontageStyle.POLAROID))

        controller.capture(framed) { true }

        assertThat(painter.calls.single().first).isEqualTo(CallCaptureLook.Classic(CallMontageStyle.POLAROID))
    }

    @Test
    fun `un acces a la galerie refuse se dit, sans rien peindre`() = rig {
        controller.capture(scene) { false }

        assertThat(controller.state.value.status).isEqualTo(CallCaptureStatus.Denied)
        assertThat(painter.calls).isEmpty()
    }

    @Test
    fun `sans aucune image a prendre, la capture le dit`() = rig(images = emptyMap()) {
        controller.capture(scene) { true }

        assertThat(controller.state.value.status).isEqualTo(CallCaptureStatus.NoVideo)
        assertThat(saver.images).isEmpty()
    }

    @Test
    fun `une camera coupee garde sa case, la photo se prend avec l'image de l'autre`() = rig {
        controller.capture(scene.copy(subjects = listOf(me.copy(showsVideo = false), peer))) { true }

        assertThat(painter.calls.single().second).containsExactly("peer")
        assertThat(controller.state.value.status).isEqualTo(CallCaptureStatus.Saved)
    }

    @Test
    fun `un rendu impossible ou un enregistrement refuse est un echec`() = rig(painted = null) {
        controller.capture(scene) { true }

        assertThat(controller.state.value.status).isEqualTo(CallCaptureStatus.Failed)
    }

    @Test
    fun `l'issue s'efface au bout de deux secondes et demie`() = rig {
        controller.capture(scene) { true }
        scope.advanceTimeBy(CallCaptureMachine.STATUS_DISPLAY_MILLIS + 1)

        assertThat(controller.state.value.status).isEqualTo(CallCaptureStatus.Idle)
    }

    @Test
    fun `appui long, le film demarre en 720 x 1280 et pose une image toutes les 66 ms`() = rig {
        controller.startRecording({ scene }) { true }
        scope.runCurrent()
        scope.advanceTimeBy(CallCaptureSpec.VIDEO_FRAME_INTERVAL_MILLIS * 3)

        assertThat(recorder.started).isEqualTo(CallCaptureSpec.VIDEO_WIDTH to CallCaptureSpec.VIDEO_HEIGHT)
        assertThat(controller.state.value.isRecording).isTrue()
        assertThat(recorder.appended).isAtLeast(3)
        assertThat(frames.requests.distinct()).containsExactly(CallCaptureSpec.VIDEO_MAX_DIMENSION)
        assertThat(painter.calls.map { it.third }.distinct()).containsExactly(CallCaptureSpec.VIDEO_WIDTH to CallCaptureSpec.VIDEO_HEIGHT)
    }

    @Test
    fun `aucune photo ne se prend pendant le film`() = rig {
        controller.startRecording({ scene }) { true }
        controller.capture(scene) { true }

        assertThat(saver.images).isEmpty()
    }

    @Test
    fun `au stop, la video part en galerie et le fichier provisoire disparait`() = rig {
        controller.startRecording({ scene }) { true }
        scope.runCurrent()

        controller.stopRecording()

        assertThat(controller.state.value.isRecording).isFalse()
        assertThat(saver.videos.single().second).isEqualTo("Meeshy-STAMP.mp4")
        assertThat(saver.videos.single().first.exists()).isFalse()
        assertThat(controller.state.value.status).isEqualTo(CallCaptureStatus.VideoSaved)
    }

    @Test
    fun `un film qui ne s'ouvre pas est un echec`() = rig(recorderStarts = false) {
        controller.startRecording({ scene }) { true }

        assertThat(controller.state.value.isRecording).isFalse()
        assertThat(controller.state.value.status).isEqualTo(CallCaptureStatus.Failed)
    }

    @Test
    fun `un film sans fichier a la fin est un echec`() = rig(recorded = null) {
        controller.startRecording({ scene }) { true }
        controller.stopRecording()

        assertThat(controller.state.value.status).isEqualTo(CallCaptureStatus.Failed)
        assertThat(saver.videos).isEmpty()
    }

    @Test
    fun `un acces refuse empeche le film`() = rig {
        controller.startRecording({ scene }) { false }

        assertThat(recorder.started).isNull()
        assertThat(controller.state.value.status).isEqualTo(CallCaptureStatus.Denied)
    }

    @Test
    fun `quitter le mode pendant le film enregistre la video, comme iOS`() = rig {
        controller.startRecording({ scene }) { true }
        controller.stop()
        scope.runCurrent()

        assertThat(controller.state.value.isRecording).isFalse()
        assertThat(saver.videos).hasSize(1)
        assertThat(frames.detached).isEqualTo(1)
    }
}
