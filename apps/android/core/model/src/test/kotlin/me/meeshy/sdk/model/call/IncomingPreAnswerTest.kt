package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** P17.6 à P17.9 : ce que je choisis AVANT de décrocher, miroir de iOS `IncomingPreAnswer`. */
class IncomingPreAnswerTest {

    private val initial = IncomingPreAnswer()

    @Test
    fun `par defaut le micro est ouvert et la camera choisie`() {
        assertThat(initial.microphoneOn).isTrue()
        assertThat(initial.cameraOn).isTrue()
        assertThat(initial.answersMuted).isFalse()
    }

    @Test
    fun `les bascules ne touchent chacune que leur etat`() {
        val muted = initial.togglingMicrophone()
        assertThat(muted.microphoneOn).isFalse()
        assertThat(muted.cameraOn).isTrue()
        assertThat(muted.answersMuted).isTrue()

        val blind = initial.togglingCamera()
        assertThat(blind.cameraOn).isFalse()
        assertThat(blind.microphoneOn).isTrue()
        assertThat(blind.togglingCamera()).isEqualTo(initial)
    }

    @Test
    fun `P17_7 - quatre phrases selon ce que l'autre recevra`() {
        assertThat(initial.exposure(isVideoCall = true, hasLocalVideoTrack = true)).isEqualTo(IncomingPreAnswer.Exposure.SeenAndHeard)
        assertThat(initial.togglingCamera().exposure(isVideoCall = true, hasLocalVideoTrack = true)).isEqualTo(IncomingPreAnswer.Exposure.HeardOnly)
        assertThat(initial.togglingMicrophone().exposure(isVideoCall = true, hasLocalVideoTrack = true)).isEqualTo(IncomingPreAnswer.Exposure.SeenMuted)
        assertThat(initial.togglingMicrophone().togglingCamera().exposure(isVideoCall = true, hasLocalVideoTrack = true))
            .isEqualTo(IncomingPreAnswer.Exposure.Neither)
    }

    @Test
    fun `P17_7 - vous verra n'est promis que si la camera filme vraiment`() {
        assertThat(initial.cameraFilms(isVideoCall = true, hasLocalVideoTrack = false)).isFalse()
        assertThat(initial.exposure(isVideoCall = true, hasLocalVideoTrack = false)).isEqualTo(IncomingPreAnswer.Exposure.HeardOnly)
        assertThat(initial.exposure(isVideoCall = false, hasLocalVideoTrack = true)).isEqualTo(IncomingPreAnswer.Exposure.HeardOnly)
        assertThat(initial.togglingMicrophone().exposure(isVideoCall = true, hasLocalVideoTrack = false)).isEqualTo(IncomingPreAnswer.Exposure.Neither)
    }

    @Test
    fun `P17_9 - camera coupee, Repondre part par la reponse sans video`() {
        assertThat(initial.route(isVideoCall = true)).isEqualTo(IncomingPreAnswer.Route.AsOffered)
        assertThat(initial.togglingCamera().route(isVideoCall = true)).isEqualTo(IncomingPreAnswer.Route.WithoutVideo)
        assertThat(initial.togglingCamera().route(isVideoCall = false)).isEqualTo(IncomingPreAnswer.Route.AsOffered)
    }
}
