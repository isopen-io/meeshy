package me.meeshy.sdk.post

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.cancel
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeoutOrNull
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.sdk.cache.KeyedJsonCache
import me.meeshy.sdk.cache.store.inMemoryDatabase
import me.meeshy.sdk.model.ApiPost
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * #14263 — le disque du fil garde la page même quand celui qui la lui confie est annulé aussitôt : c'est ce qui arrive
 * au bloc de revalidation, que le flux du fil annule dès que la page publiée le relance.
 */
@RunWith(RobolectricTestRunner::class)
class KeyedFeedDiskCacheTest {

    private lateinit var db: MeeshyDatabase
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    @Before fun setUp() { db = inMemoryDatabase() }

    @After fun tearDown() {
        scope.cancel()
        db.close()
    }

    private fun disk() = KeyedFeedDiskCache(KeyedJsonCache(db.keyedJsonCacheDao()), scope)

    private suspend fun FeedDiskCache.eventually(expected: (List<String>?) -> Boolean): List<String>? =
        withTimeoutOrNull(5_000) {
            var read = read()?.value?.map { it.id }
            while (!expected(read)) {
                delay(20)
                read = read()?.value?.map { it.id }
            }
            read
        } ?: read()?.value?.map { it.id }

    @Test
    fun `a page kept by a caller cancelled at once still reaches the disk`() = runBlocking<Unit> {
        val feed = disk()

        launch(start = CoroutineStart.UNDISPATCHED) {
            feed.keep(listOf(ApiPost(id = "p1"), ApiPost(id = "p2")), ticket = null)
            awaitCancellation()
        }.cancelAndJoin()

        assertThat(disk().eventually { it != null }).containsExactly("p1", "p2").inOrder()
    }

    @Test
    fun `the latest page kept wins`() = runBlocking<Unit> {
        val feed = disk()

        feed.keep(listOf(ApiPost(id = "old")), ticket = null)
        feed.keep(listOf(ApiPost(id = "new")), ticket = null)

        assertThat(feed.eventually { it == listOf("new") }).containsExactly("new")
    }
}
