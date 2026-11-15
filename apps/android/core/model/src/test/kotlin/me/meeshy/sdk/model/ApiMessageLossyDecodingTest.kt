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

class ApiMessageLossyDecodingTest {

    private fun decode(payload: String): ApiMessage = wireJson.decodeFromString<ApiMessage>(payload)

    @Test
    fun `a malformed translation is dropped, the others and the pieces survive`() {
        val m = decode(
            """{"id":"m1","conversationId":"c1","content":"x",
              "translations":[
                {"targetLanguage":"en","translatedContent":"Hello"},
                {"targetLanguage":"es"},
                {"translatedContent":"orphan"},
                42,
                {"targetLanguage":"de","translatedContent":"Hallo","isEncrypted":false}],
              "attachments":[{"id":"a1","mimeType":"image/png"},{"mimeType":"broken"},{"id":"a3"}]}""",
        )
        assertThat(m.translations.map { it.targetLanguage }).containsExactly("en", "de").inOrder()
        assertThat(m.attachments.map { it.id }).containsExactly("a1", "a3").inOrder()
    }

    @Test
    fun `translations that are not an array give an empty list`() {
        val m = decode("""{"id":"m1","conversationId":"c1","translations":"oops"}""")
        assertThat(m.translations).isEmpty()
    }

    @Test
    fun `a malformed sender, reply or forward costs only itself`() {
        val m = decode(
            """{"id":"m1","conversationId":"c1","content":"x","sender":"bob","replyTo":{"content":"no id"},
              "forwardedFrom":[1],"mentionedUsers":"none"}""",
        )
        assertThat(m.content).isEqualTo("x")
        assertThat(m.sender).isNull()
        assertThat(m.replyTo).isNull()
        assertThat(m.forwardedFrom).isNull()
        assertThat(m.mentionedUsers).isNull()
    }

    @Test
    fun `a malformed metadata is dropped without losing the message`() {
        val m = decode("""{"id":"m1","conversationId":"c1","metadata":"junk"}""")
        assertThat(m.metadata).isNull()
        assertThat(m.callSummary).isNull()
    }

    @Test
    fun `a page survives one broken message body field`() {
        val page = wireJson.decodeFromString<MessagesApiResponse>(
            """{"success":true,"data":[
              {"id":"m1","conversationId":"c1","translations":[{"bad":1}],"attachments":[{"bad":1}]},
              {"id":"m2","conversationId":"c1","sender":{"id":"p"}}]}""",
        )
        assertThat(page.data.map { it.id }).containsExactly("m1", "m2").inOrder()
    }
}
