package me.meeshy.sdk.conversation

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import io.mockk.mockk
import java.util.concurrent.atomic.AtomicInteger
import kotlin.coroutines.CoroutineContext
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Runnable
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.core.database.dao.SearchIndexDao
import me.meeshy.core.database.entity.ConversationEntity
import me.meeshy.core.database.entity.SyncMetaEntity
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.search.LocalSearchIndex
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** #13647 — the cached list is decoded where the source says, never on the screen's collecting thread. */
@RunWith(RobolectricTestRunner::class)
class ConversationCacheSourceDecodeOffMainTest {

    private lateinit var db: MeeshyDatabase

    @Before
    fun setUp() {
        db = Room.inMemoryDatabaseBuilder(
            ApplicationProvider.getApplicationContext(),
            MeeshyDatabase::class.java,
        ).allowMainThreadQueries().build()
    }

    @After
    fun tearDown() = db.close()

    private val clock = object : CacheClock {
        override fun nowMillis() = 1_700_000_000_000L
    }

    private class CountingDispatcher(private val delegate: CoroutineDispatcher) : CoroutineDispatcher() {
        val dispatches = AtomicInteger()

        override fun dispatch(context: CoroutineContext, block: Runnable) {
            dispatches.incrementAndGet()
            delegate.dispatch(context, block)
        }
    }

    @Test
    fun `the cached list is decoded on the decode dispatcher`() = runBlocking {
        db.conversationDao().upsertAll(listOf(ConversationEntity("c1", "{\"id\":\"c1\"}", 1L, 1L, 0)))
        db.syncMetaDao().upsert(SyncMetaEntity(ConversationCacheSource.RESOURCE_KEY, 1L, null, null, null))
        val decode = CountingDispatcher(Dispatchers.IO)

        val served = ConversationCacheSource(
            db, db.conversationDao(), db.syncMetaDao(), mockk(),
            clock, LocalSearchIndex(SearchIndexDao(db)),
            decodeOn = decode,
        ).observe().first()

        assertThat(served?.map { it.id }).containsExactly("c1")
        assertThat(decode.dispatches.get()).isGreaterThan(0)
    }
}
