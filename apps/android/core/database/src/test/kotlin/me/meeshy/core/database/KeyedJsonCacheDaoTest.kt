package me.meeshy.core.database

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.core.database.dao.KeyedJsonCacheDao
import me.meeshy.core.database.entity.KeyedJsonCacheEntity
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

private fun row(namespace: String, key: String, payload: String = "{}", at: Long = 1L) =
    KeyedJsonCacheEntity(namespace, key, payload, at)

@RunWith(RobolectricTestRunner::class)
class KeyedJsonCacheDaoTest {

    private lateinit var db: MeeshyDatabase
    private lateinit var dao: KeyedJsonCacheDao

    @Before
    fun setUp() {
        db = Room.inMemoryDatabaseBuilder(
            ApplicationProvider.getApplicationContext(),
            MeeshyDatabase::class.java,
        ).allowMainThreadQueries().build()
        dao = db.keyedJsonCacheDao()
    }

    @After
    fun tearDown() {
        db.close()
    }

    @Test
    fun `upsert remplace la ligne du meme couple espace de noms et cle`() = runTest {
        dao.upsert(row("community:list", "main", "{\"v\":1}", 1L))
        dao.upsert(row("community:list", "main", "{\"v\":2}", 2L))

        assertThat(dao.find("community:list", "main")).isEqualTo(row("community:list", "main", "{\"v\":2}", 2L))
    }

    @Test
    fun `observe emet null puis la ligne ecrite`() = runTest {
        dao.observe("ns", "k").test {
            assertThat(awaitItem()).isNull()
            dao.upsert(row("ns", "k", "{}", 5L))
            assertThat(awaitItem()?.fetchedAt).isEqualTo(5L)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `deux espaces de noms de meme cle sont isoles et deleteNamespace ne purge que le sien`() = runTest {
        dao.upsert(row("community:list", "k", "{\"a\":1}"))
        dao.upsert(row("participants:c1", "k", "{\"b\":2}"))

        dao.deleteNamespace("community:list")

        assertThat(dao.find("community:list", "k")).isNull()
        assertThat(dao.find("participants:c1", "k")?.payload).isEqualTo("{\"b\":2}")
    }

    @Test
    fun `delete ne retire que la cle visee`() = runTest {
        dao.upsert(row("ns", "k1"))
        dao.upsert(row("ns", "k2"))

        dao.delete("ns", "k1")

        assertThat(dao.find("ns", "k1")).isNull()
        assertThat(dao.find("ns", "k2")).isNotNull()
    }
}
