package me.meeshy.core.database

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import kotlinx.coroutines.flow.first
import me.meeshy.core.database.dao.TrackingLinksCacheDao
import me.meeshy.core.database.entity.TrackingLinksCacheEntity

private fun cached(key: String, payload: String = "[]", at: Long = 1) =
    TrackingLinksCacheEntity(cacheKey = key, payload = payload, cachedAt = at)

@RunWith(RobolectricTestRunner::class)
class TrackingLinksCacheDaoTest {

    private lateinit var db: MeeshyDatabase
    private lateinit var dao: TrackingLinksCacheDao

    @Before
    fun setUp() {
        db = Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext(), MeeshyDatabase::class.java)
            .allowMainThreadQueries().build()
        dao = db.trackingLinksCacheDao()
    }

    @After
    fun tearDown() {
        db.close()
    }

    @Test
    fun `upsert remplace la ligne d'une meme cle et observe emet la mise a jour`() = runTest {
        assertThat(dao.observe("acc").first()).isNull()

        dao.upsert(cached("acc", "[1]", at = 10))
        dao.upsert(cached("acc", "[1,2]", at = 20))

        assertThat(dao.observe("acc").first()).isEqualTo(cached("acc", "[1,2]", at = 20))
    }

    @Test
    fun `la lecture par cle ne rend rien pour un autre compte et garde l'anciennete`() = runTest {
        dao.upsert(cached("acc", at = 42))

        assertThat(dao.get("other")).isNull()
        assertThat(dao.get("acc")?.cachedAt).isEqualTo(42)
    }

    @Test
    fun `supprimer une cle ne touche pas les autres`() = runTest {
        dao.upsert(cached("acc"))
        dao.upsert(cached("other"))

        dao.deleteByKey("acc")

        assertThat(dao.get("acc")).isNull()
        assertThat(dao.get("other")).isNotNull()
    }
}
