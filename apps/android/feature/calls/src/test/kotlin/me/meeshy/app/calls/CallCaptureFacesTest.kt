package me.meeshy.app.calls

import android.graphics.Bitmap
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.mockk
import io.mockk.verify
import java.io.File
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.call.frames.CallFrameRect
import me.meeshy.sdk.model.call.montage.CallCaptureLook
import me.meeshy.sdk.model.call.montage.CallCaptureScene
import me.meeshy.sdk.model.call.montage.CallCaptureStatus
import me.meeshy.sdk.model.call.montage.CallCaptureSubject
import me.meeshy.sdk.model.call.montage.CallMontageLayout
import me.meeshy.sdk.model.call.montage.CallMontageStyle
import org.junit.Test
import org.webrtc.VideoTrack

/**
 * « Chaque visage » (#13691), jumeau de `CallCaptureController.captureFaces` (iOS) : un portrait carré de
 * 1080 par personne qui a une image, pris à pleine définition et déposé en galerie ; l'issue compte les
 * portraits enregistrés ; un refus, l'absence d'image et un échec se disent comme pour la photo.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class CallCaptureFacesTest {

    private class Frames(private val images: Map<String, Bitmap>) : CallCaptureFrameSource {
        val requests = mutableListOf<Int?>()
        override fun attach(id: String, track: VideoTrack?) = Unit
        override fun detachAll() = Unit
        override suspend fun snapshot(subjects: List<CallCaptureSubject>, maxDimension: Int?): Map<String, Bitmap> {
            requests += maxDimension
            return images.filterKeys { id -> subjects.any { it.id == id && it.showsVideo } }
        }
    }

    private class Portraits(private val result: (Bitmap) -> Bitmap?) : CallFacePortraiting {
        val calls = mutableListOf<Pair<Bitmap, Int>>()
        override fun portrait(image: Bitmap, side: Int): Bitmap? {
            calls += image to side
            return result(image)
        }
    }

    private class Saver(private val accepts: (String) -> Boolean = { true }) : CallCaptureSaving {
        val images = mutableListOf<Pair<Bitmap, String>>()
        override suspend fun saveImage(image: Bitmap, name: String): Boolean { images += image to name; return accepts(name) }
        override suspend fun saveVideo(file: File, name: String) = true
    }

    private val mine: Bitmap = mockk(relaxed = true)
    private val theirs: Bitmap = mockk(relaxed = true)
    private val myFace: Bitmap = mockk(relaxed = true)
    private val theirFace: Bitmap = mockk(relaxed = true)
    private val me = CallCaptureSubject("me", "Ana", null, isSelf = true, isMirrored = true, showsVideo = true)
    private val peer = CallCaptureSubject("peer", "Bo", null, isSelf = false, isMirrored = false, showsVideo = true)

    private class Rig(val frames: Frames, val portraits: Portraits, val saver: Saver, val controller: CallCaptureController)

    private fun rig(
        images: Map<String, Bitmap> = mapOf("me" to mine, "peer" to theirs),
        portrait: (Bitmap) -> Bitmap? = { if (it === mine) myFace else theirFace },
        accepts: (String) -> Boolean = { true },
        block: suspend Rig.() -> Unit,
    ) = runTest(StandardTestDispatcher()) {
        val frames = Frames(images)
        val portraits = Portraits(portrait)
        val saver = Saver(accepts)
        val controller = CallCaptureController(
            frames = frames,
            painter = { _, _, _, _ -> mockk(relaxed = true) },
            saver = saver,
            recorders = { mockk(relaxed = true) { coEvery { start(any(), any()) } returns true } },
            scope = CoroutineScope(StandardTestDispatcher(testScheduler)),
            clock = { testScheduler.currentTime },
            stamp = { "STAMP" },
            faces = portraits,
            paintContext = StandardTestDispatcher(testScheduler),
        )
        Rig(frames, portraits, saver, controller).block()
        controller.stop()
        runCurrent()
    }

    @Test
    fun `chaque personne qui a une image donne un portrait carre de 1080, pris a pleine definition`() = rig {
        controller.captureFaces(listOf(me, peer)) { true }

        assertThat(frames.requests).containsExactly(null)
        assertThat(portraits.calls).containsExactly(mine to CallMontageLayout.FACE_SIDE, theirs to CallMontageLayout.FACE_SIDE).inOrder()
        assertThat(saver.images.map { it.first }).containsExactly(myFace, theirFace).inOrder()
        assertThat(controller.state.value.status).isEqualTo(CallCaptureStatus.FacesSaved(2))
        assertThat(controller.state.value.flashCount).isEqualTo(1)
    }

    @Test
    fun `chaque portrait porte son propre nom, aucun n'en ecrase un autre`() = rig {
        controller.captureFaces(listOf(me, peer)) { true }

        assertThat(saver.images.map { it.second }).containsExactly("Meeshy-STAMP-1.jpg", "Meeshy-STAMP-2.jpg").inOrder()
    }

    @Test
    fun `une camera coupee n'a pas de portrait, l'autre visage s'enregistre seul`() = rig {
        controller.captureFaces(listOf(me.copy(showsVideo = false), peer)) { true }

        assertThat(portraits.calls.map { it.first }).containsExactly(theirs)
        assertThat(controller.state.value.status).isEqualTo(CallCaptureStatus.FacesSaved(1))
    }

    @Test
    fun `les images de l'appel et les portraits sont rendus apres l'enregistrement`() = rig {
        controller.captureFaces(listOf(me, peer)) { true }

        verify { mine.recycle() }
        verify { theirs.recycle() }
        verify { myFace.recycle() }
        verify { theirFace.recycle() }
    }

    @Test
    fun `un acces a la galerie refuse se dit, sans rien prendre`() = rig {
        controller.captureFaces(listOf(me, peer)) { false }

        assertThat(controller.state.value.status).isEqualTo(CallCaptureStatus.Denied)
        assertThat(frames.requests).isEmpty()
        assertThat(portraits.calls).isEmpty()
    }

    @Test
    fun `sans aucune image, l'option le dit`() = rig(images = emptyMap()) {
        controller.captureFaces(listOf(me, peer)) { true }

        assertThat(controller.state.value.status).isEqualTo(CallCaptureStatus.NoVideo)
        assertThat(saver.images).isEmpty()
    }

    @Test
    fun `aucun portrait possible est un echec`() = rig(portrait = { null }) {
        controller.captureFaces(listOf(me, peer)) { true }

        assertThat(controller.state.value.status).isEqualTo(CallCaptureStatus.Failed)
        assertThat(saver.images).isEmpty()
    }

    @Test
    fun `l'issue ne compte que les portraits que la galerie a gardes`() = rig(accepts = { it.endsWith("-2.jpg") }) {
        controller.captureFaces(listOf(me, peer)) { true }

        assertThat(controller.state.value.status).isEqualTo(CallCaptureStatus.FacesSaved(1))
    }

    @Test
    fun `une galerie qui refuse tout est un echec`() = rig(accepts = { false }) {
        controller.captureFaces(listOf(me, peer)) { true }

        assertThat(controller.state.value.status).isEqualTo(CallCaptureStatus.Failed)
    }

    @Test
    fun `aucun portrait ne se prend pendant le film`() = rig {
        controller.startRecording({ CallCaptureScene(CallCaptureLook.Classic(CallMontageStyle.SCREEN), listOf(me, peer)) }) { true }
        assertThat(controller.state.value.isRecording).isTrue()
        controller.captureFaces(listOf(me, peer)) { true }

        assertThat(portraits.calls).isEmpty()
        assertThat(saver.images).isEmpty()
    }

    @Test
    fun `le carre se pose autour du visage trouve, remonte et garde dans l'image`() {
        val square = CallFacePortraitGeometry.square(CallFrameRect(200.0, 100.0, 100.0, 100.0), width = 1000, height = 1000)

        assertThat(square).isEqualTo(CallFaceSquare(x = 155, y = 47, side = 190))
    }

    @Test
    fun `un visage au bord garde son carre entier dans l'image`() {
        val square = CallFacePortraitGeometry.square(CallFrameRect(-20.0, 900.0, 100.0, 100.0), width = 1000, height = 1000)

        assertThat(square).isEqualTo(CallFaceSquare(x = 0, y = 810, side = 190))
    }

    @Test
    fun `sans visage, le plus grand carre centre`() {
        assertThat(CallFacePortraitGeometry.square(null, width = 640, height = 480)).isEqualTo(CallFaceSquare(x = 80, y = 0, side = 480))
    }

    @Test
    fun `une image vide n'a pas de carre`() {
        assertThat(CallFacePortraitGeometry.square(null, width = 0, height = 480)).isNull()
    }

    @Test
    fun `le visage lu par le detecteur sur la sonde revient en pixels de l'image`() {
        val face = CallFacePortraitGeometry.faceFromEyes(midX = 90f, midY = 60f, eyesDistance = 36f, scaleX = 0.5f, scaleY = 0.5f)

        assertThat(face.x).isWithin(0.01).of(80.0)
        assertThat(face.y).isWithin(0.01).of(16.0)
        assertThat(face.width).isWithin(0.01).of(200.0)
        assertThat(face.height).isWithin(0.01).of(260.0)
    }
}
