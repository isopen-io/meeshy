package me.meeshy.sdk.conversation

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.decodeFromString
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiConversationPreferences
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.Pagination
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.net.api.ConversationApi
import me.meeshy.sdk.outbox.OutboxRepository
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import retrofit2.Response

/**
 * #19425 — un geste de préférence encore en file (épingle, sourdine, archive, nom, catégorie) n'a aucune surcouche
 * tant qu'il attend son envoi : une ligne servie avant l'envoi ne le défait pas à l'écran. Il se rejoue sur toute
 * ligne servie jusqu'à son accusé ou son épuisement.
 */
@RunWith(RobolectricTestRunner::class)
class ConversationCacheSourcePendingPrefsTest {

    private lateinit var db: MeeshyDatabase

    @Before
    fun setUp() {
        db = Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext(), MeeshyDatabase::class.java)
            .allowMainThreadQueries()
            .build()
    }

    @After
    fun tearDown() = db.close()

    private fun served(preferences: ApiConversationPreferences = ApiConversationPreferences()) =
        ApiConversation(id = "c1", type = "group", title = "Groupe", updatedAt = T1, preferences = preferences)

    private fun page(vararg rows: ApiConversation) = Response.success(
        ApiResponse(success = true, data = rows.toList(), pagination = Pagination(total = rows.size, offset = 0, limit = 100, hasMore = false)),
    )

    private fun repository(api: ConversationApi) = ConversationRepository(
        conversationApi = api,
        database = db,
        conversationDao = db.conversationDao(),
        syncMetaDao = db.syncMetaDao(),
        outboxRepository = OutboxRepository(db, db.outboxDao()),
    )

    private suspend fun cachedPrefs(): ApiConversationPreferences? =
        db.conversationDao().find("c1")
            ?.let { MeeshyApi.json.decodeFromString<ApiConversation>(it.payload).resolvedPreferences }

    @Test
    fun `a pin queued offline survives a served sweep that still says unpinned`() = runTest {
        val api = mockk<ConversationApi>()
        coEvery { api.listConditional(any(), any(), any(), any()) } returns page(served())
        val repository = repository(api)
        repository.syncSilently()
        repository.setPinnedOptimistic("c1", true)

        repository.syncSilently()

        assertThat(cachedPrefs()!!.isPinned).isTrue()
    }

    @Test
    fun `a queued rename and a queued mute both survive the sweep`() = runTest {
        val api = mockk<ConversationApi>()
        coEvery { api.listConditional(any(), any(), any(), any()) } returns page(served())
        val repository = repository(api)
        repository.syncSilently()
        repository.setCustomNameOptimistic("c1", "Famille")
        repository.setMutedOptimistic("c1", true)

        repository.syncSilently()

        assertThat(cachedPrefs()!!.customName).isEqualTo("Famille")
        assertThat(cachedPrefs()!!.isMuted).isTrue()
    }

    @Test
    fun `a queued removal from its category survives the sweep`() = runTest {
        val api = mockk<ConversationApi>()
        coEvery { api.listConditional(any(), any(), any(), any()) } returns page(served(ApiConversationPreferences(categoryId = "cat")))
        val repository = repository(api)
        repository.syncSilently()
        repository.setCategoryOptimistic("c1", null)

        repository.syncSilently()

        assertThat(cachedPrefs()!!.categoryId).isNull()
    }

    @Test
    fun `a gesture the queue gave up on returns to the served state`() = runTest {
        val api = mockk<ConversationApi>()
        coEvery { api.listConditional(any(), any(), any(), any()) } returns page(served())
        val repository = repository(api)
        repository.syncSilently()
        repository.setPinnedOptimistic("c1", true)
        val row = db.outboxDao().byKind("UPDATE_CONVERSATION_PREFS").single()
        db.outboxDao().updateState(row.cmid, "EXHAUSTED", row.attempts, 1L)

        repository.syncSilently()

        assertThat(cachedPrefs()!!.isPinned).isFalse()
    }

    @Test
    fun `a conversation with nothing queued takes the served preferences as before`() = runTest {
        val api = mockk<ConversationApi>()
        coEvery { api.listConditional(any(), any(), any(), any()) } returns page(served())
        val repository = repository(api)
        repository.syncSilently()
        coEvery { api.listConditional(any(), any(), any(), any()) } returns page(served(ApiConversationPreferences(isPinned = true)))

        repository.syncSilently()

        assertThat(cachedPrefs()!!.isPinned).isTrue()
    }

    private companion object {
        const val T1 = "2023-11-14T20:00:00.000Z"
    }
}
