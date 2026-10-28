package me.meeshy.core.crypto.primitives

import com.google.common.truth.Truth.assertThat
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File
import java.io.IOException
import java.nio.ByteBuffer
import java.nio.channels.Channels

class StreamingSealTest {
    @get:Rule val folder = TemporaryFolder()

    private val aad = "media-blob:c1".toByteArray()

    private fun sealedFile(seal: StreamingSeal, plain: ByteArray, associatedData: ByteArray = aad): File =
        folder.newFile().also { file -> seal.sealing(file.outputStream(), associatedData).use { it.write(plain) } }

    private fun StreamingSeal.readAt(file: File, offset: Long, length: Int, associatedData: ByteArray = aad): ByteArray =
        openSeekable(file, associatedData).use { channel ->
            channel.position(offset)
            val out = ByteArray(length)
            Channels.newInputStream(channel).use { input ->
                var done = 0
                while (done < length) done += input.read(out, done, length - done).also { check(it > 0) }
            }
            out
        }

    @Test
    fun `what is sealed opens back, whole and from any offset, with its plaintext size`() {
        val seal = StreamingSeal.ephemeral()
        val plain = ByteArray(300_000) { (it % 253).toByte() }
        val file = sealedFile(seal, plain)

        assertThat(seal.opening(file.inputStream(), aad).use { it.readBytes() }).isEqualTo(plain)
        assertThat(seal.openSeekable(file, aad).use { it.size() }).isEqualTo(plain.size.toLong())
        assertThat(seal.readAt(file, 123_457, 50_000)).isEqualTo(plain.copyOfRange(123_457, 173_457))
    }

    @Test
    fun `the file on disk does not carry the plaintext`() {
        val seal = StreamingSeal.ephemeral()
        val marker = "SECRET-LOCATION-48.8566,2.3522".toByteArray()
        val file = sealedFile(seal, ByteArray(10_000) + marker + ByteArray(10_000))

        assertThat(String(file.readBytes(), Charsets.ISO_8859_1)).doesNotContain(String(marker, Charsets.ISO_8859_1))
    }

    @Test
    fun `a file bound to another name, another key or altered does not open`() {
        val seal = StreamingSeal.ephemeral()
        val file = sealedFile(seal, ByteArray(20_000) { it.toByte() })

        fun opens(seal: StreamingSeal, associatedData: ByteArray) =
            runCatching { seal.openSeekable(file, associatedData).use { it.read(ByteBuffer.allocate(20_000)) } }.isSuccess

        assertThat(opens(seal, "media-blob:c2".toByteArray())).isFalse()
        assertThat(opens(StreamingSeal.ephemeral(), aad)).isFalse()
        val tampered = file.readBytes().also { it[it.size / 2] = (it[it.size / 2].toInt() xor 1).toByte() }
        file.writeBytes(tampered)
        assertThat(runCatching { seal.opening(file.inputStream(), aad).use { it.readBytes() } }.exceptionOrNull())
            .isInstanceOf(IOException::class.java)
    }

    @Test
    fun `a truncated file does not open as a shorter plaintext`() {
        val seal = StreamingSeal.ephemeral()
        val file = sealedFile(seal, ByteArray(40_000) { it.toByte() })
        file.writeBytes(file.readBytes().copyOf(file.length().toInt() - 5_000))

        assertThat(runCatching { seal.opening(file.inputStream(), aad).use { it.readBytes() } }.isFailure).isTrue()
    }
}
