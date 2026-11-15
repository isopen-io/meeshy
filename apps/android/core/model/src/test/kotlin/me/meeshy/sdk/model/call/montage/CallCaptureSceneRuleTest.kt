package me.meeshy.sdk.model.call.montage

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.call.frames.CallFrameCatalogue
import me.meeshy.sdk.model.call.frames.CallFramePerson
import me.meeshy.sdk.model.call.frames.CallLiveFrameRule
import org.junit.Test

/**
 * Ce que la capture d'un duo peint (miroir de `CallCaptureController.captureLook` et des
 * `CallCaptureSubject` d'iOS) : le cadre appliqué s'il est connu, sinon l'Écran classique ; moi en
 * miroir quand la caméra avant filme, l'autre à l'endroit ; une caméra coupée garde sa case.
 */
class CallCaptureSceneRuleTest {

    private val me = CallFramePerson(id = "me", name = "Ana", handle = null, isSelf = true)
    private val peer = CallFramePerson(id = "peer", name = "Bo", handle = "bo", isSelf = false)

    @Test
    fun `sans cadre applique, la capture est l'Ecran classique`() {
        assertThat(CallCaptureSceneRule.look(frameId = null, people = 2)).isEqualTo(CallCaptureLook.Classic(CallMontageStyle.SCREEN))
    }

    @Test
    fun `un cadre applique se peint tel quel`() {
        val design = CallLiveFrameRule.frames().first()

        assertThat(CallCaptureSceneRule.look(frameId = design.id, people = CallLiveFrameRule.PEOPLE))
            .isEqualTo(CallCaptureLook.Frame(design))
    }

    @Test
    fun `un cadre inconnu du catalogue retombe sur l'Ecran classique`() {
        assertThat(CallCaptureSceneRule.look(frameId = "inconnu", people = 2)).isEqualTo(CallCaptureLook.Classic(CallMontageStyle.SCREEN))
    }

    @Test
    fun `un cadre qui ne sert pas ce nombre passe a sa variante, sinon au classique`() {
        val duo = CallLiveFrameRule.frames().first()
        val look = CallCaptureSceneRule.look(frameId = duo.id, people = 1)

        when (look) {
            is CallCaptureLook.Frame -> assertThat(look.design.serves(1)).isTrue()
            is CallCaptureLook.Classic -> assertThat(look.style).isEqualTo(CallMontageStyle.SCREEN)
        }
        assertThat(CallFrameCatalogue.all).isNotEmpty()
    }

    @Test
    fun `en duo, moi d'abord en miroir sur la camera avant, puis l'autre a l'endroit`() {
        val subjects = CallCaptureSceneRule.duo(listOf(me, peer), isCameraOn = true, isFrontCamera = true, isPeerCameraOff = false)

        assertThat(subjects.map { it.id }).containsExactly("me", "peer").inOrder()
        assertThat(subjects[0].isMirrored).isTrue()
        assertThat(subjects[0].isSelf).isTrue()
        assertThat(subjects[1].isMirrored).isFalse()
        assertThat(subjects[1].handle).isEqualTo("bo")
        assertThat(subjects.all { it.showsVideo }).isTrue()
    }

    @Test
    fun `la camera arriere filme le monde a l'endroit`() {
        val subjects = CallCaptureSceneRule.duo(listOf(me, peer), isCameraOn = true, isFrontCamera = false, isPeerCameraOff = false)

        assertThat(subjects.none { it.isMirrored }).isTrue()
    }

    @Test
    fun `une camera coupee garde sa case sans image`() {
        val subjects = CallCaptureSceneRule.duo(listOf(me, peer), isCameraOn = false, isFrontCamera = true, isPeerCameraOff = true)

        assertThat(subjects).hasSize(2)
        assertThat(subjects.none { it.showsVideo }).isTrue()
    }

    @Test
    fun `les noms des fichiers enregistres portent la marque et leur format`() {
        assertThat(CallCaptureSpec.photoName("20261029-101500")).isEqualTo("Meeshy-20261029-101500.jpg")
        assertThat(CallCaptureSpec.videoName("20261029-101500")).isEqualTo("Meeshy-20261029-101500.mp4")
    }

    @Test
    fun `la photo se peint en 1080 x 1920 et le film en 720 x 1280 a quinze images par seconde`() {
        assertThat(CallCaptureSpec.PHOTO_WIDTH to CallCaptureSpec.PHOTO_HEIGHT).isEqualTo(1080 to 1920)
        assertThat(CallCaptureSpec.VIDEO_WIDTH to CallCaptureSpec.VIDEO_HEIGHT).isEqualTo(720 to 1280)
        assertThat(CallCaptureSpec.VIDEO_FRAME_INTERVAL_MILLIS).isEqualTo(66L)
    }
}
