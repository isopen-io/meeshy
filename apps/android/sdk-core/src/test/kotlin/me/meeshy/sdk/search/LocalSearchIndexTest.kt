package me.meeshy.sdk.search

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.encodeToString
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.core.database.dao.SearchIndexDao
import me.meeshy.core.database.entity.ConversationEntity
import me.meeshy.core.database.entity.MessageEntity
import me.meeshy.core.database.search.SearchIndexSchema
import me.meeshy.sdk.conversation.MessageColumnBackfill
import me.meeshy.sdk.conversation.MessageEntityFactory
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiParticipant
import me.meeshy.sdk.net.MeeshyApi
import org.junit.After
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

private fun apiMessage(
    id: String,
    content: String,
    conversationId: String = "c1",
    createdAt: String = "2026-06-01T10:00:00Z",
) = ApiMessage(id = id, conversationId = conversationId, content = content, createdAt = createdAt)

@RunWith(RobolectricTestRunner::class)
class LocalSearchIndexTest {

    private val database: MeeshyDatabase = Room.inMemoryDatabaseBuilder(
        ApplicationProvider.getApplicationContext(),
        MeeshyDatabase::class.java,
    ).addCallback(SearchIndexSchema.callback).allowMainThreadQueries().build()

    private val index = LocalSearchIndex(SearchIndexDao(database))

    @After
    fun tearDown() {
        database.close()
    }

    private suspend fun cache(vararg messages: ApiMessage) {
        database.messageDao().upsertAll(messages.map { MessageEntityFactory.cached(it, cachedAt = 1L) })
    }

    private suspend fun found(query: String) = index.searchMessages(query).map { it.messageId }

    @Test
    fun `le repli d'accents est le meme a l'index et a la requete`() = runTest {
        cache(apiMessage("m1", "Le café de l'ÉCOLE"), apiMessage("m2", "Un bel été"))

        assertThat(found("cafe")).containsExactly("m1")
        assertThat(found("ÉCOLE")).containsExactly("m1")
        assertThat(found("ete")).containsExactly("m2")
        assertThat(found("café")).containsExactly("m1")
    }

    @Test
    fun `un message protege n'est jamais indexe en clair`() = runTest {
        cache(
            apiMessage("view", "secret").copy(isViewOnce = true),
            apiMessage("blur", "secret").copy(isBlurred = true),
            apiMessage("eph", "secret").copy(expiresAt = "2030-01-01T00:00:00Z"),
            apiMessage("enc", "AAEC").copy(isEncrypted = true),
            apiMessage("ok", "secret visible"),
        )

        assertThat(found("secret")).containsExactly("ok")
    }

    @Test
    fun `un message supprime sort de l'index et un message edite est reindexe`() = runTest {
        cache(apiMessage("m1", "avant"), apiMessage("m2", "bonjour"))

        cache(apiMessage("m1", "apres"), apiMessage("m2", "bonjour").copy(deletedAt = "2026-06-02T10:00:00Z"))

        assertThat(found("avant")).isEmpty()
        assertThat(found("apres")).containsExactly("m1")
        assertThat(found("bonjour")).isEmpty()
    }

    @Test
    fun `l'extrait est le texte original et les plus recents viennent d'abord`() = runTest {
        cache(
            apiMessage("old", "salut", createdAt = "2026-06-01T10:00:00Z"),
            apiMessage("new", "salut", createdAt = "2026-06-03T10:00:00Z"),
        )

        val hits = index.searchMessages("salut")

        assertThat(hits.map { it.messageId }).containsExactly("new", "old").inOrder()
        assertThat(hits.first().text).isEqualTo("salut")
    }

    @Test
    fun `une requete blanche ou faite d'operateurs ne trouve rien et ne casse rien`() = runTest {
        cache(apiMessage("m1", "salut"))

        assertThat(found("")).isEmpty()
        assertThat(found("* ( )")).isEmpty()
        assertThat(found("salut \"")).containsExactly("m1")
    }

    @Test
    fun `le rattrapage des lignes d'avant l'index les indexe une seule fois`() = runTest {
        val message = apiMessage("m1", "bonjour")
        database.messageDao().upsertAll(
            listOf(
                MessageEntity(
                    id = "m1",
                    conversationId = "c1",
                    seq = null,
                    payload = MeeshyApi.json.encodeToString(message),
                    createdAt = 10L,
                    cachedAt = 20L,
                ),
            ),
        )
        assertThat(found("bonjour")).isEmpty()

        val backfill = MessageColumnBackfill(database, database.messageDao())
        backfill.run()
        backfill.run()

        assertThat(found("bonjour")).containsExactly("m1")
    }

    @Test
    fun `les conversations se trouvent par titre ou par pair, replies et hors ligne`() = runTest {
        val team = ApiConversation(id = "c1", type = "group", title = "Équipe Été")
        val direct = ApiConversation(
            id = "c2",
            type = "direct",
            participants = listOf(ApiParticipant(id = "p1", userId = "u1", displayName = "Zoé Müller", username = "zoe")),
        )
        database.conversationDao().upsertAll(
            listOf(ConversationEntity("c1", "{}", 2L, 2L), ConversationEntity("c2", "{}", 1L, 1L)),
        )

        index.indexConversation(team)
        index.indexConversation(direct)

        assertThat(index.searchConversationIds("equipe ete")).containsExactly("c1")
        assertThat(index.searchConversationIds("zoe")).containsExactly("c2")
        assertThat(index.searchConversationIds("muller")).containsExactly("c2")
        assertThat(index.searchConversationIds("")).isEmpty()
    }

    @Test
    fun `purger une conversation retire ses messages de l'index`() = runTest {
        cache(apiMessage("m1", "salut", conversationId = "c1"), apiMessage("m2", "salut", conversationId = "c2"))

        database.messageDao().clearConversation("c1")

        assertThat(found("salut")).containsExactly("m2")
    }
}
