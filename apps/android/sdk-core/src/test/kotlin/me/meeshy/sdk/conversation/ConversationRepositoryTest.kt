package me.meeshy.sdk.conversation

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.CreateConversationRequest
import me.meeshy.sdk.net.api.ConversationApi
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxLanes
import me.meeshy.sdk.outbox.OutboxRepository
import me.meeshy.sdk.outbox.kindEnum
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

private class FakeConversationApi(
    var response: ApiResponse<List<ApiConversation>>,
) : ConversationApi {
    override suspend fun list(offset: Int?, limit: Int?) = response
    override suspend fun search(query: String) = ApiResponse<List<ApiConversation>>(success = false)
    override suspend fun getById(id: String) = ApiResponse<ApiConversation>(success = false)
    override suspend fun create(body: CreateConversationRequest) =
        ApiResponse<ApiConversation>(success = false)
    override suspend fun markRead(id: String) = ApiResponse(success = true, data = Unit)
    override suspend fun markUnread(id: String) = ApiResponse(success = true, data = Unit)
    override suspend fun updatePreferences(
        id: String,
        body: me.meeshy.sdk.net.api.ConversationPreferencesUpdate,
    ) = ApiResponse(success = true, data = Unit)

    override suspend fun updateSettings(
        id: String,
        body: me.meeshy.sdk.model.UpdateConversationSettingsRequest,
    ) = ApiResponse<me.meeshy.sdk.model.UpdateConversationResponse>(success = false)

    override suspend fun leave(id: String) = ApiResponse(success = true, data = Unit)
    override suspend fun deleteForMe(id: String) = ApiResponse(success = true, data = Unit)
    override suspend fun deleteForAll(id: String) = ApiResponse(success = true, data = Unit)
}

private class RecordingSettingsApi(
    private val response: ApiResponse<me.meeshy.sdk.model.UpdateConversationResponse>,
) : ConversationApi {
    var lastId: String? = null
    var lastBody: me.meeshy.sdk.model.UpdateConversationSettingsRequest? = null

    override suspend fun list(offset: Int?, limit: Int?) =
        ApiResponse<List<ApiConversation>>(success = false)
    override suspend fun search(query: String) = ApiResponse<List<ApiConversation>>(success = false)
    override suspend fun getById(id: String) = ApiResponse<ApiConversation>(success = false)
    override suspend fun create(body: CreateConversationRequest) =
        ApiResponse<ApiConversation>(success = false)
    override suspend fun markRead(id: String) = ApiResponse(success = true, data = Unit)
    override suspend fun markUnread(id: String) = ApiResponse(success = true, data = Unit)
    override suspend fun updatePreferences(
        id: String,
        body: me.meeshy.sdk.net.api.ConversationPreferencesUpdate,
    ) = ApiResponse(success = true, data = Unit)
    override suspend fun updateSettings(
        id: String,
        body: me.meeshy.sdk.model.UpdateConversationSettingsRequest,
    ): ApiResponse<me.meeshy.sdk.model.UpdateConversationResponse> {
        lastId = id
        lastBody = body
        return response
    }
    override suspend fun leave(id: String) = ApiResponse(success = true, data = Unit)
    override suspend fun deleteForMe(id: String) = ApiResponse(success = true, data = Unit)
    override suspend fun deleteForAll(id: String) = ApiResponse(success = true, data = Unit)
}

