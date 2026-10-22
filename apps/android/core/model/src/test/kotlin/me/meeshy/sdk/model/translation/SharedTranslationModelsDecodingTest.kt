package me.meeshy.sdk.model.translation

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import org.junit.Test

class SharedTranslationModelsDecodingTest {
    private fun envelopeJson(kdf: String = "message-content", extra: String = "") =
        "{\"v\":1,\"alg\":\"A256GCM\",\"kdf\":\"$kdf\",\"payload\":\"QQ==\"$extra}"

    private fun item(id: String, kdf: String = "message-content") =
        "{\"id\":\"$id\",\"conversationId\":\"c\",\"messageId\":\"m\",\"targetLanguage\":\"fr\",\"sharedBy\":\"u\",\"sharedAt\":\"t\",\"inconnu\":1,\"envelope\":${envelopeJson(kdf)}}"

    private fun parse(text: String) = Json.parseToJsonElement(text)

    @Test
    fun `un champ inconnu de l'enveloppe est tolere`() {
        val envelope = SharedTranslationEnvelope.decodeOrNull(parse(envelopeJson(extra = ",\"futur\":true")))
        assertThat(envelope?.kdf).isEqualTo(SharedTranslationKdf.MESSAGE_CONTENT)
    }

    @Test
    fun `une enveloppe malformee rend null sans lever`() {
        listOf("null", "[]", "42", "\"x\"", "{}", envelopeJson(kdf = "autre"), "{\"v\":\"1\",\"alg\":1}").forEach {
            assertThat(SharedTranslationEnvelope.decodeOrNull(parse(it))).isNull()
        }
        assertThat(SharedTranslationEnvelope.decodeOrNull(null)).isNull()
    }

    @Test
    fun `la liste ecarte l'element illisible sans perdre les autres`() {
        val body = parse("{\"sharedTranslations\":[${item("a")},${item("b", "kdf-futur")},42,${item("c")}]}")
        assertThat(SharedTranslationsResult.decodeOrEmpty(body).sharedTranslations.map { it.id }).containsExactly("a", "c").inOrder()
    }

    @Test
    fun `une reponse sans liste ou de mauvaise forme est vide`() {
        assertThat(SharedTranslationsResult.decodeOrEmpty(parse("{}")).sharedTranslations).isEmpty()
        assertThat(SharedTranslationsResult.decodeOrEmpty(parse("[1]")).sharedTranslations).isEmpty()
        assertThat(SharedTranslationsResult.decodeOrEmpty(parse("{\"sharedTranslations\":3}")).sharedTranslations).isEmpty()
        assertThat(SharedTranslationsResult.decodeOrEmpty(null).sharedTranslations).isEmpty()
    }

    @Test
    fun `le corps d'envoi porte v et alg et aucun texte clair`() {
        val envelope = SharedTranslationEnvelope.of(SharedTranslationKdf.MESSAGE_CONTENT, "QQ==")
        val encoded = Json.encodeToString(ShareTranslationBody.serializer(), ShareTranslationBody("m", "fr", "original", envelope))
        val envelopeObject: JsonObject = parse(encoded).jsonObject.getValue("envelope").jsonObject
        assertThat(envelopeObject.keys).containsExactly("v", "alg", "kdf", "payload")
        assertThat(envelopeObject.getValue("kdf").toString()).isEqualTo("\"message-content\"")
        assertThat(buildJsonObject { }.size).isEqualTo(0)
    }

    @Test
    fun `les refus se reconnaissent par leur code`() {
        assertThat(SharedTranslationShareRefusal.fromCode("SHARED_TRANSLATION_STALE_SOURCE")).isEqualTo(SharedTranslationShareRefusal.STALE_SOURCE)
        assertThat(SharedTranslationShareRefusal.fromCode("SHARED_TRANSLATION_READ_RECEIPTS_OFF")).isEqualTo(SharedTranslationShareRefusal.READ_RECEIPTS_OFF)
        assertThat(SharedTranslationShareRefusal.fromCode("autre")).isNull()
        assertThat(SharedTranslationShareRefusal.fromCode(null)).isNull()
    }
}
