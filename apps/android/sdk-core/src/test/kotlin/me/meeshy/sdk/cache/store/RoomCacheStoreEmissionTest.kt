package me.meeshy.sdk.cache.store

import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.core.database.MeeshyDatabase
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class RoomCacheStoreEmissionTest {

    private lateinit var db: MeeshyDatabase
    private val clock = FakeClock()

    @Before fun setUp() { db = inMemoryDatabase() }

    @After fun tearDown() { db.close() }

    @Test fun `une revalidation identique n emet rien`() = runTest {
        val store = rowStore(db, clock)
        store.save(listOf(Row("a", "1"), Row("b", "1")), "k")
        store.observe("k").test {
            assertThat(awaitItem()!!.map { it.id }).containsExactly("a", "b")
            clock.now += 500
            store.save(listOf(Row("a", "1"), Row("b", "1")), "k")
            expectNoEvents()
            store.save(listOf(Row("a", "1"), Row("b", "2")), "k")
            assertThat(awaitItem()).containsExactly(Row("a", "1"), Row("b", "2")).inOrder()
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test fun `une cle jamais ecrite emet null puis la liste`() = runTest {
        val store = rowStore(db, clock)
        store.observe("k").test {
            assertThat(awaitItem()).isNull()
            store.save(listOf(Row("a")), "k")
            assertThat(awaitItem()).containsExactly(Row("a"))
            cancelAndIgnoreRemainingEvents()
        }
    }
}
