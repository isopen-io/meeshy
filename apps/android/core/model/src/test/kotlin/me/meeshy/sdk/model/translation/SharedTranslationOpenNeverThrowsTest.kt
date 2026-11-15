package me.meeshy.sdk.model.translation

import com.google.common.truth.Truth.assertThat
import java.util.Base64
import java.util.Random
import org.junit.Test

class SharedTranslationOpenNeverThrowsTest {
    private val binding = SharedTranslationBinding("64f0c0ffee0000000000c0de", "64f0c0ffee0000000000a001", "fr", "Hello")
    private val key = SharedTranslationKeySource.MessageContent
    private val envelope = SharedTranslationSeal.seal(binding, key, SharedTranslationInner("Bonjour", "en", "x1"))

    private fun open(payload: String) =
        SharedTranslationSeal.open(binding, key, envelope.copy(payload = payload))

    @Test
    fun `enveloppes tronquees, vides, aleatoires et non canoniques rendent null`() {
        val bytes = Base64.getDecoder().decode(envelope.payload)
        (0 until bytes.size).forEach { length ->
            assertThat(open(Base64.getEncoder().encodeToString(bytes.copyOf(length)))).isNull()
        }
        val random = Random(7)
        repeat(200) {
            val noise = ByteArray(random.nextInt(120)).also(random::nextBytes)
            assertThat(open(Base64.getEncoder().encodeToString(noise))).isNull()
        }
        listOf("", "=", "!!!!", envelope.payload.dropLast(1), envelope.payload + "\n", " " + envelope.payload, "é".repeat(60))
            .forEach { assertThat(open(it)).isNull() }
    }

    @Test
    fun `un clair authentique mais illisible rend null`() {
        listOf("pas du json", "[]", "{}", "{\"engine\":\"x\",\"sourceLanguage\":\"en\",\"text\":\"a\",\"v\":2}",
            "{\"engine\":\"x\",\"sourceLanguage\":\"en\",\"text\":\"\",\"v\":1}",
            "{\"engine\":\"x\",\"sourceLanguage\":\"en\",\"text\":\"\\ud800\",\"v\":1}",
            "{\"engine\":1,\"sourceLanguage\":\"en\",\"text\":\"a\",\"v\":1}").forEach { plain ->
            val sealed = sealRaw(plain.toByteArray())
            assertThat(open(sealed)).isNull()
        }
        assertThat(open(sealRaw(byteArrayOf(0xC3.toByte(), 0x28)))).isNull()
    }

    @Test
    fun `un clair valide avec champ inconnu s'ouvre`() {
        val plain = "{\"engine\":\"x1\",\"extra\":true,\"sourceLanguage\":\"en\",\"text\":\"Bonjour\",\"v\":1}"
        assertThat(open(sealRaw(plain.toByteArray()))?.text).isEqualTo("Bonjour")
    }

    private fun sealRaw(plain: ByteArray): String {
        val nonce = ByteArray(12)
        val cipher = javax.crypto.Cipher.getInstance("AES/GCM/NoPadding").apply {
            init(
                javax.crypto.Cipher.ENCRYPT_MODE,
                javax.crypto.spec.SecretKeySpec(SharedTranslationSeal.derivedKey(binding, key), "AES"),
                javax.crypto.spec.GCMParameterSpec(128, nonce),
            )
            updateAAD(SharedTranslationSeal.aad(binding, key.kdf).toByteArray())
        }
        return Base64.getEncoder().encodeToString(nonce + cipher.doFinal(plain))
    }
}
