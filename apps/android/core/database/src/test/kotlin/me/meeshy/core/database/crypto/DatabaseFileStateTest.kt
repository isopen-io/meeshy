package me.meeshy.core.database.crypto

import com.google.common.truth.Truth.assertThat
import java.io.File
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class DatabaseFileStateTest {

    @get:Rule
    val folder = TemporaryFolder()

    private fun file(bytes: ByteArray): File = folder.newFile().also { it.writeBytes(bytes) }

    private fun plaintext(size: Int) = ("SQLite format 3\u0000".toByteArray(Charsets.US_ASCII) + ByteArray(size))

    @Test
    fun `un fichier absent ou vide est absent`() {
        assertThat(DatabaseFileStates.of(File(folder.root, "none.db"))).isEqualTo(DatabaseFileState.ABSENT)
        assertThat(DatabaseFileStates.of(file(ByteArray(0)))).isEqualTo(DatabaseFileState.ABSENT)
    }

    @Test
    fun `l'en-tete SQLite format 3 designe une base en clair`() {
        assertThat(DatabaseFileStates.of(file(plaintext(4096)))).isEqualTo(DatabaseFileState.PLAINTEXT)
    }

    @Test
    fun `des octets sans en-tete lisible forment une base chiffree`() {
        assertThat(DatabaseFileStates.of(file(ByteArray(4096) { (it * 31 + 7).toByte() }))).isEqualTo(DatabaseFileState.ENCRYPTED)
    }

    @Test
    fun `un fichier plus court qu'une page sans en-tete est tronque`() {
        assertThat(DatabaseFileStates.of(file(ByteArray(100) { 9 }))).isEqualTo(DatabaseFileState.TRUNCATED)
    }

    @Test
    fun `un en-tete que le disque refuse de lire est indisponible, jamais tronque`() {
        val unreadable = File(folder.root, "meeshy.db").also { it.mkdirs() }

        assertThat(DatabaseFileStates.of(unreadable)).isEqualTo(DatabaseFileState.UNAVAILABLE)
    }
}
