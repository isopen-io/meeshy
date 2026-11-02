package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CallQualityRowsTest {
    private fun reading(loss: Double = 0.0, rtt: Double = 0.0, jitter: Double = 0.0) =
        CallQualityReading(loss, rtt, jitter, audioKbps = 32.0, videoKbps = 0.0)

    @Test
    fun `pas de lecture, pas de rangée`() {
        assertThat(CallQualityRows.rows(null)).isEmpty()
    }

    @Test
    fun `cinq rangées dans l'ordre et les débits ne sont pas notés`() {
        val rows = CallQualityRows.rows(reading())
        assertThat(rows.map { it.metric }).containsExactlyElementsIn(CallQualityMetric.entries).inOrder()
        assertThat(rows.filter { it.grade == null }.map { it.metric })
            .containsExactly(CallQualityMetric.AUDIO_RATE, CallQualityMetric.VIDEO_RATE)
    }

    @Test
    fun `les bornes sont incluses vers le palier inférieur`() {
        fun grade(m: CallQualityMetric, v: Double) = CallQualityRows.grade(m, v)
        assertThat(grade(CallQualityMetric.PACKET_LOSS, 2.99)).isEqualTo(CallQualityGrade.GOOD)
        assertThat(grade(CallQualityMetric.PACKET_LOSS, 3.0)).isEqualTo(CallQualityGrade.MEDIUM)
        assertThat(grade(CallQualityMetric.PACKET_LOSS, 5.0)).isEqualTo(CallQualityGrade.POOR)
        assertThat(grade(CallQualityMetric.LATENCY, 299.0)).isEqualTo(CallQualityGrade.GOOD)
        assertThat(grade(CallQualityMetric.LATENCY, 300.0)).isEqualTo(CallQualityGrade.MEDIUM)
        assertThat(grade(CallQualityMetric.LATENCY, 450.0)).isEqualTo(CallQualityGrade.POOR)
        assertThat(grade(CallQualityMetric.JITTER, 29.0)).isEqualTo(CallQualityGrade.GOOD)
        assertThat(grade(CallQualityMetric.JITTER, 30.0)).isEqualTo(CallQualityGrade.MEDIUM)
        assertThat(grade(CallQualityMetric.JITTER, 50.0)).isEqualTo(CallQualityGrade.POOR)
    }

    @Test
    fun `la note globale est la pire des notes`() {
        val rows = CallQualityRows.rows(reading(loss = 1.0, rtt = 320.0, jitter = 60.0))
        assertThat(CallQualityRows.overall(rows)).isEqualTo(CallQualityGrade.POOR)
        assertThat(CallQualityRows.overall(CallQualityRows.rows(reading()))).isEqualTo(CallQualityGrade.GOOD)
        assertThat(CallQualityRows.overall(emptyList())).isNull()
    }
}
