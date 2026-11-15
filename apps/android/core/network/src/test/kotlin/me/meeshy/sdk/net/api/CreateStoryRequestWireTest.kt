package me.meeshy.sdk.net.api

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.Json
import me.meeshy.sdk.net.MeeshyApi
import org.junit.Test

/**
 * Le corps d'une publication de story porte TOUJOURS `type` et `visibility`, même à leur
 * valeur par défaut : la passerelle applique `type = POST` à un corps sans `type`, et la
 * story devenait un post public permanent (#4754).
 */
class CreateStoryRequestWireTest {

    private fun encoded(request: CreateStoryRequest) =
        Json.parseToJsonElement(MeeshyApi.json.encodeToString(request)).jsonObject

    @Test
    fun `a story publish always declares its STORY type on the wire`() {
        val body = encoded(CreateStoryRequest(content = "Recette"))

        assertThat(body["type"]?.jsonPrimitive?.content).isEqualTo("STORY")
    }

    @Test
    fun `a story publish always declares its audience on the wire`() {
        val body = encoded(CreateStoryRequest())

        assertThat(body["visibility"]?.jsonPrimitive?.content).isEqualTo("PUBLIC")
    }

    @Test
    fun `the queued payload decodes back to the same story publish`() {
        val request = CreateStoryRequest(content = "Recette", visibility = "FRIENDS")

        val decoded = MeeshyApi.json.decodeFromString<CreateStoryRequest>(MeeshyApi.json.encodeToString(request))

        assertThat(decoded).isEqualTo(request)
    }

    @Test
    fun `the five publication fields ride the wire under the gateway names, absent when unset`() {
        val bare = encoded(CreateStoryRequest(content = "x"))
        listOf("visibilityUserIds", "mentions", "mediaAlt", "mediaCaption", "allowSoundExtraction")
            .forEach { assertThat(bare.containsKey(it)).isFalse() }

        val full = encoded(
            CreateStoryRequest(
                visibility = "ONLY",
                visibilityUserIds = listOf("u1"),
                mentions = listOf(me.meeshy.sdk.model.PostMentionInput(userId = "u2", display = "NOTE")),
                mediaIds = listOf("m1"),
                mediaAlt = mapOf("m1" to "un chat"),
                mediaCaption = mapOf("m1" to "Mon chat"),
                allowSoundExtraction = true,
            ),
        )
        assertThat(full["visibilityUserIds"].toString()).isEqualTo("[\"u1\"]")
        assertThat(full["mediaAlt"]!!.jsonObject["m1"]?.jsonPrimitive?.content).isEqualTo("un chat")
        assertThat(full["mediaCaption"]!!.jsonObject["m1"]?.jsonPrimitive?.content).isEqualTo("Mon chat")
        assertThat(full["allowSoundExtraction"]?.jsonPrimitive?.content).isEqualTo("true")
        assertThat(full["mentions"].toString()).contains("\"display\":\"NOTE\"")
    }
}
