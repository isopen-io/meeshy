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

class ApiMessageReplyPreviewDecodingTest {

    private fun reply(payload: String) = wireJson.decodeFromString<ApiMessageReplyPreview>(payload)

    @Test
    fun `an enriched quote keeps its author, language, translations, pieces and protection`() {
        val r = reply(
            """{"id":"m0","content":"Hello","senderId":"p1","originalLanguage":"en",
              "sender":{"id":"p1","userId":"u1","avatar":"/u1.png","displayName":"Ann"},
              "translations":[{"targetLanguage":"fr","translatedContent":"Bonjour"},{"x":1}],
              "attachments":[{"id":"a1","mimeType":"image/png"},{"bad":true}],
              "isViewOnce":false,"isBlurred":false,"effectFlags":0,"expiresAt":"2026-02-01T00:00:00Z",
              "visualAttachmentCount":6,
              "attachmentReplyTo":{"attachmentId":"a1","kind":"image"}}""",
        )
        assertThat(r.authorUserId).isEqualTo("u1")
        assertThat(r.authorAvatarUrl).isEqualTo("/u1.png")
        assertThat(r.originalLanguage).isEqualTo("en")
        assertThat(r.translations?.map { it.targetLanguage }).containsExactly("fr")
        assertThat(r.attachments?.map { it.id }).containsExactly("a1")
        assertThat(r.attachmentReplyTo).isEqualTo(ApiQuotedAttachmentReference("a1", "image"))
        assertThat(r.visualAttachmentCount).isEqualTo(6)
        assertThat(r.expiresAt).isNotNull()
        assertThat(r.isProtected).isFalse()
    }

    @Test
    fun `a malformed attachmentReplyTo is dropped, the quote survives`() {
        val r = reply("""{"id":"m0","content":"x","attachmentReplyTo":{"kind":"image"}}""")
        assertThat(r.attachmentReplyTo).isNull()
        assertThat(r.content).isEqualTo("x")
    }

    @Test
    fun `the quote is protected by view-once, blur, encryption or the bitfield`() {
        assertThat(reply("""{"id":"m","isViewOnce":true}""").isProtected).isTrue()
        assertThat(reply("""{"id":"m","isBlurred":true}""").isProtected).isTrue()
        assertThat(reply("""{"id":"m","isEncrypted":true}""").isProtected).isTrue()
        assertThat(reply("""{"id":"m","effectFlags":4}""").isProtected).isTrue()
        assertThat(reply("""{"id":"m","effectFlags":2}""").isProtected).isTrue()
    }

    @Test
    fun `ephemeral alone does not protect the quote and a legacy quote decodes`() {
        assertThat(reply("""{"id":"m","effectFlags":1}""").isProtected).isFalse()
        val legacy = reply("""{"id":"m","content":"old","senderDisplayName":"Z"}""")
        assertThat(legacy.isProtected).isFalse()
        assertThat(legacy.translations).isNull()
        assertThat(legacy.authorUserId).isNull()
    }

    @Test
    fun `a wrong-typed protection channel closes rather than opens`() {
        assertThat(reply("""{"id":"m","isViewOnce":"false"}""").isProtected).isTrue()
    }

    @Test
    fun `a deleted quote keeps its tombstone date`() {
        assertThat(reply("""{"id":"m","deletedAt":"2026-03-01T00:00:00Z"}""").deletedAt).isNotNull()
    }
}
