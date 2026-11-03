package me.meeshy.sdk.cache.purge

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.ApiPostMedia
import me.meeshy.sdk.model.mediacache.CacheDomain
import me.meeshy.sdk.model.mediacache.CacheMediaIndex
import me.meeshy.sdk.testing.TestDataStores
import org.junit.After
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class MediaAttributionLedgerTest {
    @get:Rule
    val tmp = TemporaryFolder()
    private val dataStores = TestDataStores()

    @After
    fun tearDown() = dataStores.close()

    private fun ledger() = MediaAttributionLedger(dataStores.preferences(tmp.newFile("ledger.preferences_pb").also { it.delete() }))

    @Test
    fun `le fil lu s ecrit sous publications ou reels selon son type`() = runTest(dataStores.dispatcher) {
        val ledger = ledger()

        ledger.recordFeed(
            listOf(
                ApiPost(id = "p", type = "POST", media = listOf(ApiPostMedia(id = "1", fileUrl = "https://x/p.jpg"))),
                ApiPost(id = "r", type = "REEL", media = listOf(ApiPostMedia(id = "2", fileUrl = "https://x/r.mp4"))),
            ),
        )

        assertThat(ledger.index(CacheDomain.POSTS).images).containsExactly("https://x/p.jpg")
        assertThat(ledger.index(CacheDomain.REELS).videos).containsExactly("https://x/r.mp4")
        assertThat(ledger.index(CacheDomain.STORIES).isEmpty).isTrue()
    }

    @Test
    fun `le registre survit a une nouvelle instance sur le meme fichier`() = runTest(dataStores.dispatcher) {
        val store = dataStores.preferences(tmp.newFile("persist.preferences_pb").also { it.delete() })
        MediaAttributionLedger(store).record(CacheDomain.POSTS, CacheMediaIndex(images = setOf("https://x/a")))

        assertThat(MediaAttributionLedger(store).index(CacheDomain.POSTS).images).containsExactly("https://x/a")
    }

    @Test
    fun `oublier retire les fichiers purges`() = runTest(dataStores.dispatcher) {
        val ledger = ledger()
        ledger.record(CacheDomain.POSTS, CacheMediaIndex(images = setOf("a", "b")))

        ledger.forget(setOf("a"))

        assertThat(ledger.index(CacheDomain.POSTS).images).containsExactly("b")
    }

    @Test
    fun `la deconnexion vide le registre`() = runTest(dataStores.dispatcher) {
        val ledger = ledger()
        ledger.record(CacheDomain.REELS, CacheMediaIndex(videos = setOf("a")))

        ledger.clear()

        assertThat(ledger.index(CacheDomain.REELS).isEmpty).isTrue()
    }

    @Test
    fun `le registre est borne aux urls les plus recentes`() = runTest(dataStores.dispatcher) {
        val ledger = ledger()

        ledger.record(CacheDomain.POSTS, CacheMediaIndex(images = (1..4_100).map { "u$it" }.toSet()))

        val kept = ledger.index(CacheDomain.POSTS).images
        assertThat(kept).hasSize(4_000)
        assertThat(kept).contains("u4100")
        assertThat(kept).doesNotContain("u1")
    }
}
