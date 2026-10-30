package me.meeshy.sdk.socket

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.UserPresence
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File

/** Le fichier privé de la carte : un compte, une écriture atomique, une lecture qui ne plante jamais. */
class FilePresenceMapPersistenceTest {

    @get:Rule
    val folder = TemporaryFolder()

    private fun disk(): FilePresenceMapPersistence =
        FilePresenceMapPersistence(File(folder.root, "presence/presence_map.json"), Dispatchers.Unconfined)

    @Test
    fun `what was saved for an account is read back for that account`() = runTest {
        val entries = mapOf("u1" to UserPresence(true, "2026-10-29T10:00:00Z"), "u2" to UserPresence(false, null))
        disk().save("me", entries)

        assertThat(disk().load("me")).isEqualTo(entries)
    }

    @Test
    fun `another account reads nothing`() = runTest {
        disk().save("me", mapOf("u1" to UserPresence(true, "2026-10-29T10:00:00Z")))

        assertThat(disk().load("autre")).isEmpty()
    }

    @Test
    fun `a file of another account is erased by the read that refuses it`() = runTest {
        disk().save("me", mapOf("u1" to UserPresence(true, "2026-10-29T10:00:00Z")))

        disk().load("autre")

        assertThat(File(folder.root, "presence/presence_map.json").exists()).isFalse()
    }

    @Test
    fun `no file reads as an empty map`() = runTest {
        assertThat(disk().load("me")).isEmpty()
    }

    @Test
    fun `a corrupt file reads as an empty map instead of throwing`() = runTest {
        File(folder.root, "presence").mkdirs()
        File(folder.root, "presence/presence_map.json").writeText("{ pas du json")

        assertThat(disk().load("me")).isEmpty()
    }

    @Test
    fun `clear removes the file`() = runTest {
        disk().save("me", mapOf("u1" to UserPresence(true, "2026-10-29T10:00:00Z")))
        disk().clear()

        assertThat(File(folder.root, "presence/presence_map.json").exists()).isFalse()
        assertThat(disk().load("me")).isEmpty()
    }

    @Test
    fun `a save replaces the previous content and leaves no temporary file`() = runTest {
        disk().save("me", mapOf("u1" to UserPresence(true, "2026-10-29T10:00:00Z")))
        disk().save("me", mapOf("u2" to UserPresence(false, "2026-10-29T11:00:00Z")))

        assertThat(disk().load("me").keys).containsExactly("u2")
        assertThat(File(folder.root, "presence").list().orEmpty().toList()).containsExactly("presence_map.json")
    }

    @Test
    fun `clear also removes the temporary file a save interrupted halfway left behind`() = runTest {
        disk().save("me", mapOf("u1" to UserPresence(true, "2026-10-29T10:00:00Z")))
        File(folder.root, "presence/presence_map.json.tmp").writeText("""{"accountId":"me","entries":{"u2":{}}}""")

        disk().clear()

        assertThat(File(folder.root, "presence").list().orEmpty().toList()).isEmpty()
    }

    @Test
    fun `a read with no file erases the temporary file an interrupted save left behind`() = runTest {
        File(folder.root, "presence").mkdirs()
        File(folder.root, "presence/presence_map.json.tmp").writeText("""{"accountId":"me","entries":{"u2":{}}}""")

        assertThat(disk().load("me")).isEmpty()
        assertThat(File(folder.root, "presence").list().orEmpty().toList()).isEmpty()
    }

    @Test
    fun `a read keeps the file but erases a temporary file an interrupted save left beside it`() = runTest {
        disk().save("me", mapOf("u1" to UserPresence(true, "2026-10-29T10:00:00Z")))
        File(folder.root, "presence/presence_map.json.tmp").writeText("""{"accountId":"me","entries":{"u2":{}}}""")

        assertThat(disk().load("me").keys).containsExactly("u1")
        assertThat(File(folder.root, "presence").list().orEmpty().toList()).containsExactly("presence_map.json")
    }
}
