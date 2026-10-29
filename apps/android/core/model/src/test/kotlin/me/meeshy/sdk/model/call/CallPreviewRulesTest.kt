package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CallPreviewRulesTest {

    @Test
    fun `chaque etat de l'automate a sa phase d'apercu, comme iOS previewPhase`() {
        assertThat(CallPreviewPhase.of(CallState.Idle)).isEqualTo(CallPreviewPhase.None)
        assertThat(CallPreviewPhase.of(CallState.Ringing(isOutgoing = false))).isEqualTo(CallPreviewPhase.IncomingRinging)
        assertThat(CallPreviewPhase.of(CallState.Ringing(isOutgoing = true))).isEqualTo(CallPreviewPhase.OutgoingRinging)
        assertThat(CallPreviewPhase.of(CallState.Offering)).isEqualTo(CallPreviewPhase.OutgoingRinging)
        assertThat(CallPreviewPhase.of(CallState.Connecting)).isEqualTo(CallPreviewPhase.Answering)
        assertThat(CallPreviewPhase.of(CallState.Connected)).isEqualTo(CallPreviewPhase.Connected)
        assertThat(CallPreviewPhase.of(CallState.Reconnecting(1))).isEqualTo(CallPreviewPhase.Connected)
        assertThat(CallPreviewPhase.of(CallState.Ended(CallEndReason.Rejected))).isEqualTo(CallPreviewPhase.Ended)
    }

    @Test
    fun `un contact jamais appele ne nous entend pas mais nous voit`() {
        assertThat(CallPreviewConsent.INITIAL).isEqualTo(CallPreviewConsent(sendsAudio = false, sendsVideo = true))
    }

    @Test
    fun `l'apercu envoie le micro consenti s'il n'est pas coupe, la camera consentie sur un appel video`() {
        val both = CallPreviewConsent(sendsAudio = true, sendsVideo = true)

        assertThat(both.sendsAudio(micMuted = false)).isTrue()
        assertThat(both.sendsAudio(micMuted = true)).isFalse()
        assertThat(both.sendsVideo(videoEnabled = true)).isTrue()
        assertThat(both.sendsVideo(videoEnabled = false)).isFalse()
        assertThat(CallPreviewConsent.INITIAL.sendsAudio(micMuted = false)).isFalse()
    }

    @Test
    fun `l'appele voit des que la camera l'atteint, n'entend que s'il a active le son`() {
        val consent = CallPreviewConsent(sendsAudio = true, sendsVideo = true)
        fun exposure(reaches: Boolean, heard: Boolean, micMuted: Boolean = false, video: Boolean = true) =
            CallPreviewExposure.of(reaches, heard, consent, micMuted, video)

        assertThat(exposure(reaches = false, heard = true)).isEqualTo(CallPreviewExposure.Nothing)
        assertThat(exposure(reaches = true, heard = false)).isEqualTo(CallPreviewExposure.Seen)
        assertThat(exposure(reaches = true, heard = true)).isEqualTo(CallPreviewExposure.SeenAndHeard)
        assertThat(exposure(reaches = true, heard = true, video = false)).isEqualTo(CallPreviewExposure.Heard)
        assertThat(exposure(reaches = true, heard = true, micMuted = true)).isEqualTo(CallPreviewExposure.Seen)
        assertThat(CallPreviewExposure.of(true, true, CallPreviewConsent.INITIAL, false, true)).isEqualTo(CallPreviewExposure.Seen)
    }

    @Test
    fun `le canal de controle porte audible dans la forme d'iOS et du web`() {
        assertThat(String(CallPreviewControl.encode(audible = true), Charsets.UTF_8)).isEqualTo("""{"audible":true}""")
        assertThat(CallPreviewControl.decode("""{"audible":false}""".toByteArray())).isFalse()
        assertThat(CallPreviewControl.decode("""{"audible":true,"other":1}""".toByteArray())).isTrue()
        assertThat(CallPreviewControl.decode("pas du json".toByteArray())).isNull()
        assertThat(CallPreviewControl.decode("""{"volume":1}""".toByteArray())).isNull()
        assertThat(CallPreviewControl.CHANNEL_LABEL).isEqualTo("meeshy-preview-control")
    }

    @Test
    fun `les serveurs ICE par defaut sont les STUN publics d'iOS`() {
        assertThat(CallPreviewIce.DEFAULT_SERVERS.flatMap { it.urls }).containsExactly(
            "stun:stun.l.google.com:19302",
            "stun:stun1.l.google.com:19302",
            "stun:stun2.l.google.com:19302",
            "stun:stun6.l.google.com:19302",
            "stun:stun.cloudflare.com:3478",
        ).inOrder()
        assertThat(CallPreviewIce.orDefault(emptyList())).isEqualTo(CallPreviewIce.DEFAULT_SERVERS)
        val turn = listOf(SocketIceServer(urls = listOf("turn:t"), username = "u", credential = "c"))
        assertThat(CallPreviewIce.orDefault(turn)).isEqualTo(turn)
    }
}
