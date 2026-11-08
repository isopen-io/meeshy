package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CallSdpRulesTest {

    private fun sdp(vararg lines: String) = lines.joinToString("\r\n") + "\r\n"

    private val wifiAudio = CallDataProfile.WIFI.budget.audio

    private val reference = sdp(
        "v=0",
        "m=audio 9 UDP/TLS/RTP/SAVPF 111 63 9",
        "a=extmap:1 urn:ietf:params:rtp-hdrext:ssrc-audio-level",
        "a=mid:0",
        "a=rtpmap:111 opus/48000/2",
        "a=fmtp:111 minptime=10;useinbandfec=1",
        "a=rtpmap:63 red/48000/2",
        "m=video 9 UDP/TLS/RTP/SAVPF 96 97 98 99",
        "a=extmap:2 urn:ietf:params:rtp-hdrext:toffset",
        "a=mid:1",
        "a=rtpmap:96 VP8/90000",
        "a=rtpmap:97 rtx/90000",
        "a=fmtp:97 apt=96",
        "a=rtpmap:98 H264/90000",
        "a=fmtp:98 level-asymmetry-allowed=1;packetization-mode=1",
        "a=rtpmap:99 rtx/90000",
        "a=fmtp:99 apt=98",
    )

    private fun fmtp(sdp: String, pt: String) = sdp.split("\r\n").first { it.startsWith("a=fmtp:$pt ") }

    @Test
    fun `the opus fmtp is overridden not duplicated and unrelated hints survive`() {
        val out = CallSdpRules.mungeOpus(
            sdp("v=0", "m=audio 9 UDP/TLS/RTP/SAVPF 111", "a=rtpmap:111 opus/48000/2", "a=fmtp:111 minptime=10; stereo=1; useinbandfec=1"),
            wifiAudio,
        )
        val line = fmtp(out, "111")
        assertThat(line).doesNotContain("stereo=1")
        assertThat(line.split("useinbandfec=")).hasSize(2)
        assertThat(line).contains("minptime=10")
        assertThat(line).contains("maxaveragebitrate=32000")
        assertThat(line).contains("usedtx=1")
        assertThat(line).doesNotContain("; ")
    }

    @Test
    fun `a missing fmtp line is inserted right after the opus rtpmap`() {
        val out = CallSdpRules.mungeOpus(sdp("v=0", "m=audio 9 X 111", "a=rtpmap:111 opus/48000/2", "a=mid:0"), CallDataProfile.CELLULAR.budget.audio)
        val lines = out.split("\r\n")
        assertThat(lines[lines.indexOf("a=rtpmap:111 opus/48000/2") + 1]).startsWith("a=fmtp:111 maxaveragebitrate=24000;")
    }

    @Test
    fun `an sdp without opus is left untouched`() {
        val original = sdp("v=0", "m=audio 9 X 0", "a=rtpmap:0 PCMU/8000")
        assertThat(CallSdpRules.mungeOpus(original, wifiAudio)).isEqualTo(original)
    }

    @Test
    fun `transport-cc is declared once per media section under a free id`() {
        val out = CallSdpRules.addTransportCc(reference)
        val ext = out.split("\r\n").filter { it.contains("transport-wide-cc") }
        assertThat(ext).hasSize(2)
        assertThat(ext).containsExactly(
            "a=extmap:5 http://www.ietf.org/id/draft-holmer-rmcat-transport-wide-cc-extensions-01",
            "a=extmap:5 http://www.ietf.org/id/draft-holmer-rmcat-transport-wide-cc-extensions-01",
        )
        assertThat(CallSdpRules.addTransportCc(out)).isEqualTo(out)
    }

    @Test
    fun `transport-cc skips taken ids and is not injected when none is left`() {
        val taken = sdp("v=0", "m=audio 9 X 111", "a=extmap:5/sendrecv urn:a", "a=mid:0")
        assertThat(CallSdpRules.addTransportCc(taken)).contains("a=extmap:6 http://")
        val full = sdp("v=0", "m=audio 9 X 111") + (5..14).joinToString("") { "a=extmap:$it urn:x$it\r\n" }
        assertThat(CallSdpRules.addTransportCc(full)).isEqualTo(full)
    }

    @Test
    fun `video bitrate hints go on video fmtp lines only, once`() {
        val out = CallSdpRules.addVideoBitrateHints(reference)
        assertThat(fmtp(out, "98")).endsWith(";x-google-max-bitrate=2500;x-google-min-bitrate=100")
        assertThat(fmtp(out, "111")).doesNotContain("x-google")
        assertThat(CallSdpRules.addVideoBitrateHints(out)).isEqualTo(out)
    }

    @Test
    fun `the first offer carries the opus fmtp, transport-cc, the hints and H264 first`() {
        val out = CallSdpRules.transformLocal(reference, wifiAudio)
        assertThat(fmtp(out, "111")).contains("usedtx=1")
        assertThat(out).contains("transport-wide-cc")
        assertThat(fmtp(out, "98")).contains("x-google-max-bitrate")
        assertThat(out.split("\r\n").first { it.startsWith("m=video") }).isEqualTo("m=video 9 UDP/TLS/RTP/SAVPF 98 99 96 97")
    }
}
