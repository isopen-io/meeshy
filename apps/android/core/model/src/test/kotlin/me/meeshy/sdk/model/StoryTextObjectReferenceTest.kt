package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import org.junit.Test

/** Un badge de mention est un texte qui porte sa personne (#13846, iOS `StoryTextObject.referenceUserId`). */
class StoryTextObjectReferenceTest {

    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = false }

    @Test
    fun `a badge keeps the person it names across the wire`() {
        val decoded = json.decodeFromString(StoryTextObject.serializer(), """{"id":"t","text":"@ana","referenceUserId":"507f1f77bcf86cd799439011"}""")
        assertThat(decoded.referenceUserId).isEqualTo("507f1f77bcf86cd799439011")
        assertThat(json.encodeToString(StoryTextObject.serializer(), decoded)).contains("\"referenceUserId\":\"507f1f77bcf86cd799439011\"")
    }

    @Test
    fun `an ordinary text names nobody`() {
        assertThat(json.decodeFromString(StoryTextObject.serializer(), """{"id":"t","text":"hello"}""").referenceUserId).isNull()
    }
}
