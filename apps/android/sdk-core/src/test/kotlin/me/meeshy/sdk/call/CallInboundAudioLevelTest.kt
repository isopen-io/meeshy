package me.meeshy.sdk.call

import com.google.common.truth.Truth.assertThat
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import org.junit.Test
import org.webrtc.RTCStats
import org.webrtc.RTCStatsCollectorCallback
import org.webrtc.RTCStatsReport

/** Le niveau sonore reçu, lu dans les statistiques `inbound-rtp` audio — comme iOS `WebRTCGroupPeerLink.audioLevel`. */
class CallInboundAudioLevelTest {
    private fun stat(id: String, type: String, members: Map<String, Any>): RTCStats = mockk {
        every { this@mockk.id } returns id
        every { this@mockk.type } returns type
        every { this@mockk.members } returns members
    }

    private fun report(vararg stats: RTCStats): RTCStatsReport = mockk {
        every { statsMap } returns stats.associateBy { it.id }
    }

    private fun handle(report: RTCStatsReport?): CallPeerHandle = mockk {
        every { getStats(any()) } answers {
            if (report != null) (firstArg() as RTCStatsCollectorCallback).onStatsDelivered(report)
        }
    }

    @Test
    fun `the loudest inbound audio entry wins, video and outbound are ignored`() {
        val level = CallInboundAudioLevel.loudest(
            report(
                stat("A1", "inbound-rtp", mapOf("kind" to "audio", "audioLevel" to 0.12)),
                stat("A2", "inbound-rtp", mapOf("mediaType" to "audio", "audioLevel" to 0.31)),
                stat("V", "inbound-rtp", mapOf("kind" to "video", "audioLevel" to 0.9)),
                stat("O", "outbound-rtp", mapOf("kind" to "audio", "audioLevel" to 0.8)),
                stat("S", "media-source", mapOf("kind" to "audio", "audioLevel" to 0.7)),
            ),
        )
        assertThat(level).isWithin(1e-9).of(0.31)
    }

    @Test
    fun `no measured inbound audio reads as nothing`() {
        assertThat(CallInboundAudioLevel.loudest(report(stat("A", "inbound-rtp", mapOf("kind" to "audio"))))).isNull()
        assertThat(CallInboundAudioLevel.loudest(report())).isNull()
    }

    @Test
    fun `the call peer answers its level through getStats`() = runTest {
        val peer = handle(report(stat("A", "inbound-rtp", mapOf("kind" to "audio", "audioLevel" to 0.2))))
        assertThat(peer.inboundAudioLevel()).isWithin(1e-9).of(0.2)
    }

    @Test
    fun `a peer that never answers reads as nothing after the timeout`() = runTest {
        assertThat(handle(null).inboundAudioLevel()).isNull()
    }

    @Test
    fun `a peer that throws reads as nothing`() = runTest {
        assertThat(CallInboundAudioLevel.read { error("disposed") }).isNull()
    }
}
