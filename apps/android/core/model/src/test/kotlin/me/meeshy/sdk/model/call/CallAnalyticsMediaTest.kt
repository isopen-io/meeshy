package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * #19895 — `call:analytics` rapporte les gels, la limitation, le tampon de gigue,
 * le MOS et le relais de l'appel, comme le web (`analyticsPayload`, #19876) et
 * iOS : chaque champ SEULEMENT s'il a été mesuré, jamais un 0 inventé, jamais
 * une valeur non finie, toujours dans les bornes de `socketCallAnalyticsSchema`
 * (un payload invalide perd toute la télémétrie de l'appel).
 */
class CallAnalyticsMediaTest {

    private val qualityFields = listOf(
        "freezeCount", "totalFreezesDuration", "qualityLimitationReason", "jitterBufferDelay",
        "concealedSamples", "nackCount", "pliCount", "mos", "candidateType", "relayProtocol",
    )

    private fun sample(media: CallMediaQuality?, rtt: Double = 120.0, loss: Double = 0.01, jitter: Double = 10.0) =
        CallQualitySample(rttMs = rtt, packetLoss = loss, jitterMs = jitter, media = media)

    private fun fieldsOf(analytics: CallAnalytics): Map<String, Any> =
        analytics.fields(durationSeconds = 60, isVideo = true, endReason = CallEndReason.Local, deviceModel = "Pixel 8")

    private val full = CallMediaQuality(
        freezeCount = 3.0,
        totalFreezesDuration = 1.25,
        jitterBufferDelay = 4.0,
        jitterBufferEmittedCount = 100.0,
        concealedSamples = 480.4,
        nackCount = 12.0,
        pliCount = 2.0,
        qualityLimitationReason = "bandwidth",
        candidateType = "relay",
        relayProtocol = "tcp",
    )

    @Test
    fun `sans lecture media, aucun champ de qualite ne part`() {
        val analytics = CallAnalytics(startedAtMs = 0).plusSample(sample(media = null))
        assertThat(fieldsOf(analytics).keys).containsNoneIn(qualityFields)
        assertThat(fieldsOf(CallAnalytics(startedAtMs = 0)).keys).containsNoneIn(qualityFields)
    }

    @Test
    fun `une lecture vide ne fait partir que le MOS, rien d'invente`() {
        val fields = fieldsOf(CallAnalytics(startedAtMs = 0).plusSample(sample(CallMediaQuality())))
        assertThat(fields.keys.filter { it in qualityFields }).containsExactly("mos")
    }

    @Test
    fun `une lecture complete fait partir les dix champs, comptes arrondis et tampon en millisecondes moyennes`() {
        val fields = fieldsOf(CallAnalytics(startedAtMs = 0).plusSample(sample(full)))
        assertThat(fields["freezeCount"]).isEqualTo(3L)
        assertThat(fields["totalFreezesDuration"]).isEqualTo(1.25)
        assertThat(fields["qualityLimitationReason"]).isEqualTo("bandwidth")
        assertThat(fields["jitterBufferDelay"]).isEqualTo(40.0)
        assertThat(fields["concealedSamples"]).isEqualTo(480L)
        assertThat(fields["nackCount"]).isEqualTo(12L)
        assertThat(fields["pliCount"]).isEqualTo(2L)
        assertThat(fields["candidateType"]).isEqualTo("relay")
        assertThat(fields["relayProtocol"]).isEqualTo("tcp")
        assertThat(fields.keys).containsAtLeastElementsIn(qualityFields)
    }

    @Test
    fun `le dernier releve fait foi, et un tick sans lecture media ne l'efface pas`() {
        val analytics = CallAnalytics(startedAtMs = 0)
            .plusSample(sample(full.copy(freezeCount = 1.0)))
            .plusSample(sample(full.copy(freezeCount = 5.0)))
            .plusSample(sample(media = null))
        assertThat(fieldsOf(analytics)["freezeCount"]).isEqualTo(5L)
    }

    @Test
    fun `le MOS se calcule sur les moyennes de l'appel, la perte en pourcentage`() {
        val analytics = CallAnalytics(startedAtMs = 0)
            .plusSample(sample(full, rtt = 100.0, loss = 0.01, jitter = 10.0))
            .plusSample(sample(full, rtt = 300.0, loss = 0.03, jitter = 30.0))
        val expected = Math.round(CallMos.estimate(roundTripTimeMs = 200.0, jitterMs = 20.0, packetLossPercent = 2.0) * 100) / 100.0
        assertThat(fieldsOf(analytics)["mos"] as Double).isWithin(1e-9).of(expected)
    }

    @Test
    fun `la cause dominante est la plus frequente, a egalite la premiere dans l'ordre alphabetique`() {
        fun reasons(vararg names: String) = names.fold(CallAnalytics(startedAtMs = 0)) { acc, name ->
            acc.plusSample(sample(CallMediaQuality(qualityLimitationReason = name)))
        }
        assertThat(fieldsOf(reasons("cpu", "bandwidth", "cpu"))["qualityLimitationReason"]).isEqualTo("cpu")
        assertThat(fieldsOf(reasons("none", "cpu"))["qualityLimitationReason"]).isEqualTo("cpu")
        assertThat(fieldsOf(reasons("quantum", "quantum")).keys).doesNotContain("qualityLimitationReason")
    }

    @Test
    fun `sans compte emis positif, le tampon de gigue ne part pas`() {
        val fields = fieldsOf(CallAnalytics(startedAtMs = 0).plusSample(sample(full.copy(jitterBufferEmittedCount = null))))
        assertThat(fields.keys).doesNotContain("jitterBufferDelay")
    }

    @Test
    fun `l'instantane en cours porte les memes champs`() {
        val analytics = CallAnalytics(startedAtMs = 0).plusSample(sample(full))
        val snapshot = analytics.inProgressFields(durationSeconds = 60, isVideo = true, deviceModel = "Pixel 8")
        assertThat(snapshot["freezeCount"]).isEqualTo(3L)
        assertThat(snapshot.keys).contains("mos")
    }

    @Test
    fun `des stats hostiles produisent un payload conforme aux bornes du schema`() {
        val hostile = CallMediaQuality(
            freezeCount = Double.POSITIVE_INFINITY,
            totalFreezesDuration = Double.MAX_VALUE * 2,
            jitterBufferDelay = Double.MAX_VALUE,
            jitterBufferEmittedCount = 1e-300,
            concealedSamples = Double.NaN,
            nackCount = -4.0,
            pliCount = 1e30,
            qualityLimitationReason = "quantum",
            candidateType = "relay-candidate-type-longer-than-twenty",
            relayProtocol = "x".repeat(64),
        )
        val analytics = CallAnalytics(startedAtMs = 0)
            .plusSample(sample(hostile, rtt = Double.NaN, loss = Double.POSITIVE_INFINITY, jitter = Double.NaN))
        val fields = fieldsOf(analytics)

        assertSchemaBounds(fields)
        assertThat(fields.keys).containsNoneOf("freezeCount", "totalFreezesDuration", "jitterBufferDelay", "concealedSamples", "nackCount", "pliCount", "qualityLimitationReason")
        assertThat(fields["candidateType"]).isEqualTo("relay-candidate-type")
        assertThat(fields["relayProtocol"]).isEqualTo("x".repeat(20))
    }

    /** Les bornes des dix champs optionnels de `socketCallAnalyticsSchema`. */
    private fun assertSchemaBounds(fields: Map<String, Any>) {
        listOf("freezeCount", "concealedSamples", "nackCount", "pliCount").forEach { key ->
            fields[key]?.let { count ->
                assertThat(count as Long).isAtLeast(0L)
                assertThat(count).isAtMost(9_007_199_254_740_991L)
            }
        }
        listOf("totalFreezesDuration", "jitterBufferDelay").forEach { key ->
            fields[key]?.let { value ->
                assertThat((value as Double).isFinite()).isTrue()
                assertThat(value).isAtLeast(0.0)
            }
        }
        val mos = fields["mos"] as Double
        assertThat(mos.isFinite()).isTrue()
        assertThat(mos).isAtLeast(1.0)
        assertThat(mos).isAtMost(5.0)
        listOf("qualityLimitationReason", "candidateType", "relayProtocol").forEach { key ->
            fields[key]?.let { assertThat((it as String).length).isAtMost(20) }
        }
    }
}