private class RecordingLeaveApi(
    private val response: ApiResponse<Unit>,
) : ConversationApi {
    var lastId: String? = null

    override suspend fun list(offset: Int?, limit: Int?) =
        ApiResponse<List<ApiConversation>>(success = false)
    override suspend fun search(query: String) = ApiResponse<List<ApiConversation>>(success = false)
    override suspend fun getById(id: String) = ApiResponse<ApiConversation>(success = false)
    override suspend fun create(body: CreateConversationRequest) =
        ApiResponse<ApiConversation>(success = false)
    override suspend fun markRead(id: String) = ApiResponse(success = true, data = Unit)
    override suspend fun markUnread(id: String) = ApiResponse(success = true, data = Unit)
    override suspend fun updatePreferences(
        id: String,
        body: me.meeshy.sdk.net.api.ConversationPreferencesUpdate,
    ) = ApiResponse(success = true, data = Unit)
    override suspend fun updateSettings(
        id: String,
        body: me.meeshy.sdk.model.UpdateConversationSettingsRequest,
    ) = ApiResponse<me.meeshy.sdk.model.UpdateConversationResponse>(success = false)
    override suspend fun leave(id: String): ApiResponse<Unit> {
        lastId = id
        return response
    }
    override suspend fun deleteForMe(id: String) = ApiResponse(success = true, data = Unit)
    override suspend fun deleteForAll(id: String) = ApiResponse(success = true, data = Unit)
}

private class RecordingDeleteForMeApi(
    private val response: ApiResponse<Unit>,
) : ConversationApi {
    var lastId: String? = null

    override suspend fun list(offset: Int?, limit: Int?) =
        ApiResponse<List<ApiConversation>>(success = false)
    override suspend fun search(query: String) = ApiResponse<List<ApiConversation>>(success = false)
    override suspend fun getById(id: String) = ApiResponse<ApiConversation>(success = false)
    override suspend fun create(body: CreateConversationRequest) =
        ApiResponse<ApiConversation>(success = false)
    override suspend fun markRead(id: String) = ApiResponse(success = true, data = Unit)
    override suspend fun markUnread(id: String) = ApiResponse(success = true, data = Unit)
    override suspend fun updatePreferences(
        id: String,
        body: me.meeshy.sdk.net.api.ConversationPreferencesUpdate,
    ) = ApiResponse(success = true, data = Unit)
    override suspend fun updateSettings(
        id: String,
        body: me.meeshy.sdk.model.UpdateConversationSettingsRequest,
    ) = ApiResponse<me.meeshy.sdk.model.UpdateConversationResponse>(success = false)
    override suspend fun leave(id: String) = ApiResponse<Unit>(success = false)
    override suspend fun deleteForMe(id: String): ApiResponse<Unit> {
        lastId = id
        return response
    }
    override suspend fun deleteForAll(id: String) = ApiResponse<Unit>(success = false)
}

private class RecordingDeleteForAllApi(
    private val response: ApiResponse<Unit>,
) : ConversationApi {
    var lastId: String? = null

    override suspend fun list(offset: Int?, limit: Int?) =
        ApiResponse<List<ApiConversation>>(success = false)
    override suspend fun search(query: String) = ApiResponse<List<ApiConversation>>(success = false)
    override suspend fun getById(id: String) = ApiResponse<ApiConversation>(success = false)
    override suspend fun create(body: CreateConversationRequest) =
        ApiResponse<ApiConversation>(success = false)
    override suspend fun markRead(id: String) = ApiResponse(success = true, data = Unit)
    override suspend fun markUnread(id: String) = ApiResponse(success = true, data = Unit)
    override suspend fun updatePreferences(
        id: String,
        body: me.meeshy.sdk.net.api.ConversationPreferencesUpdate,
    ) = ApiResponse(success = true, data = Unit)
    override suspend fun updateSettings(
        id: String,
        body: me.meeshy.sdk.model.UpdateConversationSettingsRequest,
    ) = ApiResponse<me.meeshy.sdk.model.UpdateConversationResponse>(success = false)
    override suspend fun leave(id: String) = ApiResponse<Unit>(success = false)
    override suspend fun deleteForMe(id: String) = ApiResponse<Unit>(success = false)
    override suspend fun deleteForAll(id: String): ApiResponse<Unit> {
        lastId = id
        return response
    }
}

@RunWith(RobolectricTestRunner::class)
class ConversationRepositoryTest {

    private lateinit var db: MeeshyDatabase

