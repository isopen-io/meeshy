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
}
