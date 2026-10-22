package me.meeshy.sdk.model.translation

import com.google.common.truth.Truth.assertThat
import java.io.File
import java.util.Base64
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Test

/** Rejoue seal.vectors.json, produit en exécutant le TypeScript : sur écart, le Kotlin bouge. */
class SharedTranslationSealVectorParityTest {

    private fun fixtureRoot(): JsonObject {
        var dir: File? = File(".").absoluteFile
        while (dir != null) {
            val candidate = File(dir, "packages/shared/fixtures/shared-translation/seal.vectors.json")
            if (candidate.isFile) return Json.parseToJsonElement(candidate.readText()).jsonObject
            dir = dir.parentFile
        }
        throw AssertionError("Vecteurs introuvables : packages/shared/fixtures/shared-translation/seal.vectors.json")
    }

    private val root = fixtureRoot()
    private val cases: JsonArray = root.getValue("cases").jsonArray
    private val rejections: JsonArray = root.getValue("rejections").jsonArray

    private fun JsonObject.str(name: String): String = getValue(name).jsonPrimitive.content

    private fun bindingOf(input: JsonObject) = SharedTranslationBinding(
        conversationId = input.str("conversationId"),
        messageId = input.str("messageId"),
        targetLanguage = input.str("targetLanguage"),
        sourceContent = input.str("sourceContent"),
    )

    private fun keyOf(input: JsonObject): SharedTranslationKeySource {
        val secret = input["secret"]
        return if (input.str("kdf") == "message-secret" && secret != null && secret !is JsonNull) {
            SharedTranslationKeySource.MessageSecret(Base64.getDecoder().decode(secret.jsonPrimitive.content))
        } else {
            SharedTranslationKeySource.MessageContent
        }
    }

    private fun innerOf(input: JsonObject): SharedTranslationInner {
        val inner = input.getValue("inner").jsonObject
        return SharedTranslationInner(inner.str("text"), inner.str("sourceLanguage"), inner.str("engine"))
    }

    @Test
    fun `le fichier de vecteurs porte des cas et des refus`() {
        assertThat(cases.size).isAtLeast(5)
        assertThat(rejections.size).isAtLeast(10)
    }

    @Test
    fun `chaque cas rejoue empreinte, cle, donnees associees, json et enveloppe a l'identique`() {
        cases.forEach { element ->
            val case = element.jsonObject
            val input = case.getValue("input").jsonObject
            val expected = case.getValue("expected").jsonObject
            val label = case.str("_label")
            val binding = bindingOf(input)
            val key = keyOf(input)
            val inner = innerOf(input)

            assertThat(SharedTranslationSeal.sourceDigest(binding.sourceContent)).named(label).isEqualTo(expected.str("sourceDigest"))
            assertThat(Base64.getEncoder().encodeToString(SharedTranslationSeal.derivedKey(binding, key))).named(label).isEqualTo(expected.str("key"))
            assertThat(SharedTranslationSeal.aad(binding, key.kdf)).named(label).isEqualTo(expected.str("aad"))
            assertThat(SharedTranslationSeal.canonicalInnerJson(inner)).named(label).isEqualTo(expected.str("innerJson"))

            val nonce = Base64.getDecoder().decode(input.str("nonce"))
            val envelope = SharedTranslationSeal.seal(binding, key, inner, nonce)
            assertThat(envelope.payload).named(label).isEqualTo(expected.str("payload"))
            assertThat(envelope.kdf).isEqualTo(key.kdf)
            assertThat(SharedTranslationSeal.open(binding, key, envelope)).named(label).isEqualTo(inner)
        }
    }

    @Test
    fun `chaque refus rend null sans exception`() {
        rejections.forEach { element ->
            val open = element.jsonObject.getValue("open").jsonObject
            val envelope = SharedTranslationEnvelope.decodeOrNull(open.getValue("envelope") as JsonElement)
            val opened = envelope?.let { SharedTranslationSeal.open(bindingOf(open), keyOf(open), it) }
            assertThat(opened).named(element.jsonObject.str("_label")).isNull()
        }
    }
}
