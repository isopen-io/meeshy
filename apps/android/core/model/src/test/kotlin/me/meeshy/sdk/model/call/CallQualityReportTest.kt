package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural coverage for [CallQualityReport.statsFields] — the pure SSOT for the
 * `stats` sub-object of the `call:quality-report` frame. Mirrors the conditional
 * field inclusion of the iOS `MessageSocketManager.emitCallQualityReport`: the base
 * five metrics are always present, while `availableOutgoingBitrateBps` and `jitterMs`
 * are emitted **only when strictly positive** (a zero/absent estimate is dropped so
 * the gateway never persists a meaningless `0`).
 */
class CallQualityReportTest {

    private fun report(
        level: ConnectionQuality = ConnectionQuality.GOOD,
        rttMs: Double = 120.0,
        packetLoss: Double = 0.02,
        bytesSent: Long = 1_000L,
        bytesReceived: Long = 2_000L,
        availableOutgoingBitrateBps: Int = 0,
        jitterMs: Double = 0.0,
    ) = CallQualityReport(
        level = level,
        rttMs = rttMs,
        packetLoss = packetLoss,
        bytesSent = bytesSent,
        bytesReceived = bytesReceived,
        availableOutgoingBitrateBps = availableOutgoingBitrateBps,
        jitterMs = jitterMs,
    )

    // --- The always-present base metrics ---

    @Test
    fun `base metrics are always present with the iOS wire keys`() {
        val fields = report(
            level = ConnectionQuality.FAIR,
            rttMs = 180.0,
            packetLoss = 0.04,
            bytesSent = 5_000L,
            bytesReceived = 7_000L,
        ).statsFields()

        assertThat(fields.keys).containsExactly(
            "level", "rtt", "packetLoss", "bytesSent", "bytesReceived",
        )
        assertThat(fields["level"]).isEqualTo("fair")
        assertThat(fields["rtt"]).isEqualTo(180.0)
        assertThat(fields["packetLoss"]).isEqualTo(0.04)
        assertThat(fields["bytesSent"]).isEqualTo(5_000L)
        assertThat(fields["bytesReceived"]).isEqualTo(7_000L)
    }

    // --- Every ConnectionQuality tier maps to its lowercase wire level ---

    @Test
    fun `each connection-quality tier serialises to its lowercase wire level`() {
        assertThat(report(level = ConnectionQuality.EXCELLENT).statsFields()["level"]).isEqualTo("excellent")
        assertThat(report(level = ConnectionQuality.GOOD).statsFields()["level"]).isEqualTo("good")
        assertThat(report(level = ConnectionQuality.FAIR).statsFields()["level"]).isEqualTo("fair")
        assertThat(report(level = ConnectionQuality.POOR).statsFields()["level"]).isEqualTo("poor")
    }

    // --- availableOutgoingBitrateBps: included iff strictly positive ---

    @Test
    fun `positive bitrate estimate is included`() {
        val fields = report(availableOutgoingBitrateBps = 1_200_000).statsFields()
        assertThat(fields).containsEntry("availableOutgoingBitrateBps", 1_200_000)
    }

    @Test
    fun `zero bitrate estimate is dropped`() {
        assertThat(report(availableOutgoingBitrateBps = 0).statsFields())
            .doesNotContainKey("availableOutgoingBitrateBps")
    }

    @Test
    fun `negative bitrate estimate is dropped`() {
        assertThat(report(availableOutgoingBitrateBps = -1).statsFields())
            .doesNotContainKey("availableOutgoingBitrateBps")
    }

    // --- jitterMs: included iff strictly positive ---

    @Test
    fun `positive jitter is included`() {
        val fields = report(jitterMs = 12.5).statsFields()
        assertThat(fields).containsEntry("jitterMs", 12.5)
    }

    @Test
    fun `zero jitter is dropped`() {
        assertThat(report(jitterMs = 0.0).statsFields()).doesNotContainKey("jitterMs")
    }

    @Test
    fun `negative jitter is dropped`() {
        assertThat(report(jitterMs = -3.0).statsFields()).doesNotContainKey("jitterMs")
    }

    // --- Both optionals together ---

    @Test
    fun `both optional metrics are appended after the base metrics when positive`() {
        val fields = report(availableOutgoingBitrateBps = 800_000, jitterMs = 4.0).statsFields()
        assertThat(fields.keys).containsExactly(
            "level", "rtt", "packetLoss", "bytesSent", "bytesReceived",
            "availableOutgoingBitrateBps", "jitterMs",
        ).inOrder()
    }

    @Test
    fun `cumulative byte counters survive values beyond the 32-bit range`() {
        val overInt = 5_000_000_000L
        val fields = report(bytesSent = overInt, bytesReceived = overInt + 1).statsFields()
        assertThat(fields["bytesSent"]).isEqualTo(overInt)
        assertThat(fields["bytesReceived"]).isEqualTo(overInt + 1)
    }
}
