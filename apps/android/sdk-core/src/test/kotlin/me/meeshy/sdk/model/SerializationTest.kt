package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.net.MeeshyApi
import org.junit.Test

class SerializationTest {

    private val json = MeeshyApi.json

    @Test
    fun apiResponse_deserializesUserEnvelope() {
        val payload = """{"success":true,"data":{"id":"u1","username":"atabeth","systemLanguage":"fr"}}"""
        val parsed = json.decodeFromString(
            ApiResponse.serializer(MeeshyUser.serializer()),
            payload,
        )
        assertThat(parsed.success).isTrue()
        assertThat(parsed.data?.username).isEqualTo("atabeth")
        assertThat(parsed.data?.systemLanguage).isEqualTo("fr")
    }

    @Test
    fun deserialization_ignoresUnknownKeys() {
        val payload = """{"id":"u1","username":"atabeth","futureField":"ignored","extra":42}"""
        val user = json.decodeFromString(MeeshyUser.serializer(), payload)
        assertThat(user.id).isEqualTo("u1")
    }

    @Test
    fun message_deserializesWithTranslations() {
        val payload = """
            {"id":"m1","conversationId":"c1","content":"Bonjour","originalLanguage":"fr",
             "translations":[{"targetLanguage":"en","translatedContent":"Hello"}]}
        """.trimIndent()
        val message = json.decodeFromString(ApiMessage.serializer(), payload)
        assertThat(message.translations).hasSize(1)
        assertThat(message.translations.first().targetLanguage).isEqualTo("en")
    }

    @Test
    fun message_roundTripKeepsEveryRichField() {
        val payload = """
            {"_id":"m1","conversationId":"c1","content":"Salut","updatedAt":"2026-01-02T00:00:00Z",
             "forwardedFrom":{"id":"m0","content":"o","sender":{"id":"p1","type":"anonymous"}},
             "location":{"latitude":1.5,"longitude":2.5},
             "sticker":{"templateId":"love.heart","slots":{"a":"b"},"animation":"pop"},
             "systemEvent":{"key":"system.member-joined","params":{"n":"Zoé"}},
             "isEncrypted":true,"encryptionMode":"e2ee","ephemeralDuration":30,"consumedByMe":true,
             "metadata":{"kind":"member-joined","participantId":"p","displayName":"Zoé"},
             "trackingLinks":[{"url":"https://a.io","token":"t"}],
             "replyTo":{"id":"m0","originalLanguage":"en","isViewOnce":true,"attachmentReplyTo":{"attachmentId":"a1","kind":"image"}},
             "translations":[{"targetLanguage":"en","translatedContent":"Hi","isEncrypted":false},{"bad":1}]}
        """.trimIndent()
        val first = json.decodeFromString(ApiMessage.serializer(), payload)
        val second = json.decodeFromString(ApiMessage.serializer(), json.encodeToString(ApiMessage.serializer(), first))
        assertThat(second).isEqualTo(first)
        assertThat(second.id).isEqualTo("m1")
        assertThat(second.servedSticker?.animation).isEqualTo(StickerAnimation.POP)
        assertThat(second.joinNotice?.displayName).isEqualTo("Zoé")
        assertThat(second.translations).hasSize(1)
        assertThat(second.replyTo?.attachmentReplyTo?.attachmentId).isEqualTo("a1")
    }
}