    @Before
    fun setUp() {
        db = Room.inMemoryDatabaseBuilder(
            ApplicationProvider.getApplicationContext(),
            MeeshyDatabase::class.java,
        ).allowMainThreadQueries().build()
    }

    @After
    fun tearDown() {
        db.close()
    }

    private fun repository(api: ConversationApi) =
        ConversationRepository(
            api,
            db,
            db.conversationDao(),
            db.syncMetaDao(),
            OutboxRepository(db, db.outboxDao()),
        )

    @Test
    fun `markReadOptimistic zeroes the cached unread count and queues a READ_RECEIPT`() = runTest {
        val repo = repository(
            FakeConversationApi(
                ApiResponse(
                    success = true,
                    data = listOf(ApiConversation(id = "c1", title = "Team", unreadCount = 4)),
                ),
            ),
        )
        repo.refresh()

        val applied = repo.markReadOptimistic("c1")

        assertThat(applied).isTrue()
        assertThat(repo.conversationStream("c1").first()?.unreadCount).isEqualTo(0)
        val row = OutboxRepository(db, db.outboxDao()).deliverable(OutboxLanes.READ_RECEIPT).single()
        assertThat(row.targetId).isEqualTo("c1")
        assertThat(row.kindEnum).isEqualTo(OutboxKind.READ_RECEIPT)
    }

    @Test
    fun `markReadOptimistic is a no-op when the conversation is already read`() = runTest {
        val repo = repository(
            FakeConversationApi(
                ApiResponse(
                    success = true,
                    data = listOf(ApiConversation(id = "c1", title = "Team", unreadCount = 0)),
                ),
            ),
        )
        repo.refresh()

        val applied = repo.markReadOptimistic("c1")

        assertThat(applied).isFalse()
        assertThat(OutboxRepository(db, db.outboxDao()).deliverable(OutboxLanes.READ_RECEIPT)).isEmpty()
    }

    @Test
    fun `markUnreadOptimistic hints an unread count of 1 and queues a MARK_UNREAD`() = runTest {
        val repo = repository(
            FakeConversationApi(
                ApiResponse(
                    success = true,
                    data = listOf(ApiConversation(id = "c1", title = "Team", unreadCount = 0)),
                ),
            ),
        )
        repo.refresh()

        val applied = repo.markUnreadOptimistic("c1")

        assertThat(applied).isTrue()
        assertThat(repo.conversationStream("c1").first()?.unreadCount).isEqualTo(1)
        val row = OutboxRepository(db, db.outboxDao()).deliverable(OutboxLanes.READ_RECEIPT).single()
        assertThat(row.targetId).isEqualTo("c1")
        assertThat(row.kindEnum).isEqualTo(OutboxKind.MARK_UNREAD)
    }

    @Test
    fun `markUnreadOptimistic is a no-op when the conversation is already unread`() = runTest {
        val repo = repository(
            FakeConversationApi(
                ApiResponse(
                    success = true,
                    data = listOf(ApiConversation(id = "c1", title = "Team", unreadCount = 4)),
                ),
            ),
        )
        repo.refresh()

        val applied = repo.markUnreadOptimistic("c1")

        assertThat(applied).isFalse()
        assertThat(repo.conversationStream("c1").first()?.unreadCount).isEqualTo(4)
        assertThat(OutboxRepository(db, db.outboxDao()).deliverable(OutboxLanes.READ_RECEIPT)).isEmpty()
    }

    @Test
    fun `markUnreadOptimistic returns false for an unknown conversation id`() = runTest {
        val repo = repository(
            FakeConversationApi(ApiResponse(success = true, data = emptyList())),
        )
        repo.refresh()

        val applied = repo.markUnreadOptimistic("missing")

        assertThat(applied).isFalse()
        assertThat(OutboxRepository(db, db.outboxDao()).deliverable(OutboxLanes.READ_RECEIPT)).isEmpty()
    }

