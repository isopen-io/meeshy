package me.meeshy.sdk.cache

import com.google.common.truth.Truth.assertThat
import java.io.File
import java.nio.file.Files
import kotlinx.serialization.Serializable
import me.meeshy.core.crypto.primitives.StreamingSeal
import org.junit.Test

/**
 * Small documents kept ENCRYPTED at rest, one sealed file per key (#13677) — what the call transcripts and network
 * journals use where iOS uses its encrypted GRDB stores: bound to their key and account, expired at the policy's
 * keep window, bounded by its item count.
 */
class SealedDocumentStoreTest {

    @Serializable
    private data class Note(val text: String)

    private class Clock(var now: Long = 1_000_000L) : CacheClock {
        override fun nowMillis(): Long = now
    }

    private val directory: File = Files.createTempDirectory("sealed-docs").toFile()
    private val seal = StreamingSeal.ephemeral()
    private val policy = CachePolicy(freshForMillis = 100_000L, keepForMillis = 100_000L, maxItemCount = 2)

    private fun store(clock: CacheClock = Clock()) = SealedDocumentStore(directory, "test.v1", policy, { seal }, clock)

    @Test
    fun `a document reads back for its key and account`() {
        val store = store()
        store.write("call-1", Note("bonjour"), Note.serializer(), ownerId = "alice")

        assertThat(store.read("call-1", Note.serializer(), ownerId = "alice")).isEqualTo(Note("bonjour"))
        assertThat(store.read("call-2", Note.serializer(), ownerId = "alice")).isNull()
    }

    @Test
    fun `the file on disk never holds the clear text`() {
        store().write("call-1", Note("secret de l'appel"), Note.serializer(), ownerId = "alice")

        val bytes = directory.listFiles().orEmpty().flatMap { it.readBytes().toList() }.toByteArray()
        assertThat(String(bytes, Charsets.ISO_8859_1)).doesNotContain("secret")
        assertThat(directory.listFiles().orEmpty().map { it.name }.joinToString()).doesNotContain("call-1")
    }

    @Test
    fun `another account cannot open a document`() {
        val store = store()
        store.write("call-1", Note("bonjour"), Note.serializer(), ownerId = "alice")

        assertThat(store.read("call-1", Note.serializer(), ownerId = "bob")).isNull()
    }

    @Test
    fun `a document past the keep window is gone`() {
        val clock = Clock()
        val store = store(clock)
        store.write("call-1", Note("bonjour"), Note.serializer(), ownerId = "alice")

        clock.now += 100_001L

        assertThat(store.read("call-1", Note.serializer(), ownerId = "alice")).isNull()
        assertThat(directory.listFiles().orEmpty()).isEmpty()
    }

    @Test
    fun `past the item count the oldest document goes first`() {
        val clock = Clock()
        val store = store(clock)
        listOf("a", "b", "c").forEach { key ->
            store.write(key, Note(key), Note.serializer(), ownerId = "alice")
            clock.now += 2_000L
        }

        assertThat(store.read("a", Note.serializer(), ownerId = "alice")).isNull()
        assertThat(store.read("c", Note.serializer(), ownerId = "alice")).isEqualTo(Note("c"))
        assertThat(store.read("b", Note.serializer(), ownerId = "alice")).isEqualTo(Note("b"))
    }

    @Test
    fun `remove and clear delete the files`() {
        val store = store()
        store.write("a", Note("a"), Note.serializer(), ownerId = "alice")
        store.write("b", Note("b"), Note.serializer(), ownerId = "alice")

        store.remove("a")
        assertThat(store.read("a", Note.serializer(), ownerId = "alice")).isNull()

        store.clear()
        assertThat(directory.listFiles().orEmpty()).isEmpty()
    }

    @Test
    fun `a document sealed under a lost key reads as absent`() {
        store().write("a", Note("a"), Note.serializer(), ownerId = "alice")

        val afterReinstall = SealedDocumentStore(directory, "test.v1", policy, { StreamingSeal.ephemeral() }, Clock())

        assertThat(afterReinstall.read("a", Note.serializer(), ownerId = "alice")).isNull()
    }
}
