package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Assert.assertThrows
import org.junit.Test

class WebRtcSdpRulesTest {

    private val referenceOffer = listOf(
        "v=0",
        "o=- 4611731400430051336 2 IN IP4 127.0.0.1",
        "s=-",
        "t=0 0",
        "a=group:BUNDLE 0",
        "m=audio 9 UDP/TLS/RTP/SAVPF 111",
        "a=mid:0",
        "a=sendrecv",
        "a=rtpmap:111 opus/48000/2",
    ).joinToString("\r\n")

    private fun candidate(
        mid: String? = "0",
        index: Int = 0,
        line: String = "candidate:1 1 udp 2122260223 192.168.1.2 54321 typ host",
    ) = IceCandidateLine(mid, index, line)

    @Test
    fun `un SDP de reference est admis`() {
        assertThat(WebRtcSdpRules.rejectionOf(referenceOffer)).isNull()
    }

    @Test
    fun `un SDP vide est refuse`() {
        assertThat(WebRtcSdpRules.rejectionOf("")).isEqualTo(SdpRejection.Empty)
    }

    @Test
    fun `un SDP qui ne commence pas par v=0 est refuse`() {
        assertThat(WebRtcSdpRules.rejectionOf("o=- 1 2 IN IP4 0.0.0.0\r\nv=0")).isEqualTo(SdpRejection.MissingVersionLine)
    }

    @Test
    fun `un SDP demesure est refuse mais la borne exacte passe`() {
        val atLimit = "v=0" + "a".repeat(WebRtcSdpRules.MAX_SDP_LENGTH - 3)
        assertThat(WebRtcSdpRules.rejectionOf(atLimit)).isNull()
        assertThat(WebRtcSdpRules.rejectionOf(atLimit + "a")).isEqualTo(SdpRejection.TooLarge)
    }

    @Test
    fun `requireValidRemoteSdp leve une erreur typee portant le motif`() {
        val error = assertThrows(WebRtcError.InvalidRemoteDescription::class.java) {
            WebRtcSdpRules.requireValidRemoteSdp("garbage")
        }
        assertThat(error.reason).isEqualTo(SdpRejection.MissingVersionLine)
    }

    @Test
    fun `un candidat ordinaire est admis`() {
        assertThat(WebRtcSdpRules.admits(candidate())).isTrue()
        assertThat(WebRtcSdpRules.admits(candidate(mid = null))).isTrue()
    }

    @Test
    fun `l'index de m-line doit etre entre 0 et 255`() {
        assertThat(WebRtcSdpRules.admits(candidate(index = 255))).isTrue()
        assertThat(WebRtcSdpRules.admits(candidate(index = 256))).isFalse()
        assertThat(WebRtcSdpRules.admits(candidate(index = -1))).isFalse()
    }

    @Test
    fun `un sdpMid ou une ligne trop longs sont refuses`() {
        assertThat(WebRtcSdpRules.admits(candidate(mid = "m".repeat(256)))).isTrue()
        assertThat(WebRtcSdpRules.admits(candidate(mid = "m".repeat(257)))).isFalse()
        assertThat(WebRtcSdpRules.admits(candidate(line = "c".repeat(10_000)))).isTrue()
        assertThat(WebRtcSdpRules.admits(candidate(line = "c".repeat(10_001)))).isFalse()
    }
}
