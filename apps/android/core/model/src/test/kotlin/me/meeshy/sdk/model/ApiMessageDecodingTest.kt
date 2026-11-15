package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import org.junit.Test

private val wireJson = Json {
    ignoreUnknownKeys = true
    isLenient = true
    explicitNulls = false
    coerceInputValues = true
}

class ApiMessageDecodingTest {

    private fun decode(payload: String): ApiMessage = wireJson.decodeFromString<ApiMessage>(payload)

    private fun message(extra: String = "") =
        """{"id":"m1","conversationId":"c1","content":"Salut"${if (extra.isEmpty()) "" else ",$extra"}}"""

    @Test
    fun `a payload with _id alone decodes`() {
        val m = decode("""{"_id":"68d1b2c3a4e5f6a7b8c9d0e1","conversationId":"c1"}""")
        assertThat(m.id).isEqualTo("68d1b2c3a4e5f6a7b8c9d0e1")
    }

    @Test
    fun `an old Room row without the new fields is read again`() {
        val m = decode("""{"id":"m1","conversationId":"c1","content":"x","translations":[],"attachments":[]}""")
        assertThat(m.updatedAt).isNull()
        assertThat(m.forwardedFrom).isNull()
        assertThat(m.location).isNull()
        assertThat(m.servedSticker).isNull()
        assertThat(m.systemEvent).isNull()
        assertThat(m.consumedByMe).isNull()
        assertThat(m.isViewOnceOpenedByMe).isFalse()
        assertThat(m.servedTrackingLinks).isNull()
    }

    @Test
    fun `a forward keeps its source message, sender, pieces and origin conversation`() {
        val m = decode(
            message(
                """"forwardedFromId":"m0","forwardedFromConversationId":"c0",
                "forwardedFrom":{"id":"m0","content":"orig","messageType":"image","createdAt":"2026-01-01T00:00:00.000Z",
                  "sender":{"id":"p1","username":"bob","type":"user"},
                  "attachments":[{"id":"a1","mimeType":"image/png"}]},
                "forwardedFromConversation":{"id":"c0","title":"Team","type":"group"}""",
            ),
        )
        assertThat(m.forwardedFrom?.sender?.username).isEqualTo("bob")
        assertThat(m.forwardedFrom?.attachments?.map { it.id }).containsExactly("a1")
        assertThat(m.forwardedFromConversation?.title).isEqualTo("Team")
    }

    @Test
    fun `a shared place without text decodes`() {
        val m = decode(message(""""location":{"latitude":48.85,"longitude":2.35}"""))
        assertThat(m.location).isEqualTo(SharedPlace(48.85, 2.35))
    }

    @Test
    fun `a malformed place is dropped, the message survives`() {
        val m = decode(message(""""location":{"latitude":"nope"}"""))
        assertThat(m.location).isNull()
        assertThat(m.content).isEqualTo("Salut")
    }

    @Test
    fun `a root sticker and a metadata sticker give the same model`() {
        val sticker = """{"templateId":"love.heart","slots":{"caption":"Toi"},"animation":"heartbeat","emoji":"❤️"}"""
        val root = decode(message(""""sticker":$sticker"""))
        val nested = decode(message(""""metadata":{"sticker":$sticker}"""))
        assertThat(root.servedSticker).isNotNull()
        assertThat(root.servedSticker).isEqualTo(nested.servedSticker)
        assertThat(root.servedSticker?.animation).isEqualTo(StickerAnimation.HEARTBEAT)
        assertThat(root.servedSticker?.slots).containsEntry("caption", "Toi")
    }

    @Test
    fun `an empty sticker is an absence, a library sticker is kept, an unknown animation is still`() {
        assertThat(decode(message(""""sticker":{}""")).servedSticker).isNull()
        assertThat(decode(message(""""sticker":{"templateId":""}""")).servedSticker).isNull()
        assertThat(decode(message(""""sticker":{"stickerId":"68d1b2c3a4e5f6a7b8c9d0e1"}""")).servedSticker?.stickerId)
            .isEqualTo("68d1b2c3a4e5f6a7b8c9d0e1")
        val still = decode(message(""""sticker":{"emoji":"🔥","animation":"from-the-future"}""")).servedSticker
        assertThat(still?.emoji).isEqualTo("🔥")
        assertThat(still?.animation).isNull()
    }

    @Test
    fun `an encrypted message is decoded and flagged, never served as a translation`() {
        val m = decode(
            message(
                """"isEncrypted":true,"encryptionMode":"e2ee","content":"Zm9v",
                "originalLanguage":"fr",
                "translations":[{"targetLanguage":"en","translatedContent":"cipher","isEncrypted":true}]""",
            ),
        )
        assertThat(m.isCiphertext).isTrue()
        assertThat(m.encryptionMode).isEqualTo("e2ee")
        val prefs = object : me.meeshy.sdk.lang.LanguageResolver.ContentLanguagePreferences {
            override val systemLanguage = "en"
            override val regionalLanguage: String? = null
            override val customDestinationLanguage: String? = null
        }
        assertThat(m.isTranslated(prefs)).isFalse()
        assertThat(m.displayContent(prefs)).doesNotContain("cipher")
    }

    @Test
    fun `a system event keeps its key and params as text`() {
        val m = decode(message(""""systemEvent":{"key":"system.members.arrived","params":{"count":12,"first":"Aïcha"}}"""))
        assertThat(m.systemEvent?.key).isEqualTo("system.members.arrived")
        assertThat(m.systemEvent?.params).containsExactly("count", "12", "first", "Aïcha")
    }

    @Test
    fun `tracking links are read at the top level and under metadata`() {
        val top = decode(message(""""trackingLinks":[{"url":"https://a.io","token":"t1"}]"""))
        val nested = decode(message(""""metadata":{"trackingLinks":[{"url":"https://a.io","token":"t1"},{"bad":1}]}"""))
        assertThat(top.trackedLinkMap).containsExactly("https://a.io", "t1")
        assertThat(nested.trackedLinkMap).containsExactly("https://a.io", "t1")
    }

    @Test
    fun `ephemeral duration, mentions and consumedByMe are read`() {
        val m = decode(
            message(
                """"ephemeralDuration":30,"consumedByMe":true,"updatedAt":"2026-01-02T00:00:00Z",
                "mentionedUsers":[{"userId":"u1","username":"bob"},{"nope":true}]""",
            ),
        )
        assertThat(m.ephemeralDuration).isEqualTo(30)
        assertThat(m.isViewOnceOpenedByMe).isTrue()
        assertThat(m.updatedAt).isEqualTo("2026-01-02T00:00:00Z")
        assertThat(m.mentionedUsers?.map { it.userId }).containsExactly("u1")
    }

    @Test
    fun `an unknown message type and source are tolerated`() {
        val m = decode(message(""""messageType":"hologram","messageSource":"alien""""))
        assertThat(m.messageType).isEqualTo("hologram")
        assertThat(m.isSystemMessage).isFalse()
    }

    @Test
    fun `displayContent hands the original language to the Prism descent`() {
        val m = decode(
            message(
                """"originalLanguage":"fr","translations":[{"targetLanguage":"en","translatedContent":"Hello"}]""",
            ),
        )
        val prefs = object : me.meeshy.sdk.lang.LanguageResolver.ContentLanguagePreferences {
            override val systemLanguage = "fr"
            override val regionalLanguage = "en"
            override val customDestinationLanguage: String? = null
        }
        assertThat(m.displayContent(prefs)).isEqualTo("Salut")
        assertThat(m.isTranslated(prefs)).isFalse()
    }
}
