package me.meeshy.sdk.call

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.call.CallDataProfile
import org.junit.Test
import org.webrtc.SessionDescription

class DataProfileSdpTransformerTest {

    private val offer = listOf(
        "v=0",
        "m=audio 9 UDP/TLS/RTP/SAVPF 111",
        "a=rtpmap:111 opus/48000/2",
        "a=fmtp:111 minptime=10",
        "m=video 9 UDP/TLS/RTP/SAVPF 96 98",
        "a=rtpmap:96 VP8/90000",
        "a=rtpmap:98 H264/90000",
        "a=fmtp:98 packetization-mode=1",
        "",
    ).joinToString("\r\n")

    private fun transform(transformer: DataProfileSdpTransformer) =
        transformer.transform(SessionDescription(SessionDescription.Type.OFFER, offer)).description

    @Test
    fun `the very first offer carries the opus voice fmtp of the default profile and lists H264 first`() {
        val out = transform(DataProfileSdpTransformer())
        assertThat(out).contains("a=fmtp:111 minptime=10;maxaveragebitrate=32000;stereo=0;sprop-stereo=0;useinbandfec=1;usedtx=1;maxplaybackrate=48000")
        assertThat(out).contains("m=video 9 UDP/TLS/RTP/SAVPF 98 96")
    }

    @Test
    fun `the profile set before the offer decides the opus ceiling`() {
        val transformer = DataProfileSdpTransformer().apply { profile = CallDataProfile.DATA_SAVER }
        assertThat(transform(transformer)).contains("maxaveragebitrate=20000")
    }

    @Test
    fun `the type is kept and an empty description passes through`() {
        val rollback = SessionDescription(SessionDescription.Type.ROLLBACK, "")
        assertThat(DataProfileSdpTransformer().transform(rollback)).isSameInstanceAs(rollback)
        assertThat(DataProfileSdpTransformer().transform(SessionDescription(SessionDescription.Type.ANSWER, offer)).type)
            .isEqualTo(SessionDescription.Type.ANSWER)
    }
}
