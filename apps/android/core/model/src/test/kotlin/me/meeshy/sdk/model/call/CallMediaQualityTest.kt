package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * #19895 — ce que `getStats` dit des gels, de la limitation et du relais, lu
 * comme le web (`readMediaQuality`, #19876) : chaque mesure est la somme des
 * flux qui la PORTENT, `null` — jamais 0 — quand aucun ne la porte.
 */
class CallMediaQualityTest {

    private fun entry(
        id: String,
        type: String,
        kind: String? = null,
        values: Map<String, Double> = emptyMap(),
        strings: Map<String, String> = emptyMap(),
    ) = CallStats.RawEntry(id = id, type = type, kind = kind, values = values, strings = strings)

    private fun route(candidateType: String, relayProtocol: String? = null) = listOf(
        entry("t", "transport", strings = mapOf("selectedCandidatePairId" to "p")),
        entry("p", "candidate-pair", strings = mapOf("localCandidateId" to "l", "remoteCandidateId" to "r", "state" to "succeeded")),
        entry("l", "local-candidate", strings = listOfNotNull("candidateType" to candidateType, relayProtocol?.let { "relayProtocol" to it }).toMap()),
        entry("r", "remote-candidate", strings = mapOf("candidateType" to "host")),
    )

    @Test
    fun `un rapport vide ne mesure rien`() {
        assertThat(CallMediaQuality.read(emptyList())).isEqualTo(CallMediaQuality())
        assertThat(CallStats.reduce(emptyList()).media).isEqualTo(CallMediaQuality())
    }

    @Test
    fun `les gels, NACK et PLI se somment sur la video recue`() {
        val media = CallMediaQuality.read(
            listOf(
                entry("v1", "inbound-rtp", "video", mapOf("freezeCount" to 2.0, "totalFreezesDuration" to 1.5, "nackCount" to 4.0, "pliCount" to 1.0)),
                entry("v2", "inbound-rtp", "video", mapOf("freezeCount" to 1.0, "totalFreezesDuration" to 0.5, "nackCount" to 6.0)),
                entry("a", "inbound-rtp", "audio", mapOf("freezeCount" to 99.0, "nackCount" to 99.0)),
            ),
        )
        assertThat(media.freezeCount).isEqualTo(3.0)
        assertThat(media.totalFreezesDuration).isEqualTo(2.0)
        assertThat(media.nackCount).isEqualTo(10.0)
        assertThat(media.pliCount).isEqualTo(1.0)
    }

    @Test
    fun `le tampon de gigue ne lit que les flux audio qui portent aussi un compte emis positif`() {
        val media = CallMediaQuality.read(
            listOf(
                entry("a1", "inbound-rtp", "audio", mapOf("jitterBufferDelay" to 2.0, "jitterBufferEmittedCount" to 100.0, "concealedSamples" to 30.0)),
                entry("a2", "inbound-rtp", "audio", mapOf("jitterBufferDelay" to 5.0, "jitterBufferEmittedCount" to 0.0, "concealedSamples" to 12.0)),
                entry("a3", "inbound-rtp", "audio", mapOf("jitterBufferDelay" to 7.0)),
                entry("v", "inbound-rtp", "video", mapOf("jitterBufferDelay" to 9.0, "jitterBufferEmittedCount" to 9.0)),
            ),
        )
        assertThat(media.jitterBufferDelay).isEqualTo(2.0)
        assertThat(media.jitterBufferEmittedCount).isEqualTo(100.0)
        assertThat(media.concealedSamples).isEqualTo(42.0)
    }

    @Test
    fun `une mesure absente reste nulle, jamais zero`() {
        val media = CallMediaQuality.read(listOf(entry("v", "inbound-rtp", "video", mapOf("packetsReceived" to 10.0))))
        assertThat(media.freezeCount).isNull()
        assertThat(media.jitterBufferDelay).isNull()
        assertThat(media.concealedSamples).isNull()
    }

    @Test
    fun `la cause de limitation est celle de l'emission video`() {
        val media = CallMediaQuality.read(
            listOf(
                entry("oa", "outbound-rtp", "audio", strings = mapOf("qualityLimitationReason" to "cpu")),
                entry("ov", "outbound-rtp", "video", strings = mapOf("qualityLimitationReason" to "bandwidth")),
            ),
        )
        assertThat(media.qualityLimitationReason).isEqualTo("bandwidth")
    }

    @Test
    fun `seul le type du candidat LOCAL de la paire elue part, et son transport seulement s'il relaie`() {
        val relayed = CallMediaQuality.read(route("relay", "tls"))
        assertThat(relayed.candidateType).isEqualTo("relay")
        assertThat(relayed.relayProtocol).isEqualTo("tls")

        val direct = CallMediaQuality.read(route("srflx", "udp"))
        assertThat(direct.candidateType).isEqualTo("srflx")
        assertThat(direct.relayProtocol).isNull()
    }

    @Test
    fun `sans transport, la paire nominee reussie est l'elue`() {
        val media = CallMediaQuality.read(
            listOf(
                entry("p", "candidate-pair", values = mapOf("nominated" to 1.0), strings = mapOf("state" to "succeeded", "localCandidateId" to "l")),
                entry("l", "local-candidate", strings = mapOf("candidateType" to "host")),
            ),
        )
        assertThat(media.candidateType).isEqualTo("host")
    }

    @Test
    fun `des valeurs hostiles ne comptent pas, seules les mesures finies et positives`() {
        val media = CallMediaQuality.read(
            listOf(
                entry("v1", "inbound-rtp", "video", mapOf("freezeCount" to Double.NaN, "totalFreezesDuration" to Double.POSITIVE_INFINITY, "nackCount" to -3.0)),
                entry("v2", "inbound-rtp", "video", mapOf("freezeCount" to 1.6, "totalFreezesDuration" to 0.4, "nackCount" to 2.4)),
                entry("a", "inbound-rtp", "audio", mapOf("jitterBufferDelay" to -1.0, "jitterBufferEmittedCount" to Double.NaN, "concealedSamples" to Double.NEGATIVE_INFINITY)),
            ),
        )
        assertThat(media.freezeCount).isEqualTo(1.6)
        assertThat(media.totalFreezesDuration).isEqualTo(0.4)
        assertThat(media.nackCount).isEqualTo(2.4)
        assertThat(media.jitterBufferDelay).isNull()
        assertThat(media.jitterBufferEmittedCount).isNull()
        assertThat(media.concealedSamples).isNull()
    }

    @Test
    fun `reduce porte la lecture media dans l'instantane`() {
        val stats = CallStats.reduce(route("relay", "udp") + entry("v", "inbound-rtp", "video", mapOf("freezeCount" to 3.0)))
        assertThat(stats.media.freezeCount).isEqualTo(3.0)
        assertThat(stats.media.relayProtocol).isEqualTo("udp")
        assertThat(stats.relayed).isTrue()
    }
}
