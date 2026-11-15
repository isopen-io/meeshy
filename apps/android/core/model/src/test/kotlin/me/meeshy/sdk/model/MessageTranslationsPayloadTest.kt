package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import org.junit.Test

class MessageTranslationsPayloadTest {

    private val json = Json { ignoreUnknownKeys = true }

    @Test
    fun `the list nested under translations is read next to the message metadata`() {
        val payload = json.decodeFromString<MessageTranslationsPayload>(
            """{"messageId":"m1","originalLanguage":"en","translations":[{"targetLanguage":"FR ","translatedContent":"Bonjour","id":"x"}]}""",
        )
        assertThat(payload.usable()).containsExactly("fr" to "Bonjour")
    }

    @Test
    fun `blank rows are dropped and the last row of a language wins`() {
        val payload = MessageTranslationsPayload(
            listOf(
                MessageTranslationsPayload.Item("fr", "Salut"),
                MessageTranslationsPayload.Item("fr", "Bonjour"),
                MessageTranslationsPayload.Item("", "orphan"),
                MessageTranslationsPayload.Item("es", "  "),
            ),
        )
        assertThat(payload.usable()).containsExactly("fr" to "Bonjour")
    }

    @Test
    fun `a payload without translations decodes to nothing`() {
        assertThat(json.decodeFromString<MessageTranslationsPayload>("{}").usable()).isEmpty()
    }
}
