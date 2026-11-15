package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CallLifecycleControllerTest {

    private class Rig(var pip: Boolean = false) {
        val captures = mutableListOf<Boolean>()
        val announced = mutableListOf<Boolean>()
        val controller = CallLifecycleController(
            inPictureInPicture = { pip },
            setCapture = { captures += it },
            announceVideo = { announced += it },
        )
    }

    @Test
    fun `going to the background stops the camera and tells the peer`() {
        val rig = Rig()

        rig.controller.onAppState(foreground = false, isVideoCall = true, userCameraOn = true)

        assertThat(rig.captures).containsExactly(false)
        assertThat(rig.announced).containsExactly(false)
    }

    @Test
    fun `coming back restarts the camera and tells the peer`() {
        val rig = Rig()
        rig.controller.onAppState(foreground = false, isVideoCall = true, userCameraOn = true)

        rig.controller.onAppState(foreground = true, isVideoCall = true, userCameraOn = true)

        assertThat(rig.captures).containsExactly(false, true).inOrder()
        assertThat(rig.announced).containsExactly(false, true).inOrder()
    }

    @Test
    fun `the picture in picture window keeps the camera on`() {
        val rig = Rig(pip = true)

        rig.controller.onAppState(foreground = false, isVideoCall = true, userCameraOn = true)

        assertThat(rig.captures).isEmpty()
        assertThat(rig.announced).isEmpty()
    }

    @Test
    fun `a camera the user turned off is not touched by the app state`() {
        val rig = Rig()

        rig.controller.onAppState(foreground = false, isVideoCall = true, userCameraOn = false)
        rig.controller.onAppState(foreground = true, isVideoCall = true, userCameraOn = false)

        assertThat(rig.captures).isEmpty()
    }

    @Test
    fun `a user choice made while suspended forgets the suspension`() {
        val rig = Rig()
        rig.controller.onAppState(foreground = false, isVideoCall = true, userCameraOn = true)
        rig.controller.reset()

        rig.controller.onAppState(foreground = true, isVideoCall = true, userCameraOn = true)

        assertThat(rig.captures).containsExactly(false)
    }

    @Test
    fun `on hold the app state says nothing and the replay after the hold resumes a camera the app had stopped`() {
        val rig = Rig()
        rig.controller.onAppState(foreground = false, isVideoCall = true, userCameraOn = true)

        rig.controller.onAppState(foreground = true, isVideoCall = true, userCameraOn = true, onHold = true)
        assertThat(rig.captures).containsExactly(false)

        rig.controller.reevaluate(isVideoCall = true, userCameraOn = true)
        assertThat(rig.captures).containsExactly(false, true).inOrder()
    }

    @Test
    fun `a suspension adopted from a hold is resumed when the app returns`() {
        val rig = Rig()
        rig.controller.onAppState(foreground = false, isVideoCall = true, userCameraOn = true, onHold = true)
        assertThat(rig.controller.isHidden).isTrue()

        rig.controller.adoptSuspension()
        rig.controller.onAppState(foreground = true, isVideoCall = true, userCameraOn = true)

        assertThat(rig.controller.isSuspended).isFalse()
        assertThat(rig.captures).containsExactly(true)
        assertThat(rig.announced).containsExactly(true)
    }
}