    @Test
    fun `setPinnedOptimistic flips the cached pref and queues a snapshot mutation`() = runTest {
        val repo = repository(
            FakeConversationApi(
                ApiResponse(
                    success = true,
                    data = listOf(ApiConversation(id = "c1", title = "Team")),
                ),
            ),
        )
        repo.refresh()

        val applied = repo.setPinnedOptimistic("c1", true)

        assertThat(applied).isTrue()
        assertThat(repo.conversationStream("c1").first()?.preferences?.isPinned).isTrue()
        val row = OutboxRepository(db, db.outboxDao())
            .deliverable(OutboxLanes.CONVERSATION_PREFS).single()
        assertThat(row.targetId).isEqualTo("c1")
        assertThat(row.kindEnum).isEqualTo(OutboxKind.UPDATE_CONVERSATION_PREFS)
    }

    @Test
    fun `setPinnedOptimistic is a no-op when the pref is already in the target state`() = runTest {
        val repo = repository(
            FakeConversationApi(
                ApiResponse(success = true, data = listOf(ApiConversation(id = "c1"))),
            ),
        )
        repo.refresh()

        val applied = repo.setPinnedOptimistic("c1", false)

        assertThat(applied).isFalse()
        assertThat(OutboxRepository(db, db.outboxDao()).deliverable(OutboxLanes.CONVERSATION_PREFS))
            .isEmpty()
    }

    @Test
    fun `successive pref mutations coalesce into one latest-wins snapshot`() = runTest {
        val repo = repository(
            FakeConversationApi(
                ApiResponse(success = true, data = listOf(ApiConversation(id = "c1"))),
            ),
        )
        repo.refresh()

        repo.setPinnedOptimistic("c1", true)
        repo.setMutedOptimistic("c1", true)

        val rows = OutboxRepository(db, db.outboxDao()).deliverable(OutboxLanes.CONVERSATION_PREFS)
        assertThat(rows).hasSize(1)
        val payload = me.meeshy.sdk.net.MeeshyApi.json
            .decodeFromString<me.meeshy.sdk.outbox.ConversationPrefsPayload>(rows.single().payload)
        assertThat(payload.isPinned).isTrue()
        assertThat(payload.isMuted).isTrue()
        val cached = repo.conversationStream("c1").first()?.preferences
        assertThat(cached?.isPinned).isTrue()
        assertThat(cached?.isMuted).isTrue()
    }

    @Test
    fun `setMentionsOnlyOptimistic flips the cached pref and queues a snapshot`() = runTest {
        val repo = repository(
            FakeConversationApi(
                ApiResponse(success = true, data = listOf(ApiConversation(id = "c1", title = "Team"))),
            ),
        )
        repo.refresh()

        val applied = repo.setMentionsOnlyOptimistic("c1", true)

        assertThat(applied).isTrue()
        assertThat(repo.conversationStream("c1").first()?.preferences?.mentionsOnly).isTrue()
        val row = OutboxRepository(db, db.outboxDao())
            .deliverable(OutboxLanes.CONVERSATION_PREFS).single()
        assertThat(row.targetId).isEqualTo("c1")
        assertThat(row.kindEnum).isEqualTo(OutboxKind.UPDATE_CONVERSATION_PREFS)
    }

    @Test
    fun `setMentionsOnlyOptimistic is a no-op when the pref is already in the target state`() = runTest {
        val repo = repository(
            FakeConversationApi(
                ApiResponse(success = true, data = listOf(ApiConversation(id = "c1"))),
            ),
        )
        repo.refresh()

        val applied = repo.setMentionsOnlyOptimistic("c1", false)

        assertThat(applied).isFalse()
        assertThat(OutboxRepository(db, db.outboxDao()).deliverable(OutboxLanes.CONVERSATION_PREFS))
            .isEmpty()
    }

