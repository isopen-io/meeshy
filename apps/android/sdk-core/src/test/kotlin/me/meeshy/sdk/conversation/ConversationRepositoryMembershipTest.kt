package me.meeshy.sdk.conversation

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.encodeToString
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.core.database.entity.ConversationEntity
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.net.SessionTransitionFlags
import me.meeshy.sdk.net.api.ConversationApi
import me.meeshy.sdk.outbox.OutboxOwnerSource
import me.meeshy.sdk.outbox.OutboxRepository
import me.meeshy.sdk.session.AccountFence
import me.meeshy.sdk.session.withAccountTicket
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** #13795 — l'effectif d'une ligne du cache suit une adhésion ou un débannissement, sans relecture de la liste. */
@RunWith(RobolectricTestRunner::class)
class ConversationRepositoryMembershipTest {

    private lateinit var db: MeeshyDatabase
    private var owner: String? = "A"
    private val fence = AccountFence(OutboxOwnerSource { owner }, SessionTransitionFlags())

    @Before
    fun setUp() {
        db = Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext(), MeeshyDatabase::class.java)
            .allowMainThreadQueries()
            .build()
    }

    @After
    fun tearDown() = db.close()

    private fun repository() = ConversationRepository(
        mockk<ConversationApi>(), db, db.conversationDao(), db.syncMetaDao(), OutboxRepository(db, db.outboxDao()), fence = fence,
    )

    private suspend fun cache(conversation: ApiConversation) = db.conversationDao().upsertAll(
        listOf(
            ConversationEntity(
                id = conversation.id,
                payload = MeeshyApi.json.encodeToString(conversation),
                updatedAt = 1L,
                cachedAt = 1L,
                unreadCount = 0,
            ),
        ),
    )

    @Test
    fun `l'effectif absolu du serveur est pose sur la ligne connue`() = runTest {
        cache(ApiConversation(id = "c1", serverMemberCount = 3))

        val applied = repository().applyMembership("c1", absolute = 9, absoluteCapped = null, delta = +1)

        assertThat(applied).isTrue()
        assertThat(repository().cachedById("c1")?.memberCount).isEqualTo(9)
    }

    @Test
    fun `sans absolu le delta de repli joue sur l'effectif en cache`() = runTest {
        cache(ApiConversation(id = "c1", serverMemberCount = 3))

        repository().applyMembership("c1", absolute = null, absoluteCapped = null, delta = +1)

        assertThat(repository().cachedById("c1")?.memberCount).isEqualTo(4)
    }

    @Test
    fun `le plafond servi se pose avec l'absolu`() = runTest {
        cache(ApiConversation(id = "c1", serverMemberCount = 150))

        repository().applyMembership("c1", absolute = 199, absoluteCapped = true, delta = +1)

        val row = repository().cachedById("c1")
        assertThat(row?.memberCount).isEqualTo(199)
        assertThat(row?.memberCountCapped).isTrue()
    }

    @Test
    fun `une conversation inconnue ne fabrique aucune ligne`() = runTest {
        val applied = repository().applyMembership("ghost", absolute = 9, absoluteCapped = null, delta = +1)

        assertThat(applied).isFalse()
        assertThat(db.conversationDao().find("ghost")).isNull()
    }

    @Test
    fun `un evenement arrive sous A ne reecrit rien une fois B connecte`() = runTest {
        cache(ApiConversation(id = "c1", serverMemberCount = 3))
        val repository = repository()
        val arrivedUnderA = fence.ticket()
        owner = "B"

        val applied = withAccountTicket(arrivedUnderA) {
            repository.applyMembership("c1", absolute = 9, absoluteCapped = null, delta = +1)
        }

        assertThat(applied).isFalse()
        assertThat(repository.cachedById("c1")?.memberCount).isEqualTo(3)
    }
}
