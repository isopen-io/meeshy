package me.meeshy.core.database

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import me.meeshy.core.database.dao.MessageDao
import me.meeshy.core.database.entity.MessageEntity
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

private fun row(id: String, at: Long, conversationId: String = "c1") =
    MessageEntity(id = id, conversationId = conversationId, seq = null, payload = "{}", createdAt = at, cachedAt = 0L)

@RunWith(RobolectricTestRunner::class)
class MessageWindowDaoTest {

    private lateinit var db: MeeshyDatabase
    private lateinit var dao: MessageDao

    @Before
    fun setUp() {
        db = Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext(), MeeshyDatabase::class.java)
            .allowMainThreadQueries().build()
        dao = db.messageDao()
    }

    @After
    fun tearDown() {
        db.close()
    }

    private suspend fun seed() = dao.upsertAll((1..10).map { row("m$it", it * 100L) } + row("other", 450L, "c2"))

    @Test
    fun `olderThan rend les plus proches de l ancre d abord, bornes strictes, un seul fil`() = runTest {
        seed()
        assertThat(dao.olderThan("c1", 500L, 3).map { it.id }).containsExactly("m4", "m3", "m2").inOrder()
        assertThat(dao.olderThan("c1", 100L, 3)).isEmpty()
    }

    @Test
    fun `newerThan rend les plus proches de l ancre d abord, bornes strictes, un seul fil`() = runTest {
        seed()
        assertThat(dao.newerThan("c1", 500L, 3).map { it.id }).containsExactly("m6", "m7", "m8").inOrder()
        assertThat(dao.newerThan("c1", 1_000L, 3)).isEmpty()
    }

    @Test
    fun `observeByIds ne rend que les ids demandes du fil, le plus recent d abord`() = runTest {
        seed()
        val rows = dao.observeByIds("c1", listOf("m2", "m7", "other", "absent")).first()
        assertThat(rows.map { it.id }).containsExactly("m7", "m2").inOrder()
    }
}
