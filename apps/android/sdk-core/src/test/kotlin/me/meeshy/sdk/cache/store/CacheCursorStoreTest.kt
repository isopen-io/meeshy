package me.meeshy.sdk.cache.store

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.model.cache.PaginationCursor
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class CacheCursorStoreTest {

    private lateinit var db: MeeshyDatabase
    private val clock = FakeClock()

    @Before fun setUp() { db = inMemoryDatabase() }

    @After fun tearDown() { db.close() }

    private fun cursors() = CacheCursorStore(db.cacheEntryDao(), "test")

    @Test fun `le curseur survit a un nouveau store sur la meme base`() = runTest {
        rowStore(db, clock).save(listOf(Row("a")), "k")
        cursors().save(PaginationCursor(nextCursor = "a", hasMore = true), "k")
        assertThat(CacheCursorStore(db.cacheEntryDao(), "test").load("k"))
            .isEqualTo(PaginationCursor("a", true))
    }

    @Test fun `reecrire la liste conserve le curseur et l horloge avance`() = runTest {
        val store = rowStore(db, clock)
        store.save(listOf(Row("a")), "k")
        cursors().save(PaginationCursor("a", false), "k")
        clock.now += 300
        store.save(listOf(Row("a"), Row("b")), "k")
        assertThat(store.cursor("k")).isEqualTo(PaginationCursor("a", false))
    }

    @Test fun `un curseur sans liste n invente pas une cle synchronisee`() = runTest {
        cursors().save(PaginationCursor("x", true), "k")
        assertThat(cursors().load("k")).isNull()
        assertThat(rowStore(db, clock).load("k")).isEqualTo(CacheResult.Empty)
    }

    @Test fun `un curseur illisible est ignore`() = runTest {
        rowStore(db, clock).save(listOf(Row("a")), "k")
        val meta = db.cacheEntryDao().meta("test", "k")!!
        db.cacheEntryDao().upsert(listOf(meta.copy(payload = "garbage")))
        assertThat(cursors().load("k")).isNull()
    }
}
