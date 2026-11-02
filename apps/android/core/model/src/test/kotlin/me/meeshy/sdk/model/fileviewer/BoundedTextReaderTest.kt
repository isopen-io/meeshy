package me.meeshy.sdk.model.fileviewer

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class BoundedTextReaderTest {

    @Test
    fun `un petit fichier se lit en entier`() {
        val read = BoundedTextReader.read("héllo\nworld".byteInputStream(), maxBytes = 100)
        assertThat(read.text).isEqualTo("héllo\nworld")
        assertThat(read.truncated).isFalse()
    }

    @Test
    fun `un fichier trop gros est coupe a la borne et le dit`() {
        val read = BoundedTextReader.read("a".repeat(500).byteInputStream(), maxBytes = 100)
        assertThat(read.text).hasLength(100)
        assertThat(read.truncated).isTrue()
    }

    @Test
    fun `un fichier de la taille exacte de la borne n'est pas tronque`() {
        val read = BoundedTextReader.read("a".repeat(100).byteInputStream(), maxBytes = 100)
        assertThat(read.truncated).isFalse()
    }

    @Test
    fun `la coupe au milieu d'un caractere multi-octets ne laisse pas de caractere de remplacement`() {
        val read = BoundedTextReader.read("éé".byteInputStream(), maxBytes = 3)
        assertThat(read.text).isEqualTo("é")
        assertThat(read.truncated).isTrue()
    }

    @Test
    fun `un contenu binaire est refuse`() {
        val read = BoundedTextReader.read(byteArrayOf(0x50, 0x4B, 0x00, 0x01).inputStream(), maxBytes = 100)
        assertThat(read.isBinary).isTrue()
    }
}
