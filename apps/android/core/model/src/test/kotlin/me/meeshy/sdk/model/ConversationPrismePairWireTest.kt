package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import org.junit.Test

/**
 * The wire half of the row's Prisme: `GET /conversations` ships
 * `lastMessageTranslations` + `lastMessageOriginalLanguage` at the CONVERSATION root
 * (`conversationMinimalSchema`, `packages/shared/types/api-schemas.ts`), and until this
 * slice [ApiConversation] declared neither — so `ignoreUnknownKeys` dropped both at
 * decode, and the re-encode into the Room cache
 * ([me.meeshy.sdk.conversation.ConversationCacheSource]) dropped them again.
 *
 * A resolver alone would have been a pipe with nobody pouring into it, so these
 * witnesses start from a payload copied key-by-key off the server schema and put it
 * through the app's REAL decoder configuration (`SdkModule.providesJson`), not a
 * hand-built object.
 */
class ConversationPrismePairWireTest {

    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        explicitNulls = false
        coerceInputValues = true
    }

    /**
     * Copied off the emitter, not off the schema: `GET /conversations`
     * (`routes/conversations/core.ts`) DESTRUCTURES `originalLanguage` out of the
     * `lastMessage` spread — "les laisser fuiter dans le spread renverrait le blob
     * complet à chaque ligne" — so the nested field is ABSENT on the wire and the root
     * one is the only source of the original language. Anything reading
     * `lastMessage.originalLanguage` here would resolve against `null`.
     */
    private val payload = """
        {
          "id": "68d1b2c3a4e5f6a7b8c9d0e1",
          "type": "direct",
          "lastMessage": {
            "id": "68d1b2c3a4e5f6a7b8c9d0e2",
            "content": "Hello everyone",
            "senderId": "68d1b2c3a4e5f6a7b8c9d0e3",
            "createdAt": "2026-08-24T10:00:00.000Z"
          },
          "lastMessageOriginalLanguage": "en",
          "lastMessageTranslations": { "fr": "Bonjour à tous" },
          "unreadCount": 2
        }
    """.trimIndent()

    @Test
    fun `the Prisme pair survives the decoder`() {
        val conversation = json.decodeFromString<ApiConversation>(payload)

        assertThat(conversation.lastMessageOriginalLanguage).isEqualTo("en")
        assertThat(conversation.lastMessageTranslations).containsExactly("fr", "Bonjour à tous")
    }

    @Test
    fun `the Prisme pair survives the cache round-trip`() {
        // ConversationCacheSource persists `encodeToString(conversation)` and decodes it
        // back on every observe; a field this class does not declare is lost there too.
        val once = json.decodeFromString<ApiConversation>(payload)
        val twice = json.decodeFromString<ApiConversation>(json.encodeToString(once))

        assertThat(twice.lastMessageTranslations).containsExactly("fr", "Bonjour à tous")
        assertThat(twice.lastMessageOriginalLanguage).isEqualTo("en")
    }

    @Test
    fun `a French reader gets the French row from the decoded payload`() {
        val conversation = json.decodeFromString<ApiConversation>(payload)

        assertThat(conversation.resolvedLastMessagePreview(listOf("fr")))
            .isEqualTo("Bonjour à tous")
    }

    @Test
    fun `an English-primary reader gets the original, proving the ROOT original language is read`() {
        // Prism `[en, fr]` with a French translation available is the only shape that
        // makes this witness able to fall: drop `lastMessageOriginalLanguage` and rank 1
        // (`en`) has no key, so the resolver descends to rank 2 and serves the French.
        // A prism of `[en]` alone would pass either way — it would assert nothing.
        val conversation = json.decodeFromString<ApiConversation>(payload)

        assertThat(conversation.resolvedLastMessagePreview(listOf("en", "fr")))
            .isEqualTo("Hello everyone")
    }

    @Test
    fun `a conversation without the pair still resolves to its raw preview`() {
        val bare = json.decodeFromString<ApiConversation>(
            """{"id":"68d1b2c3a4e5f6a7b8c9d0e1","lastMessage":{"content":"Hello"}}"""
        )

        assertThat(bare.resolvedLastMessagePreview(listOf("fr"))).isEqualTo("Hello")
    }

    @Test
    fun `a conversation without a last message resolves to null`() {
        val empty = json.decodeFromString<ApiConversation>("""{"id":"68d1b2c3a4e5f6a7b8c9d0e1"}""")

        assertThat(empty.resolvedLastMessagePreview(listOf("fr"))).isNull()
    }
}
