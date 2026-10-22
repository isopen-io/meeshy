package me.meeshy.sdk.cache.store

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.core.database.entity.CacheEntryEntity
import me.meeshy.sdk.cache.CacheResult
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class RoomCacheStoreTest {

    private lateinit var db: MeeshyDatabase
    private val clock = FakeClock()

    @Before fun setUp() { db = inMemoryDatabase() }

    @After fun tearDown() { db.close() }

    private fun store(namespace: String = "test") = rowStore(db, clock, namespace)

    private fun rows(vararg ids: String) = ids.map { Row(it, "label-$it") }

    @Test fun `une cle jamais ecrite est Empty`() = runTest {
        assertThat(store().load("k")).isEqualTo(CacheResult.Empty)
    }

    @Test fun `une liste vide ecrite est Fresh et vide, distincte de Empty`() = runTest {
        store().save(emptyList(), "k")
        assertThat(store().load("k")).isEqualTo(CacheResult.Fresh(emptyList<Row>(), 0L))
    }

    @Test fun `save puis load restitue la liste dans l ordre`() = runTest {
        store().save(rows("a", "b", "c"), "k")
        assertThat((store().load("k") as CacheResult.Fresh).value.map { it.id }).containsExactly("a", "b", "c").inOrder()
    }

    @Test fun `Fresh puis Stale puis Syncing selon l age`() = runTest {
        store().save(rows("a"), "k")
        clock.now += 500
        assertThat(store().load("k")).isInstanceOf(CacheResult.Fresh::class.java)
        clock.now += 1_000
        assertThat(store().load("k")).isInstanceOf(CacheResult.Stale::class.java)
        clock.now += 20_000
        assertThat(store().load("k")).isInstanceOf(CacheResult.Syncing::class.java)
    }

    @Test fun `l expire reste lisible via loadIgnoringExpiry`() = runTest {
        store().save(rows("a", "b"), "k")
        clock.now += 50_000
        val snapshot = store().loadIgnoringExpiry("k")!!
        assertThat(snapshot.items.map { it.id }).containsExactly("a", "b")
        assertThat(snapshot.ageMillis).isEqualTo(50_000L)
    }

    @Test fun `savePreservingFreshness ne rajeunit pas la cle`() = runTest {
        store().save(rows("a"), "k")
        clock.now += 5_000
        store().savePreservingFreshness(rows("a", "b"), "k")
        val result = store().load("k")
        assertThat(result).isInstanceOf(CacheResult.Stale::class.java)
        assertThat((result as CacheResult.Stale).ageMillis).isEqualTo(5_000L)
    }

    @Test fun `savePreservingFreshness sur une cle neuve la date comme Stale`() = runTest {
        store().savePreservingFreshness(rows("a"), "k")
        assertThat(store().load("k")).isInstanceOf(CacheResult.Stale::class.java)
    }

    @Test fun `saveAsStale force la revalidation tout en peignant`() = runTest {
        store().saveAsStale(rows("a"), "k")
        assertThat(store().load("k")).isInstanceOf(CacheResult.Stale::class.java)
    }

    @Test fun `save avance l horloge`() = runTest {
        store().save(rows("a"), "k")
        clock.now += 5_000
        store().save(rows("a"), "k")
        assertThat(store().load("k")).isInstanceOf(CacheResult.Fresh::class.java)
    }

    @Test fun `maxItemCount tronque les plus anciens`() = runTest {
        store().save(rows("a", "b", "c", "d", "e"), "k")
        assertThat((store().load("k") as CacheResult.Fresh).value.map { it.id }).containsExactly("c", "d", "e").inOrder()
    }

    @Test fun `les lignes sorties sont supprimees et les changees reecrites`() = runTest {
        store().save(listOf(Row("a", "1"), Row("b", "1")), "k")
        store().save(listOf(Row("b", "2"), Row("c", "1")), "k")
        val items = (store().load("k") as CacheResult.Fresh).value
        assertThat(items).containsExactly(Row("b", "2"), Row("c", "1")).inOrder()
    }

    @Test fun `une ligne au hash inchange n est pas reecrite`() = runTest {
        store().save(rows("a", "b"), "k")
        val before = db.cacheEntryDao().items("test", "k").first { it.itemId == "a" }
        clock.now += 100
        store().save(rows("a", "b"), "k")
        assertThat(db.cacheEntryDao().items("test", "k").first { it.itemId == "a" }).isEqualTo(before)
    }

    @Test fun `deux espaces de noms ne s ecrasent pas et se purgent separement`() = runTest {
        store("community:list").save(rows("a"), "k")
        store("participants:1").save(rows("z"), "k")
        store("community:list").clearAll()
        assertThat(store("community:list").load("k")).isEqualTo(CacheResult.Empty)
        assertThat((store("participants:1").load("k") as CacheResult.Fresh).value.map { it.id }).containsExactly("z")
    }

    @Test fun `une ligne illisible est un cache miss silencieux`() = runTest {
        store().save(rows("a"), "k")
        val broken = db.cacheEntryDao().items("test", "k").first().copy(payload = "{not json")
        db.cacheEntryDao().upsert(listOf(broken))
        assertThat(store().load("k")).isEqualTo(CacheResult.Empty)
        assertThat(store().loadIgnoringExpiry("k")).isNull()
    }

    @Test fun `la ligne de metadonnees n est jamais servie comme element`() = runTest {
        store().save(rows("a"), "k")
        assertThat(db.cacheEntryDao().meta("test", "k")!!.itemId).isEqualTo(CacheEntryEntity.META_ITEM_ID)
        assertThat((store().load("k") as CacheResult.Fresh).value).hasSize(1)
    }
}
