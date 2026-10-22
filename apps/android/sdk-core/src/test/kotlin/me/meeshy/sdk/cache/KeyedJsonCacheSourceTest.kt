package me.meeshy.sdk.cache

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.take
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.Serializable
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.core.database.entity.KeyedJsonCacheEntity
import me.meeshy.sdk.cache.store.FakeClock
import me.meeshy.sdk.cache.store.inMemoryDatabase
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import java.io.IOException

@Serializable
data class Doc(val name: String)

@RunWith(RobolectricTestRunner::class)
class KeyedJsonCacheSourceTest {

    private lateinit var db: MeeshyDatabase
    private val clock = FakeClock()
    private val policy = CachePolicy(freshForMillis = 1_000, keepForMillis = 10_000)
    private var fetches = 0

    @Before fun setUp() { db = inMemoryDatabase() }

    @After fun tearDown() { db.close() }

    private fun cache() = KeyedJsonCache(db.keyedJsonCacheDao(), clock)

    private fun source(fetch: suspend () -> Doc = { fetches++; Doc("net") }) =
        KeyedJsonCacheSource(cache(), "ns", "k", Doc.serializer(), fetch)

    @Test fun `cle jamais synchronisee Empty puis valeur reseau`() = runTest {
        val results = source().results(policy, clock).take(2).toList()
        assertThat(results[0]).isEqualTo(CacheResult.Empty)
        assertThat(results[1]).isInstanceOf(CacheResult.Fresh::class.java)
        assertThat(fetches).isEqualTo(1)
    }

    @Test fun `Fresh ne revalide pas`() = runTest {
        cache().put("ns", "k", Doc("disk"), Doc.serializer())
        assertThat(source().results(policy, clock).first()).isInstanceOf(CacheResult.Fresh::class.java)
        assertThat(fetches).isEqualTo(0)
    }

    @Test fun `Stale sert la valeur puis revalide`() = runTest {
        cache().put("ns", "k", Doc("disk"), Doc.serializer())
        clock.now += 5_000
        val results = source().results(policy, clock).take(2).toList()
        assertThat(results[0]).isEqualTo(CacheResult.Stale(Doc("disk"), 5_000L))
        assertThat((results[1] as CacheResult.Fresh).value).isEqualTo(Doc("net"))
        assertThat(fetches).isEqualTo(1)
    }

    @Test fun `expire est Syncing avec la valeur`() = runTest {
        cache().put("ns", "k", Doc("disk"), Doc.serializer())
        clock.now += 50_000
        assertThat(source().results(policy, clock).first()).isEqualTo(CacheResult.Syncing(Doc("disk")))
    }

    @Test fun `un echec reseau conserve le cache`() = runTest {
        cache().put("ns", "k", Doc("disk"), Doc.serializer())
        clock.now += 5_000
        val errors = mutableListOf<Throwable>()
        val first = source { throw IOException("offline") }.results(policy, clock) { errors += it }.first()
        assertThat(first).isEqualTo(CacheResult.Stale(Doc("disk"), 5_000L))
        assertThat(cache().get("ns", "k", Doc.serializer())!!.value).isEqualTo(Doc("disk"))
    }

    @Test fun `une charge illisible donne Empty puis se repare`() = runTest {
        db.keyedJsonCacheDao().upsert(KeyedJsonCacheEntity("ns", "k", "{broken", clock.now))
        val results = source().results(policy, clock).take(2).toList()
        assertThat(results[0]).isEqualTo(CacheResult.Empty)
        assertThat((results[1] as CacheResult.Fresh).value).isEqualTo(Doc("net"))
    }

    @Test fun `deux espaces de noms sont isoles et se purgent seuls`() = runTest {
        cache().put("a", "k", Doc("A"), Doc.serializer())
        cache().put("b", "k", Doc("B"), Doc.serializer())
        cache().clearNamespace("a")
        assertThat(cache().get("a", "k", Doc.serializer())).isNull()
        assertThat(cache().get("b", "k", Doc.serializer())!!.value).isEqualTo(Doc("B"))
    }
}
