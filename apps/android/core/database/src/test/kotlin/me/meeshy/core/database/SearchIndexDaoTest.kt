package me.meeshy.core.database

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.core.database.dao.SearchIndexDao
import me.meeshy.core.database.entity.ConversationEntity
import me.meeshy.core.database.entity.MessageEntity
import me.meeshy.core.database.search.SearchIndexSchema
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

private fun message(
    id: String,
    text: String?,
    conversationId: String = "c1",
    createdAt: Long = 0L,
    deletedAt: Long? = null,
) = MessageEntity(
    id = id,
    conversationId = conversationId,
    seq = null,
    payload = "{}",
    createdAt = createdAt,
    cachedAt = 0L,
    contentText = text,
    deletedAt = deletedAt,
)

@RunWith(RobolectricTestRunner::class)
class SearchIndexDaoTest {

    private lateinit var db: MeeshyDatabase
    private lateinit var dao: SearchIndexDao

    @Before
    fun setUp() {
        db = Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext(), MeeshyDatabase::class.java)
            .addCallback(SearchIndexSchema.callback)
            .allowMainThreadQueries()
            .build()
        dao = SearchIndexDao(db)
    }

    @After
    fun tearDown() {
        db.close()
    }

    private suspend fun ids(match: String, limit: Int = 50) = dao.searchMessages(match, limit).map { it.messageId }

    @Test
    fun `un message insere est trouve par prefixe`() = runTest {
        db.messageDao().upsertAll(listOf(message("m1", "Bonjour tout le monde")))

        assertThat(ids("\"bonj*\"")).containsExactly("m1")
        assertThat(ids("\"absent*\"")).isEmpty()
    }

    @Test
    fun `l'accent et la casse sont replies a l'index`() = runTest {
        db.messageDao().upsertAll(listOf(message("m1", "Un été à l'ÉCOLE"), message("m2", "un café")))

        assertThat(ids("\"ete*\"")).containsExactly("m1")
        assertThat(ids("\"ecole*\"")).containsExactly("m1")
        assertThat(ids("\"cafe*\"")).containsExactly("m2")
    }

    @Test
    fun `l'edition remplace le texte indexe`() = runTest {
        db.messageDao().upsertAll(listOf(message("m1", "avant")))
        db.messageDao().upsertAll(listOf(message("m1", "apres")))

        assertThat(ids("\"avant*\"")).isEmpty()
        assertThat(ids("\"apres*\"")).containsExactly("m1")
    }

    @Test
    fun `un message supprime ou purge sort de l'index`() = runTest {
        db.messageDao().upsertAll(listOf(message("m1", "salut"), message("m2", "salut", conversationId = "c2")))

        db.messageDao().deleteByIds(listOf("m1"))
        assertThat(ids("\"salut*\"")).containsExactly("m2")

        db.messageDao().clearConversation("c2")
        assertThat(ids("\"salut*\"")).isEmpty()
    }

    @Test
    fun `un message sans texte indexable n'entre pas dans l'index`() = runTest {
        db.messageDao().upsertAll(listOf(message("m1", null), message("m2", "visible")))
        db.messageDao().upsertAll(listOf(message("m2", null)))

        assertThat(ids("\"visible*\"")).isEmpty()
    }

    @Test
    fun `un message marque supprime n'est jamais rendu`() = runTest {
        db.messageDao().upsertAll(listOf(message("m1", "salut", deletedAt = 5L)))

        assertThat(ids("\"salut*\"")).isEmpty()
    }

    @Test
    fun `les resultats sont les plus recents d'abord et bornes par la limite`() = runTest {
        db.messageDao().upsertAll((1..5).map { message("m$it", "salut", createdAt = it * 10L) })

        assertThat(ids("\"salut*\"", limit = 3)).containsExactly("m5", "m4", "m3").inOrder()
    }

    @Test
    fun `la deconnexion vide l'index`() = runTest {
        db.messageDao().upsertAll(listOf(message("m1", "salut")))
        db.conversationDao().upsertAll(listOf(ConversationEntity("c1", "{}", 1L, 1L)))
        dao.replaceConversation("c1", "famille", "")

        db.clearAllTables()

        assertThat(ids("\"salut*\"")).isEmpty()
        assertThat(dao.searchConversations("\"famille*\"", 50)).isEmpty()
    }

    @Test
    fun `l'index des conversations suit le remplacement et la suppression`() = runTest {
        db.conversationDao().upsertAll(
            listOf(ConversationEntity("c1", "{}", 1L, 1L), ConversationEntity("c2", "{}", 2L, 2L)),
        )
        dao.replaceConversation("c1", "equipe projet", "marie")
        dao.replaceConversation("c2", "equipe sport", "")

        assertThat(dao.searchConversations("\"equipe*\"", 50)).containsExactly("c2", "c1").inOrder()
        assertThat(dao.searchConversations("\"marie*\"", 50)).containsExactly("c1")

        dao.replaceConversation("c1", "famille", "")
        assertThat(dao.searchConversations("\"equipe*\"", 50)).containsExactly("c2")

        db.conversationDao().deleteByIds(listOf("c2"))
        assertThat(dao.searchConversations("\"equipe*\"", 50)).isEmpty()
    }

    @Test
    fun `reconstruire l'index le laisse identique`() = runTest {
        db.messageDao().upsertAll(listOf(message("m1", "salut")))

        dao.rebuildMessages()
        dao.rebuildMessages()

        assertThat(ids("\"salut*\"")).containsExactly("m1")
    }
}
