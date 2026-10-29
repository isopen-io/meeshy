package me.meeshy.app.calls

import android.graphics.Bitmap
import com.google.common.truth.Truth.assertThat
import io.mockk.mockk
import java.io.File
import kotlin.coroutines.EmptyCoroutineContext
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.call.frames.CallLiveFrameRule
import me.meeshy.sdk.model.call.montage.CallCaptureLook
import me.meeshy.sdk.model.call.montage.CallCapturePreviewRule
import me.meeshy.sdk.model.call.montage.CallCaptureScene
import me.meeshy.sdk.model.call.montage.CallCaptureSubject
import me.meeshy.sdk.model.call.montage.CallMontageChoice
import me.meeshy.sdk.model.call.montage.CallMontageMoodChip
import me.meeshy.sdk.model.call.montage.CallMontagePickRule
import me.meeshy.sdk.model.call.montage.CallMontageStyle
import org.junit.Test
import org.webrtc.VideoTrack

/**
 * L'aperçu peint et le choix du mode Montage (#13690), jumeaux de `refreshPreviews` et `select(choice:)`
 * d'iOS : un classique se peint en 540 × 960 avec les vignettes de son voisinage, un cadre servi en
 * direct ne se peint pas, la photo et le film prennent le classique choisi.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class CallCapturePreviewTest {

    private class Frames(private val images: Map<String, Bitmap>) : CallCaptureFrameSource {
        val requests = mutableListOf<Int?>()
        override fun attach(id: String, track: VideoTrack?) = Unit
        override fun detachAll() = Unit
        override suspend fun snapshot(subjects: List<CallCaptureSubject>, maxDimension: Int?): Map<String, Bitmap> {
            requests += maxDimension
            return images
        }
    }

    private class Painter : CallCapturePainting {
        val calls = mutableListOf<Pair<CallCaptureLook, Pair<Int, Int>>>()
        override fun paint(scene: CallCaptureScene, images: Map<String, Bitmap>, width: Int, height: Int): Bitmap {
            calls += scene.look to (width to height)
            return mockk(relaxed = true)
        }
    }

    private class Saver : CallCaptureSaving {
        override suspend fun saveImage(image: Bitmap, name: String) = true
        override suspend fun saveVideo(file: File, name: String) = true
    }

    private class Recorder : CallCaptureRecording {
        override suspend fun start(width: Int, height: Int) = true
        override suspend fun append(frame: Bitmap) = Unit
        override suspend fun finish(): File? = null
        override suspend fun cancel() = Unit
    }

    private val me = CallCaptureSubject("me", "Ana", null, isSelf = true, isMirrored = true, showsVideo = true)
    private val peer = CallCaptureSubject("peer", "Bo", null, isSelf = false, isMirrored = false, showsVideo = true)

    private fun scene(look: CallCaptureLook) = CallCaptureScene(look, listOf(me, peer))

    private class Rig(val scope: TestScope, val frames: Frames, val painter: Painter, val controller: CallCaptureController)

    private fun rig(block: suspend Rig.() -> Unit) = runTest(StandardTestDispatcher()) {
        val frames = Frames(mapOf("me" to mockk(relaxed = true), "peer" to mockk(relaxed = true)))
        val painter = Painter()
        val controller = CallCaptureController(
            frames = frames,
            painter = painter,
            saver = Saver(),
            recorders = { Recorder() },
            scope = CoroutineScope(StandardTestDispatcher(testScheduler)),
            clock = { testScheduler.currentTime },
            stamp = { "STAMP" },
            paintContext = EmptyCoroutineContext,
        )
        Rig(this, frames, painter, controller).block()
        controller.stop()
        runCurrent()
    }

    @Test
    fun `un classique se peint en 540 x 960 avec les vignettes de son voisinage, sur des images reduites`() = rig {
        val look = CallCaptureLook.Classic(CallMontageStyle.POLAROID)

        controller.refreshPreview(CallCapturePreviewRequest(scene(look), liveFrameShown = true))

        assertThat(frames.requests).containsExactly(CallCapturePreviewRule.MAX_DIMENSION)
        assertThat(painter.calls.first()).isEqualTo(look to (540 to 960))
        val thumbnails = painter.calls.drop(1)
        assertThat(thumbnails.map { it.second }.toSet()).containsExactly(108 to 192)
        assertThat(thumbnails.map { (it.first as CallCaptureLook.Classic).style })
            .isEqualTo(CallMontageStyle.entries.toList().subList(3, 10))
        val previews = controller.previews.value
        assertThat(previews.look).isEqualTo(look)
        assertThat(previews.preview).isNotNull()
        assertThat(previews.thumbnails.keys).hasSize(7)
    }

    @Test
    fun `un cadre servi en direct ne se peint pas et ne demande aucune image`() = rig {
        val live = CallCaptureLook.Frame(CallLiveFrameRule.frames().first())

        controller.refreshPreview(CallCapturePreviewRequest(scene(live), liveFrameShown = true))

        assertThat(frames.requests).isEmpty()
        assertThat(controller.previews.value.preview).isNull()
    }

    @Test
    fun `l'apercu tourne toutes les 200 ms et s'arrete a la sortie du mode`() = rig {
        val request = CallCapturePreviewRequest(scene(CallCaptureLook.Classic(CallMontageStyle.SCREEN)), liveFrameShown = false)

        controller.startPreview { request }
        scope.runCurrent()
        scope.advanceTimeBy(CallCapturePreviewRule.INTERVAL_MILLIS * 2)
        scope.runCurrent()
        assertThat(frames.requests).hasSize(3)

        controller.stop()
        scope.advanceTimeBy(CallCapturePreviewRule.INTERVAL_MILLIS * 3)
        scope.runCurrent()
        assertThat(frames.requests).hasSize(3)
        assertThat(controller.previews.value).isEqualTo(CallCapturePreviews())
    }

    @Test
    fun `choisir un classique le peint aussitot, vignettes comprises`() = rig {
        var look: CallCaptureLook = CallCaptureLook.Classic(CallMontageStyle.SCREEN)
        controller.startPreview { CallCapturePreviewRequest(scene(look), liveFrameShown = false) }
        scope.runCurrent()
        painter.calls.clear()

        look = CallCaptureLook.Classic(CallMontageStyle.HEART)
        controller.refreshSoon()
        scope.runCurrent()

        assertThat(painter.calls.first().first).isEqualTo(look)
        assertThat(painter.calls.drop(1).map { (it.first as CallCaptureLook.Classic).style })
            .isEqualTo(CallMontageStyle.entries.toList().takeLast(4))
    }

    @Test
    fun `le choix du montage passe par les Classiques et revient au cadre en direct`() = rig {
        controller.pickClassic(CallMontageStyle.MAGAZINE)
        assertThat(CallMontagePickRule.choice(controller.pick.value, "x")).isEqualTo(CallMontageChoice.Classic(CallMontageStyle.MAGAZINE))

        controller.pickFrame()
        assertThat(CallMontagePickRule.choice(controller.pick.value, "x")).isEqualTo(CallMontageChoice.Frame("x"))

        controller.show(CallMontageMoodChip.Classics)
        assertThat(CallMontagePickRule.choice(controller.pick.value, "x")).isEqualTo(CallMontageChoice.Classic(CallMontageStyle.MAGAZINE))
    }

    @Test
    fun `la photo prend le classique choisi`() = rig {
        controller.pickClassic(CallMontageStyle.NOIR)
        val look = CallMontagePickRule.look(controller.pick.value, liveFrameId = CallLiveFrameRule.frames().first().id)

        controller.capture(scene(look)) { true }

        assertThat(painter.calls.single()).isEqualTo(CallCaptureLook.Classic(CallMontageStyle.NOIR) to (1080 to 1920))
    }
}
