package me.meeshy.sdk.net.api

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import me.meeshy.sdk.model.StoryAudioPlayerObject
import me.meeshy.sdk.model.StoryEffects
import me.meeshy.sdk.net.MeeshyApi
import org.junit.Test

/**
 * La charge d'une story qui parle, contre celle qu'iOS envoie sur la même route (`POST /posts`, `CreatePostRequest`) :
 * la transcription faite sur l'appareil part en `mobileTranscription` (la passerelle ne re-transcrit pas), sous les
 * noms du fil (`duration_ms`, segments en secondes), et la langue du son voyage sur sa piste en `sourceLanguage`, que le
 * lecteur descend par le Prisme.
 */
class CreateStorySoundWireTest {

    private fun encoded(request: CreateStoryRequest): JsonObject =
        Json.parseToJsonElement(MeeshyApi.json.encodeToString(request)).jsonObject

    private val spoken = CreateStoryRequest(
        storyEffects = StoryEffects(
            audioPlayerObjects = listOf(StoryAudioPlayerObject(id = "a1", postMediaId = "pm1", sourceLanguage = "pt")),
        ),
        mediaIds = listOf("pm1"),
        mobileTranscription = MobileTranscriptionPayload(
            text = "bom dia",
            language = "pt",
            confidence = 0.8,
            durationMs = 2_000,
            segments = listOf(MobileTranscriptionSegment(text = "bom dia", start = 0.0, end = 2.0)),
        ),
    )

    @Test
    fun `the on-device transcription rides the wire under the gateway names`() {
        val transcription = encoded(spoken)["mobileTranscription"]!!.jsonObject
        assertThat(transcription.keys).containsAtLeast("text", "language", "confidence", "duration_ms", "segments")
        assertThat(transcription["language"]!!.jsonPrimitive.content).isEqualTo("pt")
        val segment = transcription["segments"]!!.jsonArray.single().jsonObject
        assertThat(segment["start"]!!.jsonPrimitive.content).isEqualTo("0.0")
        assertThat(segment["end"]!!.jsonPrimitive.content).isEqualTo("2.0")
    }

    @Test
    fun `the language of the sound rides on its track`() {
        val track = encoded(spoken)["storyEffects"]!!.jsonObject["audioPlayerObjects"]!!.jsonArray.single().jsonObject
        assertThat(track["sourceLanguage"]!!.jsonPrimitive.content).isEqualTo("pt")
    }

    @Test
    fun `a story without transcription leaves the key out so the gateway transcribes`() {
        assertThat(encoded(CreateStoryRequest(content = "x")).containsKey("mobileTranscription")).isFalse()
    }
}
