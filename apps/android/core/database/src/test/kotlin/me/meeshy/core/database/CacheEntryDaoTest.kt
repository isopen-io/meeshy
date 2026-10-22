package me.meeshy.core.database

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import me.meeshy.core.database.dao.CacheEntryDao
import me.meeshy.core.database.entity.CacheEntryEntity
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

private fun entry(
    itemId: String,
    position: Int,
    namespace: String = "community:list",
    key: String = "main",
    hash: String = "h$itemId",
    payload: String = "{\"id\":\"$itemId\"}",
) = CacheEntryEntity(namespace, key, itemId, position, hash, lastFetchedAt = 10L, payload = payload)

private fun meta(namespace: String = "community:list", key: String = "main", at: Long = 10L, cursor: String = "") =
    CacheEntryEntity(namespace, key, CacheEntryEntity.META_ITEM_ID, CacheEntryEntity.META_POSITION, "", at, cursor)

@RunWith(RobolectricTestRunner::class)
class CacheEntryDaoTest {

    private lateinit var db: MeeshyDatabase
    private lateinit var dao: CacheEntryDao

    @Before
    fun setUp() {
        db = Room.inMemoryDatabaseBuilder(
            ApplicationProvider.getApplicationContext(),
            MeeshyDatabase::class.java,
        ).allowMainThreadQueries().build()
        dao = db.cacheEntryDao()
    }

    @After
    fun tearDown() {
        db.close()
    }

    @Test
    fun `les items se relisent dans l'ordre des positions sans la ligne de metadonnees`() = runTest {
        dao.apply("community:list", "main", emptyList(), listOf(entry("b", 1), entry("a", 0)), emptyMap(), meta())

        assertThat(dao.items("community:list", "main").map { it.itemId }).containsExactly("a", "b").inOrder()
        assertThat(dao.meta("community:list", "main")?.lastFetchedAt).isEqualTo(10L)
    }

    @Test
    fun `une liste synchronisee mais vide garde sa ligne de metadonnees`() = runTest {
        dao.apply("community:list", "main", emptyList(), emptyList(), emptyMap(), meta())

        assertThat(dao.items("community:list", "main")).isEmpty()
        assertThat(dao.meta("community:list", "main")).isNotNull()
        assertThat(dao.meta("community:list", "autre")).isNull()
    }

    @Test
    fun `l'ecriture differentielle supprime, deplace et reecrit sans toucher le reste`() = runTest {
        dao.apply("ns", "k", emptyList(), listOf(entry("a", 0, "ns", "k"), entry("b", 1, "ns", "k"), entry("c", 2, "ns", "k")), emptyMap(), meta("ns", "k"))

        dao.apply(
            "ns", "k",
            deletes = listOf("a"),
            upserts = listOf(entry("c", 1, "ns", "k", hash = "neuf", payload = "{\"id\":\"c\",\"v\":2}")),
            moves = mapOf("b" to 0),
            meta = meta("ns", "k", at = 99L),
        )

        val rows = dao.items("ns", "k")
        assertThat(rows.map { it.itemId }).containsExactly("b", "c").inOrder()
        assertThat(rows.last().contentHash).isEqualTo("neuf")
        assertThat(rows.last().payload).contains("\"v\":2")
        assertThat(dao.meta("ns", "k")?.lastFetchedAt).isEqualTo(99L)
        assertThat(dao.index("ns", "k").map { it.itemId to it.position }).containsExactly("b" to 0, "c" to 1)
    }

    @Test
    fun `la suppression de milliers d'ids reste sous la limite de variables SQLite`() = runTest {
        val rows = (0 until 1_200).map { entry("i$it", it) }
        dao.apply("community:list", "main", emptyList(), rows, emptyMap(), meta())

        dao.apply("community:list", "main", rows.map { it.itemId }, emptyList(), emptyMap(), null)

        assertThat(dao.items("community:list", "main")).isEmpty()
    }

    @Test
    fun `deux espaces de noms ne s'ecrasent jamais et se purgent separement`() = runTest {
        dao.apply("community:list", "x", emptyList(), listOf(entry("a", 0, "community:list", "x")), emptyMap(), meta("community:list", "x"))
        dao.apply("participants:c1", "x", emptyList(), listOf(entry("a", 0, "participants:c1", "x", payload = "{\"p\":1}")), emptyMap(), meta("participants:c1", "x"))

        dao.deleteNamespace("community:list")

        assertThat(dao.items("community:list", "x")).isEmpty()
        assertThat(dao.meta("community:list", "x")).isNull()
        assertThat(dao.items("participants:c1", "x").map { it.payload }).containsExactly("{\"p\":1}")
    }

    @Test
    fun `deleteKey ne vide que la cle visee`() = runTest {
        dao.apply("ns", "k1", emptyList(), listOf(entry("a", 0, "ns", "k1")), emptyMap(), meta("ns", "k1"))
        dao.apply("ns", "k2", emptyList(), listOf(entry("a", 0, "ns", "k2")), emptyMap(), meta("ns", "k2"))

        dao.deleteKey("ns", "k1")

        assertThat(dao.items("ns", "k1")).isEmpty()
        assertThat(dao.items("ns", "k2")).hasSize(1)
        assertThat(dao.itemCount("ns")).isEqualTo(1)
    }

    @Test
    fun `observeItems emet la liste courante`() = runTest {
        dao.apply("ns", "k", emptyList(), listOf(entry("a", 0, "ns", "k")), emptyMap(), meta("ns", "k"))

        assertThat(dao.observeItems("ns", "k").first().map { it.itemId }).containsExactly("a")
        assertThat(dao.observeMeta("ns", "k").first()).isNotNull()
    }
}
