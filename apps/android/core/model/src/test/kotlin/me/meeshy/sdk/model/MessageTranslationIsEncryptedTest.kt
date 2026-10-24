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

class MessageTranslationIsEncryptedTest {

    private fun translation(payload: String) = wireJson.decodeFromString<ApiTextTranslation>(payload)

    @Test
    fun `the flag is decoded`() {
        assertThat(translation("""{"targetLanguage":"en","translatedContent":"Zm9v","isEncrypted":true}""").isEncrypted).isTrue()
        assertThat(translation("""{"targetLanguage":"en","translatedContent":"x","isEncrypted":false}""").isEncrypted).isFalse()
    }

    @Test
    fun `an omitted flag is null, encryption is not assumed`() {
        assertThat(translation("""{"targetLanguage":"en","translatedContent":"x"}""").isEncrypted).isNull()
    }

    @Test
    fun `an old cached translation without the flag is read again`() {
        val old = translation("""{"id":"t","messageId":"m","sourceLanguage":"fr","targetLanguage":"en","translatedContent":"x","cached":true}""")
        assertThat(old.isEncrypted).isNull()
        assertThat(old.translatedContent).isEqualTo("x")
    }
}