    @Test
    fun `setCategoryOptimistic assigns the cached category and queues a snapshot carrying it`() = runTest {
        val repo = repository(
            FakeConversationApi(
                ApiResponse(success = true, data = listOf(ApiConversation(id = "c1", title = "Team"))),
            ),
        )
        repo.refresh()

        val applied = repo.setCategoryOptimistic("c1", "work")

        assertThat(applied).isTrue()
        assertThat(repo.conversationStream("c1").first()?.preferences?.categoryId).isEqualTo("work")
        val row = OutboxRepository(db, db.outboxDao())
            .deliverable(OutboxLanes.CONVERSATION_PREFS).single()
        assertThat(row.targetId).isEqualTo("c1")
        assertThat(row.kindEnum).isEqualTo(OutboxKind.UPDATE_CONVERSATION_PREFS)
        val payload = me.meeshy.sdk.net.MeeshyApi.json
            .decodeFromString<me.meeshy.sdk.outbox.ConversationPrefsPayload>(row.payload)
        assertThat(payload.categoryId).isEqualTo("work")
    }

    @Test
    fun `setCategoryOptimistic is a no-op when the conversation is already in that category`() = runTest {
        val categorized = ApiConversation(
            id = "c1",
            title = "Team",
            preferences = me.meeshy.sdk.model.ApiConversationPreferences(categoryId = "work"),
        )
        val repo = repository(
            FakeConversationApi(ApiResponse(success = true, data = listOf(categorized))),
        )
        repo.refresh()

        val applied = repo.setCategoryOptimistic("c1", "work")

        assertThat(applied).isFalse()
        assertThat(OutboxRepository(db, db.outboxDao()).deliverable(OutboxLanes.CONVERSATION_PREFS))
            .isEmpty()
    }

    @Test
    fun `setCustomNameOptimistic sets the cached custom name and queues a snapshot carrying it`() = runTest {
        val repo = repository(
            FakeConversationApi(
                ApiResponse(success = true, data = listOf(ApiConversation(id = "c1", title = "Team"))),
            ),
        )
        repo.refresh()

        val applied = repo.setCustomNameOptimistic("c1", "  Work squad  ")

        assertThat(applied).isTrue()
        assertThat(repo.conversationStream("c1").first()?.preferences?.customName).isEqualTo("Work squad")
        val row = OutboxRepository(db, db.outboxDao())
            .deliverable(OutboxLanes.CONVERSATION_PREFS).single()
        assertThat(row.targetId).isEqualTo("c1")
        assertThat(row.kindEnum).isEqualTo(OutboxKind.UPDATE_CONVERSATION_PREFS)
        val payload = me.meeshy.sdk.net.MeeshyApi.json
            .decodeFromString<me.meeshy.sdk.outbox.ConversationPrefsPayload>(row.payload)
        assertThat(payload.customName).isEqualTo("Work squad")
    }

    @Test
    fun `setCustomNameOptimistic is a no-op when the trimmed name is unchanged`() = runTest {
        val named = ApiConversation(
            id = "c1",
            title = "Team",
            preferences = me.meeshy.sdk.model.ApiConversationPreferences(customName = "Work squad"),
        )
        val repo = repository(FakeConversationApi(ApiResponse(success = true, data = listOf(named))))
        repo.refresh()

        val applied = repo.setCustomNameOptimistic("c1", "Work squad")

        assertThat(applied).isFalse()
        assertThat(OutboxRepository(db, db.outboxDao()).deliverable(OutboxLanes.CONVERSATION_PREFS))
            .isEmpty()
    }

    @Test
    fun `setCustomNameOptimistic clearing to blank sends an explicit empty string, not a dropped null`() = runTest {
        val named = ApiConversation(
            id = "c1",
            title = "Team",
            preferences = me.meeshy.sdk.model.ApiConversationPreferences(customName = "Work squad"),
        )
        val repo = repository(FakeConversationApi(ApiResponse(success = true, data = listOf(named))))
        repo.refresh()

        val applied = repo.setCustomNameOptimistic("c1", "   ")

        assertThat(applied).isTrue()
        assertThat(repo.conversationStream("c1").first()?.preferences?.customName).isEmpty()
        val row = OutboxRepository(db, db.outboxDao())
            .deliverable(OutboxLanes.CONVERSATION_PREFS).single()
        val payload = me.meeshy.sdk.net.MeeshyApi.json
            .decodeFromString<me.meeshy.sdk.outbox.ConversationPrefsPayload>(row.payload)
        // Must be a real "" in the JSON, not a Kotlin null the shared explicitNulls=false
        // encoder would silently drop — that would leave the server-side name untouched.
        assertThat(payload.customName).isEqualTo("")
        assertThat(row.payload).contains("\"customName\":\"\"")
    }

