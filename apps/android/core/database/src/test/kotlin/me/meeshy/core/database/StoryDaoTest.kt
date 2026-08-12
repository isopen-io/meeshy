package me.meeshy.core.database

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import me.meeshy.core.database.dao.StoryDao
import me.meeshy.core.database.entity.StoryEntity
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

private fun story(id: String, createdAt: Long) =
    StoryEntity(id = id, payload = "{}", createdAt = createdAt, cachedAt = 0L)

@RunWith(RobolectricTestRunner::class)
class StoryDaoTest {

    private lateinit var db: MeeshyDatabase
    private lateinit var dao: StoryDao

    @Before
    fun setUp() {
        db = Room.inMemoryDatabaseBuilder(
            ApplicationProvider.getApplicationContext(),
            MeeshyDatabase::class.java,
        ).allowMainThreadQueries().build()
        dao = db.storyDao()
    }

    @After
    fun tearDown() {
        db.close()
    }

    @Test
    fun `observeAll returns rows sorted by createdAt descending`() = runTest {
        dao.upsertAll(listOf(story("a", 100), story("b", 300), story("c", 200)))

        val rows = dao.observeAll().first()

        assertThat(rows.map { it.id }).containsExactly("b", "c", "a").inOrder()
    }

    @Test
    fun `observeAll is empty on a cold table`() = runTest {
        assertThat(dao.observeAll().first()).isEmpty()
    }

    @Test
    fun `upsertAll replaces an existing row by primary key`() = runTest {
        dao.upsertAll(listOf(story("a", 100)))
        dao.upsertAll(listOf(story("a", 999)))

        val rows = dao.observeAll().first()

        assertThat(rows).hasSize(1)
        assertThat(rows.single().createdAt).isEqualTo(999)
    }

    @Test
    fun `deleteNotIn removes rows absent from the keep set`() = runTest {
        dao.upsertAll(listOf(story("a", 1), story("b", 2), story("c", 3)))

        dao.deleteNotIn(listOf("b"))

        assertThat(dao.observeAll().first().map { it.id }).containsExactly("b")
    }

    @Test
    fun `clear empties the table`() = runTest {
        dao.upsertAll(listOf(story("a", 1), story("b", 2)))

        dao.clear()

        assertThat(dao.observeAll().first()).isEmpty()
    }
}
