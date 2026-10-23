package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** Octets par type de flux, route relayée et lecture dérivée : le tick de 5 s côté lois pures. */
class CallLiveStatsLawsTest {
    private fun candidate(id: String, type: String) =
        CallStats.RawEntry(id, "local-candidate", strings = mapOf("candidateType" to type))

    private fun pair(id: String, local: String, remote: String, nominated: Boolean = true) = CallStats.RawEntry(
        id,
        "candidate-pair",
        values = mapOf("nominated" to if (nominated) 1.0 else 0.0, "currentRoundTripTime" to 0.04),
        strings = mapOf("state" to "succeeded", "localCandidateId" to local, "remoteCandidateId" to remote),
    )

    @Test
    fun `la paire sélectionnée par le transport donne la route`() {
        val entries = listOf(
            CallStats.RawEntry("T", "transport", strings = mapOf("selectedCandidatePairId" to "P2")),
            pair("P1", "L1", "R1"),
            pair("P2", "L2", "R2"),
            candidate("L1", "host"), candidate("R1", "host"),
            candidate("L2", "relay"), candidate("R2", "srflx"),
        )
        assertThat(CallStats.reduce(entries).relayed).isTrue()
    }

    @Test
    fun `sans transport la paire nommée réussie fait foi, et direct si aucun relais`() {
        val entries = listOf(pair("P1", "L1", "R1"), candidate("L1", "host"), candidate("R1", "srflx"))
        assertThat(CallStats.reduce(entries).relayed).isFalse()
    }

    @Test
    fun `aucune paire connue donne une route inconnue`() {
        assertThat(CallStats.reduce(emptyList()).relayed).isNull()
        assertThat(CallStats.reduce(listOf(pair("P1", "L1", "R1"))).relayed).isNull()
    }

    @Test
    fun `les octets entrants se séparent par type de flux`() {
        val stats = CallStats.reduce(
            listOf(
                CallStats.RawEntry("a", "inbound-rtp", kind = "audio", values = mapOf("bytesReceived" to 1_000.0)),
                CallStats.RawEntry("v", "inbound-rtp", kind = "video", values = mapOf("bytesReceived" to 9_000.0)),
            ),
        )
        assertThat(stats.inboundAudioBytes).isEqualTo(1_000)
        assertThat(stats.inboundVideoBytes).isEqualTo(9_000)
        assertThat(stats.bytesReceived).isEqualTo(10_000)
    }

    @Test
    fun `un compteur qui recule ne produit ni perte négative ni cent pour cent`() {
        val before = CallStats(packetsLost = 50, inboundPacketsReceived = 1_000)
        val afterRestart = CallStats(packetsLost = 2, inboundPacketsReceived = 40)
        assertThat(afterRestart.intervalQualitySample(before).packetLoss).isEqualTo(0.0)
    }

    private fun tick(atMs: Long, audio: Long, video: Long) =
        CallQualityTick(atMs, rttMs = 40.0, packetLossPercent = 1.5, jitterMs = 8.0, inboundAudioBytes = audio, inboundVideoBytes = video, relayed = true)

    @Test
    fun `le premier tick n'a pas de débit`() {
        val reading = CallQualityReading.derive(tick(5_000, 10_000, 50_000), previous = null)
        assertThat(reading.audioKbps).isEqualTo(0.0)
        assertThat(reading.videoKbps).isEqualTo(0.0)
        assertThat(reading.relayed).isTrue()
        assertThat(reading.packetLossPercent).isEqualTo(1.5)
    }

    @Test
    fun `les débits se dérivent de l'écart entre deux ticks`() {
        val reading = CallQualityReading.derive(tick(10_000, 15_000, 150_000), tick(5_000, 10_000, 50_000))
        assertThat(reading.audioKbps).isWithin(1e-9).of(8.0)
        assertThat(reading.videoKbps).isWithin(1e-9).of(160.0)
    }

    @Test
    fun `un compteur d'octets qui recule donne zéro`() {
        val reading = CallQualityReading.derive(tick(10_000, 100, 100), tick(5_000, 10_000, 50_000))
        assertThat(reading.audioKbps).isEqualTo(0.0)
        assertThat(reading.videoKbps).isEqualTo(0.0)
    }

    @Test
    fun `le rapport serveur porte le palier sur quatre niveaux et la perte en pourcent`() {
        val report = CallQualitySample(
            rttMs = 900.0, packetLoss = 0.02, jitterMs = 12.0,
            bytesSent = 4_000, bytesReceived = 8_000, availableOutgoingBitrateBps = 300_000,
        ).toReport()
        assertThat(report.level).isEqualTo(ConnectionQuality.POOR)
        assertThat(report.packetLoss).isWithin(1e-9).of(2.0)
        assertThat(report.statsFields()).containsEntry("level", "poor")
        assertThat(report.statsFields()).containsEntry("jitterMs", 12.0)
        assertThat(report.statsFields()).containsEntry("availableOutgoingBitrateBps", 300_000)
    }

    @Test
    fun `les seuils sont ceux de QualityThresholds iOS`() {
        assertThat(CallQualityThresholds.EXCELLENT_RTT_MS).isEqualTo(100.0)
        assertThat(CallQualityThresholds.GOOD_RTT_MS).isEqualTo(250.0)
        assertThat(CallQualityThresholds.POOR_RTT_MS).isEqualTo(800.0)
        assertThat(CallQualityThresholds.VIDEO_FAIR_RTT_MS).isEqualTo(300.0)
        assertThat(CallQualityThresholds.VIDEO_POOR_RTT_MS).isEqualTo(500.0)
        assertThat(CallQualityThresholds.EXCELLENT_PACKET_LOSS).isEqualTo(0.01)
        assertThat(CallQualityThresholds.VIDEO_FAIR_PACKET_LOSS).isEqualTo(0.03)
        assertThat(CallQualityThresholds.GOOD_PACKET_LOSS).isEqualTo(0.05)
        assertThat(CallQualityThresholds.POOR_PACKET_LOSS).isEqualTo(0.10)
        assertThat(CallQualityThresholds.MAX_AUDIO_BITRATE_BPS).isEqualTo(128_000)
        assertThat(CallQualityThresholds.DEFAULT_AUDIO_BITRATE_BPS).isEqualTo(64_000)
        assertThat(CallQualityThresholds.MIN_AUDIO_BITRATE_BPS).isEqualTo(24_000)
        assertThat(CallQualityThresholds.HIGH_JITTER_MS).isEqualTo(30.0)
        assertThat(CallQualityThresholds.STATS_INTERVAL_SECONDS).isEqualTo(5L)
    }
}