    @Test
    fun `setReactionOptimistic sets the cached favorite reaction and queues a snapshot carrying it`() = runTest {
        val repo = repository(
            FakeConversationApi(
                ApiResponse(success = true, data = listOf(ApiConversation(id = "c1", title = "Team"))),
            ),
        )
        repo.refresh()

        val applied = repo.setReactionOptimistic("c1", "⭐️")

        assertThat(applied).isTrue()
        assertThat(repo.conversationStream("c1").first()?.preferences?.reaction).isEqualTo("⭐️")
        val row = OutboxRepository(db, db.outboxDao())
            .deliverable(OutboxLanes.CONVERSATION_PREFS).single()
        assertThat(row.targetId).isEqualTo("c1")
        assertThat(row.kindEnum).isEqualTo(OutboxKind.UPDATE_CONVERSATION_PREFS)
        val payload = me.meeshy.sdk.net.MeeshyApi.json
            .decodeFromString<me.meeshy.sdk.outbox.ConversationPrefsPayload>(row.payload)
        assertThat(payload.reaction).isEqualTo("⭐️")
    }

    @Test
    fun `setReactionOptimistic is a no-op when the reaction is unchanged`() = runTest {
        val starred = ApiConversation(
            id = "c1",
            title = "Team",
            preferences = me.meeshy.sdk.model.ApiConversationPreferences(reaction = "⭐️"),
        )
        val repo = repository(FakeConversationApi(ApiResponse(success = true, data = listOf(starred))))
        repo.refresh()

        val applied = repo.setReactionOptimistic("c1", "⭐️")

        assertThat(applied).isFalse()
        assertThat(OutboxRepository(db, db.outboxDao()).deliverable(OutboxLanes.CONVERSATION_PREFS))
            .isEmpty()
    }

    @Test
    fun `setReactionOptimistic clearing to null sends an explicit empty string, not a dropped null`() = runTest {
        val starred = ApiConversation(
            id = "c1",
            title = "Team",
            preferences = me.meeshy.sdk.model.ApiConversationPreferences(reaction = "⭐️"),
        )
        val repo = repository(FakeConversationApi(ApiResponse(success = true, data = listOf(starred))))
        repo.refresh()

        val applied = repo.setReactionOptimistic("c1", null)

        assertThat(applied).isTrue()
        assertThat(repo.conversationStream("c1").first()?.preferences?.reaction).isEmpty()
        val row = OutboxRepository(db, db.outboxDao())
            .deliverable(OutboxLanes.CONVERSATION_PREFS).single()
        val payload = me.meeshy.sdk.net.MeeshyApi.json
            .decodeFromString<me.meeshy.sdk.outbox.ConversationPrefsPayload>(row.payload)
        // Must be a real "" in the JSON, not a Kotlin null the shared explicitNulls=false
        // encoder would silently drop — that would leave the server-side reaction untouched.
        assertThat(payload.reaction).isEqualTo("")
        assertThat(row.payload).contains("\"reaction\":\"\"")
    }

    @Test
    fun `stream first emission is Empty on a cold cache`() = runTest {
        val repo = repository(FakeConversationApi(ApiResponse(success = false, error = "down")))

        assertThat(repo.conversationsStream().first()).isEqualTo(CacheResult.Empty)
    }

    @Test
    fun `cachedConversations emits an empty list on a cold cache without touching the network`() = runTest {
        val api = FakeConversationApi(ApiResponse(success = false, error = "should never be called"))
        val repo = repository(api)

        assertThat(repo.cachedConversations().first()).isEmpty()
    }

