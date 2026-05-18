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

private fun messageRow(
    id: String,
    conversationId: String = "c1",
    createdAt: Long = 0L,
) = MessageEntity(
    id = id,
    conversationId = conversationId,
    seq = null,
    payload = "{}",
    createdAt = createdAt,
    cachedAt = 0L,
)

@RunWith(RobolectricTestRunner::class)
class MessageDaoTest {

    private lateinit var db: MeeshyDatabase
    private lateinit var dao: MessageDao

    @Before
    fun setUp() {
        db = Room.inMemoryDatabaseBuilder(
            ApplicationProvider.getApplicationContext(),
            MeeshyDatabase::class.java,
        ).allowMainThreadQueries().build()
        dao = db.messageDao()
    }

    @After
    fun tearDown() {
        db.close()
    }

    @Test
    fun `observeForConversation returns only that conversation, oldest first`() = runTest {
        dao.upsertAll(
            listOf(
                messageRow("a", "c1", createdAt = 300),
                messageRow("b", "c1", createdAt = 100),
                messageRow("c", "c2", createdAt = 200),
            ),
        )

        val rows = dao.observeForConversation("c1").first()

        assertThat(rows.map { it.id }).containsExactly("b", "a").inOrder()
    }

    @Test
    fun `upsertAll replaces a message by id`() = runTest {
        dao.upsertAll(listOf(messageRow("a", createdAt = 1)))
        dao.upsertAll(listOf(messageRow("a", createdAt = 999)))

        val rows = dao.observeForConversation("c1").first()

        assertThat(rows).hasSize(1)
        assertThat(rows.single().createdAt).isEqualTo(999)
    }

    @Test
    fun `deleteMissing prunes messages absent from the keep set`() = runTest {
        dao.upsertAll(listOf(messageRow("a"), messageRow("b"), messageRow("c")))

        dao.deleteMissing("c1", listOf("b"))

        assertThat(dao.observeForConversation("c1").first().map { it.id }).containsExactly("b")
    }

    @Test
    fun `clearConversation removes only that conversation`() = runTest {
        dao.upsertAll(listOf(messageRow("a", "c1"), messageRow("b", "c2")))

        dao.clearConversation("c1")

        assertThat(dao.observeForConversation("c1").first()).isEmpty()
        assertThat(dao.observeForConversation("c2").first().map { it.id }).containsExactly("b")
    }
}
