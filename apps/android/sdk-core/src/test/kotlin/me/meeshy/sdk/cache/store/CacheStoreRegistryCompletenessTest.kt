package me.meeshy.sdk.cache.store

import com.google.common.truth.Truth.assertThat
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.test.runTest
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.sdk.cache.CacheResult
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class CacheStoreRegistryCompletenessTest {
    private lateinit var db: MeeshyDatabase
    private val clock = FakeClock()

    @Before fun setUp() { db = inMemoryDatabase() }

    @After fun tearDown() { db.close() }

    private fun registry() = CacheStoreRegistry(Dispatchers.Unconfined)

    private fun CacheStoreRegistry.store(namespace: String) =
        roomStore(db.cacheEntryDao(), namespace, TestPolicy, Row.serializer(), { it.id }, clock = clock)

    @Test fun `reset parcourt tous les stores inscrits`() = runTest {
        val registry = registry()
        val a = registry.store("a")
        val b = registry.store("b")
        a.save(listOf(Row("1")), "k")
        b.save(listOf(Row("2")), "k")

        registry.reset()

        assertThat(a.load("k")).isEqualTo(CacheResult.Empty)
        assertThat(b.load("k")).isEqualTo(CacheResult.Empty)
    }

    @Test fun `un store en echec n empeche pas le vidage des autres`() = runTest {
        val registry = registry()
        registry.register(object : CacheStoreHandle {
            override val namespace = "boom"
            override val criticality = CacheCriticality.CRITICAL
            override suspend fun clearAll() = error("boom")
        })
        val ok = registry.store("ok")
        ok.save(listOf(Row("1")), "k")

        registry.invalidateAll()

        assertThat(ok.load("k")).isEqualTo(CacheResult.Empty)
    }

    @Test fun `dropMemory lache les L1 sans toucher au disque`() = runTest {
        val registry = registry()
        val store = registry.store("a")
        store.save(listOf(Row("1")), "k")
        store.load("k")

        registry.dropMemory()

        assertThat(store.load("k")).isInstanceOf(CacheResult.Fresh::class.java)
    }

    @Test fun `un namespace present sur le disque sans store inscrit est detecte`() = runTest {
        val registry = registry()
        registry.store("known").save(listOf(Row("1")), "k")
        rowStore(db, clock, "rogue").save(listOf(Row("2")), "k")

        val onDisk = db.cacheEntryDao().namespaces().toSet()

        assertThat(onDisk - registry.namespaces()).containsExactly("rogue")
    }

    @Test fun `aucun code de production ne construit un RoomCacheStore hors de l inventaire`() {
        val root = generateSequence(File("").absoluteFile) { it.parentFile }
            .first { File(it, "sdk-core/src/main").isDirectory }
        val allowed = setOf("RoomCacheStore.kt", "CacheStoreRegistry.kt")
        val offenders = root.walkTopDown()
            .filter { it.isFile && it.extension == "kt" && "/src/main/" in it.invariantSeparatorsPath }
            .filter { it.name !in allowed }
            .filter { file -> file.useLines { lines -> lines.any { "RoomCacheStore(" in it || ": CacheStore<" in it } } }
            .map { it.name }
            .toList()

        assertThat(offenders).isEmpty()
    }
}
