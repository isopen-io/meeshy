package me.meeshy.sdk.model.fileviewer

import com.google.common.truth.Truth.assertThat
import java.io.ByteArrayInputStream
import org.junit.Test

class TextDecodingTest {

    private fun read(bytes: ByteArray, max: Int = BoundedTextReader.DEFAULT_MAX_BYTES) =
        BoundedTextReader.read(ByteArrayInputStream(bytes), max)

    @Test
    fun `un fichier UTF-8 reste lu en UTF-8`() {
        assertThat(read("Éléphant — ça".toByteArray(Charsets.UTF_8)).text).isEqualTo("Éléphant — ça")
    }

    @Test
    fun `la marque UTF-8 est retiree`() {
        val bytes = byteArrayOf(0xEF.toByte(), 0xBB.toByte(), 0xBF.toByte()) + "salut".toByteArray()
        assertThat(read(bytes).text).isEqualTo("salut")
    }

    @Test
    fun `un fichier UTF-16 avec marque est du texte, pas du binaire`() {
        val le = byteArrayOf(0xFF.toByte(), 0xFE.toByte()) + "Bonjour é".toByteArray(Charsets.UTF_16LE)
        val be = byteArrayOf(0xFE.toByte(), 0xFF.toByte()) + "Bonjour é".toByteArray(Charsets.UTF_16BE)
        assertThat(read(le)).isEqualTo(BoundedTextReader.Result("Bonjour é", truncated = false, isBinary = false))
        assertThat(read(be).text).isEqualTo("Bonjour é")
    }

    @Test
    fun `un fichier Windows-1252 est decode sans caracteres de remplacement`() {
        val bytes = "café – déjà".toByteArray(charset("windows-1252"))
        assertThat(read(bytes).text).isEqualTo("café – déjà")
    }

    @Test
    fun `un octet nul sans marque reste binaire`() {
        assertThat(read(byteArrayOf(0x41, 0x00, 0x42)).isBinary).isTrue()
    }

    @Test
    fun `un UTF-16 coupe a la borne ne laisse pas de demi caractere`() {
        val bytes = byteArrayOf(0xFF.toByte(), 0xFE.toByte()) + "abcdef".toByteArray(Charsets.UTF_16LE)
        val result = read(bytes, 7)
        assertThat(result.truncated).isTrue()
        assertThat(result.text).isEqualTo("ab")
    }
}
