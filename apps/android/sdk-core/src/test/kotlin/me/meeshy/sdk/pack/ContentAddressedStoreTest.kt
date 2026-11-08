package me.meeshy.sdk.pack

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import java.io.File
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.runBlocking
import me.meeshy.sdk.model.pack.PackAssetRef
import org.junit.Assert.assertThrows
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class ContentAddressedStoreTest {

    @get:Rule val folder = TemporaryFolder()

    private fun store(fetcher: PackAssetFetching, dir: File = File(folder.root, "packs")) =
        ContentAddressedStore(dir, fetcher, Dispatchers.IO)

    @Test
    fun `a file is downloaded once then read from disk without the network`() = runBlocking<Unit> {
        val ref = packRef("{\"a\":1}")
        val fetcher = FakePackFetcher(mapOf(ref.src to "{\"a\":1}".toByteArray()))
        val store = store(fetcher)

        assertThat(String(store.data(ref))).isEqualTo("{\"a\":1}")
        assertThat(String(store.data(ref))).isEqualTo("{\"a\":1}")

        assertThat(fetcher.calls).isEqualTo(1)
        assertThat(store.contains(ref)).isTrue()
    }

    @Test
    fun `bytes that do not match the announced digest are refused and never written`() {
        val ref = packRef("good")
        val fetcher = FakePackFetcher(mapOf(ref.src to "evil".toByteArray()))
        val store = store(fetcher)

        assertThrows(DigestMismatchException::class.java) { runBlocking { store.data(ref) } }
        assertThat(runBlocking { store.contains(ref) }).isFalse()
    }

    @Test
    fun `a file altered on disk is downloaded again`() = runBlocking<Unit> {
        val ref = packRef("good")
        val fetcher = FakePackFetcher(mapOf(ref.src to "good".toByteArray()))
        val dir = File(folder.root, "packs")
        val store = store(fetcher, dir)
        store.data(ref)

        File(dir, ref.src).writeText("tampered")

        assertThat(String(store.data(ref))).isEqualTo("good")
        assertThat(fetcher.calls).isEqualTo(2)
    }

    @Test
    fun `two simultaneous requests for the same file make one request`() = runBlocking<Unit> {
        val ref = packRef("shared")
        val fetcher = FakePackFetcher(mapOf(ref.src to "shared".toByteArray())).apply { gate = CompletableDeferred() }
        val store = store(fetcher)

        val first = async(Dispatchers.IO) { store.data(ref) }
        val second = async(Dispatchers.IO) { store.data(ref) }
        while (fetcher.calls == 0) kotlinx.coroutines.delay(5)
        kotlinx.coroutines.delay(50)
        fetcher.gate!!.complete(Unit)

        assertThat(String(first.await())).isEqualTo("shared")
        assertThat(String(second.await())).isEqualTo("shared")
        assertThat(fetcher.calls).isEqualTo(1)
    }

    @Test
    fun `a network failure leaves nothing on disk`() {
        val ref = packRef("x")
        val store = store(FakePackFetcher(emptyMap()))

        assertThrows(PackAssetFetchException.NotFound::class.java) { runBlocking { store.data(ref) } }
        assertThat(runBlocking { store.contains(ref) }).isFalse()
    }

    @Test
    fun `prune removes only the named content addressed files that exist`() = runBlocking<Unit> {
        val ref = packRef("bye")
        val other = packRef("stay")
        val fetcher = FakePackFetcher(mapOf(ref.src to "bye".toByteArray(), other.src to "stay".toByteArray()))
        val dir = File(folder.root, "packs")
        val store = store(fetcher, dir)
        store.data(ref)
        store.data(other)
        File(dir, "notes.txt").writeText("not mine")

        val removed = store.prune(setOf(ref.src, "notes.txt", "0000000000000000.json"))

        assertThat(removed).containsExactly(ref.src)
        assertThat(store.contains(other)).isTrue()
        assertThat(File(dir, "notes.txt").exists()).isTrue()
    }

    @Test
    fun `the default directory is excluded from automatic backup and from the evictable cache`() {
        val context = ApplicationProvider.getApplicationContext<Context>()

        val dir = ContentAddressedStore.defaultDirectory(context)

        assertThat(dir.path).startsWith(context.noBackupFilesDir.path)
        assertThat(dir.path).doesNotContain(context.cacheDir.path)
    }

    @Test
    fun `a reference not addressed by content cannot even be built`() {
        assertThat(PackAssetRef.of("../etc/passwd", 1, "a".repeat(64))).isNull()
    }
}