    @Test
    fun `cachedConversations emits the locally-cached conversations after a refresh`() = runTest {
        val repo = repository(
            FakeConversationApi(
                ApiResponse(
                    success = true,
                    data = listOf(
                        ApiConversation(id = "c1", title = "Team", unreadCount = 3),
                        ApiConversation(id = "c2", title = "Family", unreadCount = 2),
                    ),
                ),
            ),
        )
        repo.refresh()

        assertThat(repo.cachedConversations().first().map { it.id }).containsExactly("c1", "c2")
    }

    @Test
    fun `cachedConversations reflects a subsequent refresh without a caller re-subscribing`() = runTest {
        val api = FakeConversationApi(
            ApiResponse(success = true, data = listOf(ApiConversation(id = "c1", unreadCount = 1))),
        )
        val repo = repository(api)
        repo.refresh()
        assertThat(repo.cachedConversations().first().single().unreadCount).isEqualTo(1)

        api.response = ApiResponse(success = true, data = listOf(ApiConversation(id = "c1", unreadCount = 9)))
        repo.refresh()

        assertThat(repo.cachedConversations().first().single().unreadCount).isEqualTo(9)
    }

    @Test
    fun `refresh persists conversations and sync metadata`() = runTest {
        val repo = repository(
            FakeConversationApi(
                ApiResponse(
                    success = true,
                    data = listOf(
                        ApiConversation(id = "c1", title = "Team"),
                        ApiConversation(id = "c2", title = "Family"),
                    ),
                ),
            ),
        )

        repo.refresh()

        assertThat(db.conversationDao().observeAll().first().map { it.id })
            .containsExactly("c1", "c2")
        assertThat(db.syncMetaDao().observe(ConversationCacheSource.RESOURCE_KEY).first())
            .isNotNull()
    }

    @Test
    fun `refresh removes conversations absent from the latest sync`() = runTest {
        val api = FakeConversationApi(
            ApiResponse(success = true, data = listOf(ApiConversation(id = "c1"), ApiConversation(id = "c2"))),
        )
        val repo = repository(api)
        repo.refresh()

        api.response = ApiResponse(success = true, data = listOf(ApiConversation(id = "c2")))
        repo.refresh()

        assertThat(db.conversationDao().observeAll().first().map { it.id }).containsExactly("c2")
    }

    @Test
    fun `conversationStream emits the cached conversation by id`() = runTest {
        val repo = repository(
            FakeConversationApi(
                ApiResponse(
                    success = true,
                    data = listOf(
                        ApiConversation(id = "c1", title = "Team"),
                        ApiConversation(id = "c2", title = "Family"),
                    ),
                ),
            ),
        )
        repo.refresh()

        assertThat(repo.conversationStream("c2").first()?.title).isEqualTo("Family")
    }

    @Test
    fun `conversationStream emits null for an unknown conversation`() = runTest {
        val repo = repository(FakeConversationApi(ApiResponse(success = false, error = "n/a")))

        assertThat(repo.conversationStream("missing").first()).isNull()
    }

    @Test
    fun `refresh throws when the network fails`() = runTest {
        val repo = repository(FakeConversationApi(ApiResponse(success = false, error = "Server down")))

        val thrown = runCatching { repo.refresh() }.exceptionOrNull()

        assertThat(thrown).isInstanceOf(ConversationSyncException::class.java)
        assertThat(thrown).hasMessageThat().isEqualTo("Server down")
    }

