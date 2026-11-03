package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CodecPreferencesTest {

    @Test
    fun `audio prefers opus then red, the rest behind`() {
        assertThat(CallCodecPreferences.ordered(listOf("PCMU", "red", "opus", "G722"), CallCodecPreferences.AUDIO))
            .containsExactly("opus", "red", "PCMU", "G722").inOrder()
    }

    @Test
    fun `video prefers H264 then VP8 then VP9, case-insensitively`() {
        assertThat(CallCodecPreferences.ordered(listOf("VP9", "AV1", "vp8", "h264"), CallCodecPreferences.VIDEO))
            .containsExactly("h264", "vp8", "VP9", "AV1").inOrder()
    }

    @Test
    fun `the payload order of a section follows the preference and rtx follows its codec`() {
        val sdp = listOf(
            "v=0",
            "m=audio 9 UDP/TLS/RTP/SAVPF 9 63 111 110",
            "a=rtpmap:9 G722/8000",
            "a=rtpmap:63 red/48000/2",
            "a=rtpmap:111 opus/48000/2",
            "a=rtpmap:110 telephone-event/48000",
            "m=video 9 UDP/TLS/RTP/SAVPF 100 101 102 103 104",
            "a=rtpmap:100 VP9/90000",
            "a=rtpmap:101 rtx/90000",
            "a=fmtp:101 apt=100",
            "a=rtpmap:102 H264/90000",
            "a=rtpmap:103 rtx/90000",
            "a=fmtp:103 apt=102",
            "a=rtpmap:104 VP8/90000",
        ).joinToString("\r\n")
        val lines = CallCodecPreferences.apply(sdp).split("\r\n")
        assertThat(lines.first { it.startsWith("m=audio") }).isEqualTo("m=audio 9 UDP/TLS/RTP/SAVPF 111 63 9 110")
        assertThat(lines.first { it.startsWith("m=video") }).isEqualTo("m=video 9 UDP/TLS/RTP/SAVPF 102 103 104 100 101")
    }

    @Test
    fun `a section without a preferred codec is unchanged`() {
        val sdp = "v=0\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\na=mid:2"
        assertThat(CallCodecPreferences.apply(sdp)).isEqualTo(sdp)
    }
}
