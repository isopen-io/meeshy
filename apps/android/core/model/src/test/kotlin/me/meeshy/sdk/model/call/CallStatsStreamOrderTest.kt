package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * #20221 — après la paire ICE (#20121), les flux : un même relevé, lu dans
 * n'importe quel ordre, affiche le même codec et la même cause de limitation
 * (miroir iOS `CallStatsStreamOrderTests`).
 */
class CallStatsStreamOrderTest {

    private fun codec(id: String, mime: String) = CallStats.RawEntry(id, "codec", mimeType = mime)

    private fun inbound(id: String, kind: String, codecId: String?) =
        CallStats.RawEntry(id, "inbound-rtp", kind = kind, codecId = codecId, values = mapOf("packetsReceived" to 10.0))

    private fun outbound(id: String, kind: String = "video", reason: String?) = CallStats.RawEntry(
        id,
        "outbound-rtp",
        kind = kind,
        strings = reason?.let { mapOf("qualityLimitationReason" to it) } ?: emptyMap(),
    )

    private fun <T> orders(entries: List<T>): List<List<T>> {
        val rotations = { list: List<T> -> list.indices.map { list.drop(it) + list.take(it) } }
        return rotations(entries) + rotations(entries.reversed())
    }

    private fun codecs(report: List<CallStats.RawEntry>) = orders(report).map { CallStats.reduce(it).codec }.toSet()

    private fun reasons(report: List<CallStats.RawEntry>) =
        orders(report).map { CallMediaQuality.read(it).qualityLimitationReason }.toSet()

    @Test
    fun `l'audio reçu donne le codec affiché quel que soit l'ordre des flux`() {
        val report = listOf(
            inbound("IA", "video", "C_h264"),
            inbound("IZ", "audio", "C_opus"),
            codec("C_opus", "audio/opus"),
            codec("C_h264", "video/H264"),
        )
        assertThat(codecs(report)).containsExactly("opus")
    }

    @Test
    fun `un codec audio absent de la table cède au codec vidéo résolu`() {
        val report = listOf(
            inbound("IA", "audio", "ghost"),
            inbound("IV", "video", "C_vp8"),
            codec("C_vp8", "video/VP8"),
        )
        assertThat(codecs(report)).containsExactly("VP8")
    }

    @Test
    fun `deux flux audio se départagent par le plus petit id`() {
        val report = listOf(
            inbound("IA2", "audio", "C_g722"),
            inbound("IA1", "audio", "C_opus"),
            codec("C_opus", "audio/opus"),
            codec("C_g722", "audio/G722"),
        )
        assertThat(codecs(report)).containsExactly("opus")
    }

    @Test
    fun `un codecId vide ne prend pas la place d'un codec résolu`() {
        val report = listOf(
            inbound("IA0", "audio", ""),
            inbound("IA1", "audio", "C_opus"),
            codec("", "audio/PCMU"),
            codec("C_opus", "audio/opus"),
        )
        assertThat(codecs(report)).containsExactly("opus")
    }

    @Test
    fun `aucun codec résolu ne donne aucun codec`() {
        val report = listOf(inbound("IA", "audio", "ghost"), inbound("IV", "video", null))
        assertThat(codecs(report)).containsExactly(null)
    }

    @Test
    fun `bandwidth l'emporte sur none dans tous les ordres`() {
        val report = listOf(outbound("OV1", reason = "none"), outbound("OV2", reason = "bandwidth"))
        assertThat(reasons(report)).containsExactly("bandwidth")
    }

    @Test
    fun `bandwidth l'emporte sur cpu qui l'emporte sur other`() {
        val report = listOf(
            outbound("OV1", reason = "other"),
            outbound("OV2", reason = "cpu"),
            outbound("OV3", reason = "bandwidth"),
            outbound("OV4", reason = "none"),
        )
        assertThat(reasons(report)).containsExactly("bandwidth")
        assertThat(reasons(report.filterNot { it.id == "OV3" })).containsExactly("cpu")
        assertThat(reasons(listOf(outbound("OV1", reason = "none"), outbound("OV2", reason = "other")))).containsExactly("other")
    }

    @Test
    fun `à rang égal le plus petit id donne la cause`() {
        val report = listOf(outbound("OVb", reason = "none"), outbound("OVa", reason = "inconnue"))
        assertThat(reasons(report)).containsExactly("inconnue")
    }

    @Test
    fun `une cause vide ou d'un flux audio est ignorée`() {
        val report = listOf(
            outbound("OV0", reason = ""),
            outbound("OA", kind = "audio", reason = "bandwidth"),
            outbound("OV1", reason = "none"),
        )
        assertThat(reasons(report)).containsExactly("none")
    }

    @Test
    fun `sans cause portée aucune limitation n'est lue`() {
        val report = listOf(outbound("OV0", reason = ""), outbound("OV1", reason = null))
        assertThat(reasons(report)).containsExactly(null)
    }
}