    @Test
    fun `updateSettings forwards the id and patch and returns the server payload`() = runTest {
        val api = RecordingSettingsApi(
            ApiResponse(
                success = true,
                data = me.meeshy.sdk.model.UpdateConversationResponse(
                    id = "c1",
                    defaultWriteRole = "admin",
                    slowModeSeconds = 60,
                ),
            ),
        )
        val repo = repository(api)
        val request = me.meeshy.sdk.model.UpdateConversationSettingsRequest(
            defaultWriteRole = "admin",
            slowModeSeconds = 60,
        )

        val result = repo.updateSettings("c1", request)

        assertThat(api.lastId).isEqualTo("c1")
        assertThat(api.lastBody).isEqualTo(request)
        assertThat(result).isInstanceOf(me.meeshy.sdk.net.NetworkResult.Success::class.java)
        assertThat(result.getOrNull()?.defaultWriteRole).isEqualTo("admin")
        assertThat(result.getOrNull()?.slowModeSeconds).isEqualTo(60)
    }

    @Test
    fun `updateSettings folds an unsuccessful envelope into a Failure`() = runTest {
        val repo = repository(
            RecordingSettingsApi(ApiResponse(success = false, error = "Forbidden")),
        )

        val result = repo.updateSettings(
            "c1",
            me.meeshy.sdk.model.UpdateConversationSettingsRequest(isAnnouncementChannel = true),
        )

        assertThat(result).isInstanceOf(me.meeshy.sdk.net.NetworkResult.Failure::class.java)
        assertThat((result as me.meeshy.sdk.net.NetworkResult.Failure).error.message).isEqualTo("Forbidden")
    }

    @Test
    fun `leave forwards the id and returns Success`() = runTest {
        val api = RecordingLeaveApi(ApiResponse(success = true, data = Unit))
        val repo = repository(api)

        val result = repo.leave("c1")

        assertThat(api.lastId).isEqualTo("c1")
        assertThat(result).isInstanceOf(me.meeshy.sdk.net.NetworkResult.Success::class.java)
    }

    @Test
    fun `leave folds an unsuccessful envelope into a Failure`() = runTest {
        val repo = repository(RecordingLeaveApi(ApiResponse(success = false, error = "Not a participant")))

        val result = repo.leave("c1")

        assertThat(result).isInstanceOf(me.meeshy.sdk.net.NetworkResult.Failure::class.java)
        assertThat((result as me.meeshy.sdk.net.NetworkResult.Failure).error.message)
            .isEqualTo("Not a participant")
    }

    @Test
    fun `deleteForMe forwards the id and returns Success`() = runTest {
        val api = RecordingDeleteForMeApi(ApiResponse(success = true, data = Unit))
        val repo = repository(api)

        val result = repo.deleteForMe("c1")

        assertThat(api.lastId).isEqualTo("c1")
        assertThat(result).isInstanceOf(me.meeshy.sdk.net.NetworkResult.Success::class.java)
    }

    @Test
    fun `deleteForMe folds an unsuccessful envelope into a Failure`() = runTest {
        val repo = repository(RecordingDeleteForMeApi(ApiResponse(success = false, error = "Not a participant")))

        val result = repo.deleteForMe("c1")

        assertThat(result).isInstanceOf(me.meeshy.sdk.net.NetworkResult.Failure::class.java)
        assertThat((result as me.meeshy.sdk.net.NetworkResult.Failure).error.message)
            .isEqualTo("Not a participant")
    }

    @Test
    fun `deleteForAll forwards the id and returns Success`() = runTest {
        val api = RecordingDeleteForAllApi(ApiResponse(success = true, data = Unit))
        val repo = repository(api)

        val result = repo.deleteForAll("c1")

        assertThat(api.lastId).isEqualTo("c1")
        assertThat(result).isInstanceOf(me.meeshy.sdk.net.NetworkResult.Success::class.java)
    }

    @Test
    fun `deleteForAll folds an unsuccessful envelope into a Failure`() = runTest {
        val repo = repository(RecordingDeleteForAllApi(ApiResponse(success = false, error = "Only the creator can do this")))

        val result = repo.deleteForAll("c1")

        assertThat(result).isInstanceOf(me.meeshy.sdk.net.NetworkResult.Failure::class.java)
        assertThat((result as me.meeshy.sdk.net.NetworkResult.Failure).error.message)
            .isEqualTo("Only the creator can do this")
    }
}
