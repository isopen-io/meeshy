package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import org.junit.Test

class MobileTranscriptionPayloadSerializationTest {
    private val json = Json { ignoreUnknownKeys = true }
    private val payload = MobileTranscriptionPayload(
        text = "bonjour", language = "fr", confidence = 0.9, durationMs = 1200,
        segments = listOf(MobileTranscriptionSegment("bonjour", 0.0, 1.2, "s1")),
    )

    @Test
    fun `aller-retour fidele`() {
        assertThat(json.decodeFromString<MobileTranscriptionPayload>(json.encodeToString(payload))).isEqualTo(payload)
    }

    @Test
    fun `le fil porte les noms de la passerelle`() {
        val o: JsonObject = json.parseToJsonElement(json.encodeToString(payload)).jsonObject
        assertThat(o.keys).contains("duration_ms")
        assertThat(o.keys).doesNotContain("durationMs")
        val seg = (o["segments"] as kotlinx.serialization.json.JsonArray)[0].jsonObject
        assertThat(seg.keys).contains("speaker_id")
    }

    @Test
    fun `une file ecrite avec les anciens noms se relit`() {
        val old = """{"text":"a","language":"fr","durationMs":5,"segments":[{"text":"a","speakerId":"x"}]}"""
        val p = json.decodeFromString<MobileTranscriptionPayload>(old)
        assertThat(p.durationMs).isEqualTo(5)
        assertThat(p.segments[0].speakerId).isEqualTo("x")
    }
}
