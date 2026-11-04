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

/**
 * `sqlcipher_export` recopie les lignes par `INSERT … SELECT` : les `rowid` implicites de `messages` sont renumérotés, et
 * l'index externe `message_fts` (indexé par ce `rowid`) pointerait de faux messages. Lui seul est retiré de la copie et
 * reconstruit à l'ouverture ; `conversation_fts`, autonome, traverse la migration et la recherche par titre reste servie.
 */
@RunWith(RobolectricTestRunner::class)
class SearchIndexAcrossExportTest {

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

    private fun message(id: String, text: String) = MessageEntity(
        id = id, conversationId = "c1", seq = null, payload = "{}", createdAt = 0L, cachedAt = 0L, contentText = text,
    )

    @Test
    fun `retirer l'index des messages garde l'index des conversations et la reouverture reconstruit le premier`() = runTest {
        db.conversationDao().upsertAll(listOf(ConversationEntity("c1", "{}", 1L, 1L)))
        dao.replaceConversation("c1", "famille", "marie")
        db.messageDao().upsertAll(listOf(message("m1", "rendez-vous demain")))
        val writable = db.openHelper.writableDatabase

        SearchIndexSchema.messageIndexDropStatements.forEach(writable::execSQL)
        SearchIndexSchema.ensure(writable)

        assertThat(dao.searchConversations("\"famille*\"", 50)).containsExactly("c1")
        assertThat(dao.searchConversations("\"marie*\"", 50)).containsExactly("c1")
        assertThat(dao.searchMessages("\"rendez*\"", 50).map { it.messageId }).containsExactly("m1")
    }

    @Test
    fun `seul l'index des messages et ses declencheurs sont retires`() {
        val dropped = SearchIndexSchema.messageIndexDropStatements.joinToString("\n")

        assertThat(dropped).contains(SearchIndexSchema.MESSAGE_TABLE)
        assertThat(dropped).doesNotContain(SearchIndexSchema.CONVERSATION_TABLE)
        assertThat(SearchIndexSchema.messageIndexDropStatements.last()).contains("DROP TABLE")
    }
}
