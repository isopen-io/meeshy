package me.meeshy.ui.component

import com.google.common.truth.Truth.assertThat
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicInteger
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.asCoroutineDispatcher
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.runBlocking
import me.meeshy.sdk.model.EmojiCatalogSnapshot
import org.junit.Test

class EmojiCatalogLoaderTest {

    private val builds = AtomicInteger(0)
    private val buildThreads = mutableListOf<String>()

    private fun newLoader(threadName: String = "emoji-loader-test"): Pair<EmojiCatalogLoader, () -> Unit> {
        val executor = Executors.newSingleThreadExecutor { Thread(it, threadName) }
        val loader = EmojiCatalogLoader(
            dispatcher = executor.asCoroutineDispatcher(),
            build = {
                builds.incrementAndGet()
                synchronized(buildThreads) { buildThreads.add(Thread.currentThread().name) }
                EmojiCatalogSnapshot.build()
            },
        )
        return loader to { executor.shutdown() }
    }

    @Test
    fun `the catalog is built off the calling thread`() {
        val (loader, shutdown) = newLoader("emoji-loader-test")
        try {
            val callerThread = Thread.currentThread().name

            runBlocking { loader.load() }

            assertThat(buildThreads).containsExactly("emoji-loader-test")
            assertThat(buildThreads.single()).isNotEqualTo(callerThread)
        } finally {
            shutdown()
        }
    }

    @Test
    fun `nothing is loaded before the first request and the value is ready after`() {
        val (loader, shutdown) = newLoader()
        try {
            assertThat(loader.loaded).isNull()
            val snapshot = runBlocking { loader.load() }
            assertThat(loader.loaded).isSameInstanceAs(snapshot)
        } finally {
            shutdown()
        }
    }

    @Test
    fun `a second request reuses the first build`() {
        val (loader, shutdown) = newLoader()
        try {
            val first = runBlocking { loader.load() }
            val second = runBlocking { loader.load() }

            assertThat(second).isSameInstanceAs(first)
            assertThat(builds.get()).isEqualTo(1)
        } finally {
            shutdown()
        }
    }

    @Test
    fun `concurrent first requests share a single build`() {
        val (loader, shutdown) = newLoader()
        try {
            val snapshots = runBlocking {
                (1..8).map { async(Dispatchers.Default) { loader.load() } }.awaitAll()
            }

            assertThat(builds.get()).isEqualTo(1)
            assertThat(snapshots.toSet()).hasSize(1)
        } finally {
            shutdown()
        }
    }

    @Test
    fun `the loaded snapshot holds the ten categories and a working search`() {
        val (loader, shutdown) = newLoader()
        try {
            val snapshot = runBlocking { loader.load() }

            assertThat(snapshot.categories).hasSize(10)
            assertThat(snapshot.index.search("heart")).contains("❤️")
        } finally {
            shutdown()
        }
    }
}
