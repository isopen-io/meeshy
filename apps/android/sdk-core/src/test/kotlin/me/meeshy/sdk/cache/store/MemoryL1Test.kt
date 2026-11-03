package me.meeshy.sdk.cache.store

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.sdk.cache.CacheResult
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

class MemoryL1Test {

    @Test fun `la capacite par defaut est de 20 cles`() {
        val l1 = MemoryL1<Int>()
        (1..25).forEach { l1.put("k$it", it) }
        assertThat(l1.size).isEqualTo(20)
        assertThat(l1["k1"]).isNull()
        assertThat(l1["k25"]).isEqualTo(25)
    }

    @Test fun `la cle la moins recemment lue sort la premiere`() {
        val l1 = MemoryL1<Int>(capacity = 3)
        l1.put("a", 1); l1.put("b", 2); l1.put("c", 3)
        l1["a"]
        l1.put("d", 4)
        assertThat(l1.keys()).containsExactly("c", "a", "d").inOrder()
        assertThat(l1["b"]).isNull()
    }

    @Test fun `remove et clear invalident`() {
        val l1 = MemoryL1<Int>(capacity = 3)
        l1.put("a", 1); l1.put("b", 2)
        l1.remove("a")
        assertThat(l1["a"]).isNull()
        l1.clear()
        assertThat(l1.size).isEqualTo(0)
    }
}

@RunWith(RobolectricTestRunner::class)
class RoomCacheStoreL1Test {
    private lateinit var db: MeeshyDatabase
    private val clock = FakeClock()

    @Before fun setUp() { db = inMemoryDatabase() }

    @After fun tearDown() { db.close() }

    private fun store() = RoomCacheStore(
        db.cacheEntryDao(), "l1", TestPolicy, Row.serializer(), { it.id }, clock, l1Capacity = 20,
    )

    @Test fun `une relecture d une cle deja vue ne touche pas Room`() = runTest {
        val store = store()
        store.save(listOf(Row("a")), "k")
        store.load("k")
        db.cacheEntryDao().deleteNamespace("l1")

        assertThat((store.load("k") as CacheResult.Fresh).value.map { it.id }).containsExactly("a")
    }

    @Test fun `une ecriture invalide le L1`() = runTest {
        val store = store()
        store.save(listOf(Row("a")), "k")
        store.load("k")
        store.save(listOf(Row("b")), "k")

        assertThat((store.load("k") as CacheResult.Fresh).value.map { it.id }).containsExactly("b")
    }

    @Test fun `apres dropMemory la lecture retourne au disque sans perdre la liste`() = runTest {
        val store = store()
        store.save(listOf(Row("a")), "k")
        store.load("k")
        store.dropMemory()

        assertThat((store.load("k") as CacheResult.Fresh).value.map { it.id }).containsExactly("a")
    }

    @Test fun `clearAll vide aussi le L1`() = runTest {
        val store = store()
        store.save(listOf(Row("a")), "k")
        store.load("k")
        store.clearAll()

        assertThat(store.load("k")).isEqualTo(CacheResult.Empty)
    }
}
