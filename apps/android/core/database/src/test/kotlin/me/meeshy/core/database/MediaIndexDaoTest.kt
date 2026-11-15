package me.meeshy.core.database

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import me.meeshy.core.database.entity.MediaIndexEntity
import org.junit.After
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

private fun media(id: String, conversationId: String = "conv1", kind: String = "image", messageId: String = "m1", createdAt: Long = 1L) =
    MediaIndexEntity(id, conversationId, kind, messageId, createdAt, "{}")

@RunWith(RobolectricTestRunner::class)
class MediaIndexDaoTest {

    private val db: MeeshyDatabase by lazy {
        Room.inMemoryDatabaseBuilder(
            ApplicationProvider.getApplicationContext(),
            MeeshyDatabase::class.java,
        ).allowMainThreadQueries().build()
    }
    private val dao by lazy { db.mediaIndexDao() }

    @After
    fun tearDown() = db.close()

    @Test
    fun `l'index est filtre par conversation et genre, le plus recent d'abord`() = runTest {
        dao.upsertAll(
            listOf(
                media("old", createdAt = 1L),
                media("new", createdAt = 9L),
                media("video", kind = "video"),
                media("other", conversationId = "conv2"),
            ),
        )

        assertThat(dao.observe("conv1", "image").first().map { it.attachmentId }).containsExactly("new", "old").inOrder()
    }

    @Test
    fun `deleteForMessage retire les medias d'un message`() = runTest {
        dao.upsertAll(listOf(media("a", messageId = "m1"), media("b", messageId = "m2")))

        dao.deleteForMessage("m1")

        assertThat(dao.list("conv1", "image").map { it.attachmentId }).containsExactly("b")
    }

    @Test
    fun `deleteForConversation vide la conversation`() = runTest {
        dao.upsertAll(listOf(media("a"), media("b", conversationId = "conv2")))

        dao.deleteForConversation("conv1")

        assertThat(dao.list("conv1", "image")).isEmpty()
        assertThat(dao.list("conv2", "image")).hasSize(1)
    }
}
