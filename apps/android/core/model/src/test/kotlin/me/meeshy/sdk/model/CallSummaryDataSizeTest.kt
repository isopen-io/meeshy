package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import org.junit.Test

class CallSummaryDataSizeTest {

    private fun summary(bytes: String, estimated: Boolean = false): CallSummaryMetadata =
        CallSummaryMetadata.parse(
            Json.parseToJsonElement(
                """{"kind":"call","callId":"c","initiatorId":"u1","callType":"video","outcome":"completed",
                   "durationSeconds":3600,"bytesTotal":$bytes,"bytesEstimated":$estimated}""",
            ) as JsonObject,
        )!!

    @Test
    fun `un appel de quatre gigaoctets garde ses octets et dit 4 GB`() {
        val call = summary("4000000000")
        assertThat(call.bytesTotal).isEqualTo(4_000_000_000L)
        assertThat(call.dataSpentLabel).isEqualTo("4 GB")
    }

    @Test
    fun `quatre gigaoctets estimes se prefixent d un tilde`() {
        assertThat(summary("4000000000", estimated = true).dataSpentLabel).isEqualTo("~4 GB")
    }

    @Test
    fun `le format des donnees passe la borne des 2 Go`() {
        assertThat(CallSummaryMetadata.formatDataSize(4_000_000_000L)).isEqualTo("4 GB")
        assertThat(CallSummaryMetadata.formatDataSize(2_147_483_648L)).isEqualTo("2.1 GB")
    }

    @Test
    fun `le plus grand entier sur du JSON ne deborde pas et se lit comme sur le web`() {
        val call = summary("9007199254740991")
        assertThat(call.bytesTotal).isEqualTo(9_007_199_254_740_991L)
        assertThat(call.dataSpentLabel).isEqualTo("9007199.3 GB")
    }

    @Test
    fun `au dela du plus grand entier sur la valeur sature sans deborder`() {
        val call = summary("1e19")
        assertThat(call.bytesTotal).isEqualTo(9_007_199_254_740_991L)
        assertThat(call.dataSpentLabel).isEqualTo("9007199.3 GB")
    }

    @Test
    fun `une valeur negative ne se lit pas comme des donnees consommees`() {
        val call = summary("-5")
        assertThat(call.bytesTotal).isNull()
        assertThat(call.dataSpentLabel).isNull()
    }
}
