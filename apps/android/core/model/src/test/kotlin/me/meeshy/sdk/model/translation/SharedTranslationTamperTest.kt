package me.meeshy.sdk.model.translation

import com.google.common.truth.Truth.assertThat
import java.util.Base64
import org.junit.Assert.assertThrows
import org.junit.Test

class SharedTranslationTamperTest {
    private val binding = SharedTranslationBinding("64f0c0ffee0000000000c0de", "64f0c0ffee0000000000a001", "fr", "Hello, how are you today?")
    private val inner = SharedTranslationInner("Bonjour, comment vas-tu ?", "en", "apple-translation")
    private val key = SharedTranslationKeySource.MessageContent

    @Test
    fun `un aller-retour rend la traduction`() {
        assertThat(SharedTranslationSeal.open(binding, key, SharedTranslationSeal.seal(binding, key, inner))).isEqualTo(inner)
    }

    @Test
    fun `deux scellements du meme texte different par le nonce`() {
        assertThat(SharedTranslationSeal.seal(binding, key, inner).payload)
            .isNotEqualTo(SharedTranslationSeal.seal(binding, key, inner).payload)
    }

    @Test
    fun `le texte clair n'est jamais dans la charge`() {
        val payload = SharedTranslationSeal.seal(binding, key, inner).payload
        val raw = String(Base64.getDecoder().decode(payload), Charsets.ISO_8859_1)
        assertThat(raw).doesNotContain("Bonjour")
        assertThat(payload).doesNotContain("Bonjour")
    }

    @Test
    fun `chaque octet altere est rejete`() {
        val envelope = SharedTranslationSeal.seal(binding, key, inner)
        val bytes = Base64.getDecoder().decode(envelope.payload)
        bytes.indices.forEach { index ->
            val flipped = bytes.copyOf().also { it[index] = (it[index].toInt() xor 1).toByte() }
            val tampered = envelope.copy(payload = Base64.getEncoder().encodeToString(flipped))
            assertThat(SharedTranslationSeal.open(binding, key, tampered)).isNull()
        }
    }

    @Test
    fun `autre langue, autre message, texte modifie, version ou algorithme differents rendent null`() {
        val envelope = SharedTranslationSeal.seal(binding, key, inner)
        assertThat(SharedTranslationSeal.open(binding.copy(targetLanguage = "es"), key, envelope)).isNull()
        assertThat(SharedTranslationSeal.open(binding.copy(messageId = "64f0c0ffee0000000000a002"), key, envelope)).isNull()
        assertThat(SharedTranslationSeal.open(binding.copy(sourceContent = "Hello"), key, envelope)).isNull()
        assertThat(SharedTranslationSeal.open(binding, key, envelope.copy(v = 2))).isNull()
        assertThat(SharedTranslationSeal.open(binding, key, envelope.copy(alg = "A128GCM"))).isNull()
        assertThat(SharedTranslationSeal.open(binding, SharedTranslationKeySource.MessageSecret(ByteArray(32)), envelope.copy(kdf = SharedTranslationKdf.MESSAGE_SECRET))).isNull()
    }

    @Test
    fun `liaison invalide leve a l'ecriture et rend null a l'ouverture`() {
        val bad = binding.copy(conversationId = "pas un id")
        assertThat(assertThrows(SharedTranslationSealException::class.java) { SharedTranslationSeal.seal(bad, key, inner) }.failure)
            .isEqualTo(SharedTranslationSealFailure.INVALID_BINDING)
        assertThat(SharedTranslationSeal.open(bad, key, SharedTranslationSeal.seal(binding, key, inner))).isNull()
    }

    @Test
    fun `une traduction inadmissible ou trop longue ne se scelle pas`() {
        assertThat(assertThrows(SharedTranslationSealException::class.java) { SharedTranslationSeal.seal(binding, key, inner.copy(text = "")) }.failure)
            .isEqualTo(SharedTranslationSealFailure.INVALID_INNER)
        val heavy = inner.copy(text = "\u0001".repeat(10_000))
        assertThat(assertThrows(SharedTranslationSealException::class.java) { SharedTranslationSeal.seal(binding, key, heavy) }.failure)
            .isEqualTo(SharedTranslationSealFailure.PAYLOAD_TOO_LONG)
    }

    @Test
    fun `un secret de mauvaise longueur ou un texte vide ne scellent pas`() {
        assertThat(assertThrows(SharedTranslationSealException::class.java) {
            SharedTranslationSeal.seal(binding, SharedTranslationKeySource.MessageSecret(ByteArray(5)), inner)
        }.failure).isEqualTo(SharedTranslationSealFailure.INVALID_SECRET_LENGTH)
        assertThat(assertThrows(SharedTranslationSealException::class.java) {
            SharedTranslationSeal.seal(binding.copy(sourceContent = ""), key, inner)
        }.failure).isEqualTo(SharedTranslationSealFailure.EMPTY_SOURCE_CONTENT)
    }

    @Test
    fun `un nonce de mauvaise taille est refuse`() {
        assertThat(assertThrows(SharedTranslationSealException::class.java) {
            SharedTranslationSeal.seal(binding, key, inner, ByteArray(8))
        }.failure).isEqualTo(SharedTranslationSealFailure.INVALID_NONCE)
    }
}
