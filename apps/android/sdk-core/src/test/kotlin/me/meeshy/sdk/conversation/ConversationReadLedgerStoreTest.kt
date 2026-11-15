package me.meeshy.sdk.conversation

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.encodeToString
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.core.database.entity.ConversationEntity
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ConversationReadEvent
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.sync.UnreadLedger
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class ConversationReadLedgerStoreTest {

    private lateinit var db: MeeshyDatabase

    @Before
    fun setUp() {
        db = Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext(), MeeshyDatabase::class.java)
            .allowMainThreadQueries().build()
    }

    @After
    fun tearDown() = db.close()

    private fun store(ledger: UnreadLedger = UnreadLedger()) =
        ConversationReadLedgerStore(ledger, db, db.conversationDao())

    private suspend fun seed(id: String, unread: Int) {
        val conversation = ApiConversation(id = id, unreadCount = unread)
        db.conversationDao().upsertAll(
            listOf(
                ConversationEntity(
                    id = id,
                    payload = MeeshyApi.json.encodeToString(conversation),
                    updatedAt = 1L,
                    cachedAt = 1L,
                    unreadCount = unread,
                ),
            ),
        )
    }

    private suspend fun storedUnread(id: String): Int = db.conversationDao().find(id)!!.unreadCount

    private suspend fun payloadUnread(id: String): Int =
        MeeshyApi.json.decodeFromString<ApiConversation>(db.conversationDao().find(id)!!.payload).unreadCount

    @Test
    fun `un compteur servi se persiste dans unreadCount et dans la charge`() = runTest {
        seed("a", 0)
        store().apply(ConversationReadEvent.ServerUnread("a", 4))

        assertThat(storedUnread("a")).isEqualTo(4)
        assertThat(payloadUnread("a")).isEqualTo(4)
    }

    @Test
    fun `la conversation ouverte garde son compte en cache pendant l'affichage`() = runTest {
        seed("a", 3)
        val store = store()
        store.open("a")
        store.apply(ConversationReadEvent.ServerUnread("a", 5))

        assertThat(storedUnread("a")).isEqualTo(5)
    }

    @Test
    fun `marquer lu persiste zero`() = runTest {
        seed("a", 3)
        store().apply(ConversationReadEvent.LocalMarkRead("a"))

        assertThat(storedUnread("a")).isEqualTo(0)
    }

    @Test
    fun `deux fenetres - le reste note n'est rendu qu'a la derniere fermeture`() = runTest {
        seed("a", 75)
        val ledger = UnreadLedger()
        val store = store(ledger)
        store.apply(ConversationReadEvent.ServerUnread("a", 75))
        store.open("a")
        store.open("a")
        ledger.noteUnreadRemaining("a", 12)

        store.close("a")
        assertThat(storedUnread("a")).isEqualTo(75)
        store.close("a")
        assertThat(storedUnread("a")).isEqualTo(12)
    }

    @Test
    fun `le SUM SQL hors ouverte suit le registre`() = runTest {
        seed("a", 2)
        seed("b", 9)
        db.conversationDao().totalUnreadExcludingOpen(listOf("b")).test {
            assertThat(awaitItem()).isEqualTo(2)
            store().apply(ConversationReadEvent.ServerUnread("a", 6))
            assertThat(awaitItem()).isEqualTo(6)
            cancelAndIgnoreRemainingEvents()
        }
    }
}
