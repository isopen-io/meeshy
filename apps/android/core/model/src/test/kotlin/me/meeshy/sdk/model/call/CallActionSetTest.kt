package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CallActionSetTest {
    private fun context(
        isDesktop: Boolean = false,
        isVideoEnabled: Boolean = false,
        hasSelectableCameras: Boolean = false,
        isConnected: Boolean = true,
        mayRecord: Boolean = false,
        canPictureInPicture: Boolean = false,
        showsVideo: Boolean = isVideoEnabled,
    ) = CallActionContext(isDesktop, isVideoEnabled, hasSelectableCameras, isConnected, mayRecord, canPictureInPicture, showsVideo)

    @Test
    fun `audio call not connected offers only camera, captions and journal`() {
        val set = CallActionSet.resolve(context(isConnected = false))
        assertThat(set.myImage).containsExactly(CallAction.Camera)
        assertThat(set.theCall).containsExactly(CallAction.Captions, CallAction.Journal).inOrder()
    }

    @Test
    fun `connected video call on a phone offers the full families in order`() {
        val set = CallActionSet.resolve(context(isVideoEnabled = true, mayRecord = true, canPictureInPicture = true))
        assertThat(set.myImage).containsExactly(
            CallAction.Camera, CallAction.FlipCamera, CallAction.Effects, CallAction.ScreenShare,
        ).inOrder()
        assertThat(set.theCall).containsExactly(
            CallAction.Captions, CallAction.Journal, CallAction.AddPeople, CallAction.React,
            CallAction.Capture, CallAction.Recording, CallAction.PictureInPicture,
        ).inOrder()
    }

    @Test
    fun `desktop has no flip and no screen share`() {
        val set = CallActionSet.resolve(context(isDesktop = true, isVideoEnabled = true))
        assertThat(set.myImage).containsExactly(CallAction.Camera, CallAction.Effects).inOrder()
    }

    @Test
    fun `selectable cameras replace flip with the picker`() {
        val set = CallActionSet.resolve(context(isVideoEnabled = true, hasSelectableCameras = true))
        assertThat(set.myImage).contains(CallAction.CameraPicker)
        assertThat(set.myImage).doesNotContain(CallAction.FlipCamera)
    }

    @Test
    fun `group audio call connected can react but not capture unless video is shown`() {
        val audio = CallActionSet.resolve(context())
        assertThat(audio.theCall).containsAtLeast(CallAction.AddPeople, CallAction.React)
        assertThat(audio.theCall).doesNotContain(CallAction.Capture)
        val withRemoteVideo = CallActionSet.resolve(context(showsVideo = true))
        assertThat(withRemoteVideo.theCall).contains(CallAction.Capture)
    }

    @Test
    fun `family rows drop empty families and contains looks in both`() {
        val set = CallActionSet(myImage = emptyList(), theCall = listOf(CallAction.Captions))
        assertThat(set.familyRows).containsExactly(CallActionFamilyRow(CallActionFamily.TheCall, listOf(CallAction.Captions)))
        assertThat(CallAction.Captions in set).isTrue()
        assertThat(CallAction.Camera in set).isFalse()
    }
}
