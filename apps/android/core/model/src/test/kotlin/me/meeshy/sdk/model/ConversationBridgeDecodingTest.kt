package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import org.junit.Test

class ConversationBridgeDecodingTest {

    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        explicitNulls = false
        coerceInputValues = true
    }

    private fun bridgeOf(raw: String) =
        json.decodeFromString(ApiConversation.serializer(), """{"id":"c","bridge":$raw}""").bridge

    @Test
    fun `l'etage fallback porte ses donnees`() {
        val bridge = checkNotNull(
            bridgeOf(
                """{"kind":"fallback","unreadCount":5,"suggestedMode":"resume",
                   "data":{"authors":["Ana","Bob"],"extraAuthorCount":2,"messageCount":5,"mediaCounts":{"images":3}}}""",
            ),
        )

        assertThat(bridge.isFallback).isTrue()
        assertThat(bridge.data?.authors).containsExactly("Ana", "Bob").inOrder()
        assertThat(bridge.data?.extraAuthorCount).isEqualTo(2)
        assertThat(bridge.data?.mediaCounts?.images).isEqualTo(3)
        assertThat(bridge.data?.mediaCounts?.audio).isNull()
        assertThat(bridge.isComplete).isNull()
    }

    @Test
    fun `l'etage agent voyage avec la paire du Prisme`() {
        val bridge = checkNotNull(
            bridgeOf(
                """{"kind":"agent","unreadCount":4,"suggestedMode":"focal","isComplete":false,
                   "text":"Hello","translations":{"fr":"Bonjour"},"originalLanguage":"en"}""",
            ),
        )

        assertThat(bridge.isAgent).isTrue()
        assertThat(bridge.suggestedMode).isEqualTo(ConversationBridge.MODE_FOCAL)
        assertThat(bridge.translations).containsExactly("fr", "Bonjour")
        assertThat(bridge.originalLanguage).isEqualTo("en")
        assertThat(bridge.isComplete).isFalse()
    }

    @Test
    fun `un pont mal forme vaut null et ne jette pas la ligne`() {
        assertThat(bridgeOf("""{"unreadCount":"beaucoup"}""")).isNull()
        assertThat(bridgeOf("\"nope\"")).isNull()
    }

    @Test
    fun `un etage inconnu d'une passerelle plus recente est garde`() {
        assertThat(bridgeOf("""{"kind":"hologram","unreadCount":1}""")?.kind).isEqualTo("hologram")
    }
}
