package me.meeshy.sdk.model.waveform

import com.google.common.truth.Truth.assertThat
import java.io.File
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

/**
 * **Même contenu ⇒ même clé, partout.** Un `recording.m4a` n'est pas un autre `recording.m4a`, et
 * un même son sous deux noms ne se calcule qu'une fois. Miroir de `WaveformContentKey.swift`.
 */
class WaveformContentKeyTest {

    @get:Rule
    val folder = TemporaryFolder()

    private fun bytes(size: Int, seed: Int = 7) = ByteArray(size) { ((it * 31 + seed) and 0xFF).toByte() }

    private fun file(name: String, content: ByteArray, directory: String = "a"): File {
        val dir = File(folder.root, directory).apply { mkdirs() }
        return File(dir, name).apply { writeBytes(content) }
    }

    @Test
    fun `deux enregistrements de meme nom et de contenus differents ne se confondent pas`() {
        val first = file("recording.m4a", bytes(5_000, seed = 1), directory = "one")
        val second = file("recording.m4a", bytes(5_000, seed = 2), directory = "two")

        assertThat(WaveformContentKey.ofFile(first)).isNotEqualTo(WaveformContentKey.ofFile(second))
    }

    @Test
    fun `un meme son sous deux noms rend la meme cle`() {
        val content = bytes(150_000)
        val original = file("voice.m4a", content)
        val copy = file("autre-nom.m4a", content, directory = "b")

        assertThat(WaveformContentKey.ofFile(copy)).isEqualTo(WaveformContentKey.ofFile(original))
    }

    @Test
    fun `la voie octets et la voie fichier lisent les memes octets`() {
        listOf(1, 100, 65_535, 65_536, 65_537, 100_000, 131_072, 131_073, 400_000).forEach { size ->
            val content = bytes(size)

            assertThat(WaveformContentKey.ofBytes(content)).isEqualTo(WaveformContentKey.ofFile(file("s$size.bin", content)))
        }
    }

    @Test
    fun `la taille entre dans l'empreinte`() {
        val short = bytes(70_000)
        val long = short + ByteArray(10) { short[short.size - 10 + it] }

        assertThat(WaveformContentKey.ofBytes(short)).isNotEqualTo(WaveformContentKey.ofBytes(long))
    }

    @Test
    fun `un changement dans les premiers ou les derniers kibioctets change la cle`() {
        val base = bytes(300_000)
        val head = base.copyOf().also { it[10] = (it[10] + 1).toByte() }
        val tail = base.copyOf().also { it[base.size - 10] = (it[base.size - 10] + 1).toByte() }

        assertThat(WaveformContentKey.ofBytes(head)).isNotEqualTo(WaveformContentKey.ofBytes(base))
        assertThat(WaveformContentKey.ofBytes(tail)).isNotEqualTo(WaveformContentKey.ofBytes(base))
    }

    @Test
    fun `la cle d'un contenu est prefixee c et celle d'une adresse u`() {
        assertThat(WaveformContentKey.ofBytes(bytes(10))).matches("c-[0-9a-f]{16}")
        assertThat(WaveformContentKey.ofAddress("https://cdn.meeshy.me/a.m4a")).matches("u-[0-9a-f]{16}")
    }

    @Test
    fun `les vecteurs sont ceux de la version iOS`() {
        assertThat(WaveformContentKey.ofAddress("")).isEqualTo("u-cbf29ce484222325")
        assertThat(WaveformContentKey.ofAddress("a")).isEqualTo("u-af63dc4c8601ec8c")
        assertThat(WaveformContentKey.ofAddress("https://cdn.meeshy.me/a.m4a")).isEqualTo("u-ef62ef0ae67c4a3a")
        assertThat(WaveformContentKey.ofBytes("hello".toByteArray())).isEqualTo("c-ed685d623b7696e0")
        assertThat(WaveformContentKey.ofBytes(byteArrayOf(1, 2, 3))).isEqualTo("c-2e03f235165c6076")
        assertThat(WaveformContentKey.ofBytes(ByteArray(200_000) { ((it * 31 + 7) and 0xFF).toByte() }))
            .isEqualTo("c-c09c37b894f546ad")
    }

    @Test
    fun `une adresse distante est clee par son adresse sans etre lue`() {
        val url = "https://cdn.meeshy.me/a.m4a"

        assertThat(WaveformContentKey.of(url)).isEqualTo(WaveformContentKey.ofAddress(url))
        assertThat(WaveformContentKey.of("$url?v=2")).isNotEqualTo(WaveformContentKey.of(url))
    }

    @Test
    fun `un fichier file-colon-slash-slash et son chemin rendent la meme cle`() {
        val saved = file("voice.m4a", bytes(2_000))

        assertThat(WaveformContentKey.of("file://${saved.absolutePath}"))
            .isEqualTo(WaveformContentKey.of(saved.absolutePath))
        assertThat(WaveformContentKey.of(saved.absolutePath)).startsWith("c-")
    }

    @Test
    fun `un fichier absent ou vide retombe sur son chemin`() {
        val missing = File(folder.root, "absent.m4a")
        val empty = file("empty.m4a", ByteArray(0))

        assertThat(WaveformContentKey.ofFile(missing)).isEqualTo(WaveformContentKey.ofAddress(missing.path))
        assertThat(WaveformContentKey.ofFile(empty)).isEqualTo(WaveformContentKey.ofAddress(empty.path))
    }

    @Test
    fun `l'emplacement distingue le local de l'adresse`() {
        assertThat(WaveformLocation.parse("/data/user/0/me.meeshy/cache/a.m4a"))
            .isEqualTo(WaveformLocation.Local("/data/user/0/me.meeshy/cache/a.m4a"))
        assertThat(WaveformLocation.parse("file:///data/cache/a%20b.m4a")).isEqualTo(WaveformLocation.Local("/data/cache/a b.m4a"))
        assertThat(WaveformLocation.parse("file:///data/cache/a b.m4a")).isEqualTo(WaveformLocation.Local("/data/cache/a b.m4a"))
        assertThat(WaveformLocation.parse("https://cdn.meeshy.me/a.m4a")).isEqualTo(WaveformLocation.Remote("https://cdn.meeshy.me/a.m4a"))
        assertThat(WaveformLocation.parse("content://media/external/audio/1")).isEqualTo(WaveformLocation.Remote("content://media/external/audio/1"))
        assertThat(WaveformLocation.parse("relatif/a.m4a")).isEqualTo(WaveformLocation.Local("relatif/a.m4a"))
    }
}
