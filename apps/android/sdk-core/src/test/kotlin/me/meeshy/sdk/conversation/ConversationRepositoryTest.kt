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
import me.meeshy.sdk.model.ConversationAnalysis
import me.meeshy.sdk.model.ConversationMessageStatsResponse
import me.meeshy.sdk.model.CreateConversationRequest
import me.meeshy.sdk.model.JoinAuthenticatedResponse
import me.meeshy.sdk.model.MemberRole
import me.meeshy.sdk.model.PaginatedParticipant
import me.meeshy.sdk.model.PaginatedParticipantsPagination
import me.meeshy.sdk.model.PaginatedParticipantsResponse
import me.meeshy.sdk.model.UpdateConversationResponse
import me.meeshy.sdk.model.UpdateConversationSettingsRequest
import me.meeshy.sdk.model.UserPreferencesConversationUpdatedSocketData
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.AddParticipantRequest
import me.meeshy.sdk.net.api.ConversationApi
import me.meeshy.sdk.net.api.ConversationPreferencesUpdate
import me.meeshy.sdk.net.api.ParticipantRoleUpdate
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxLanes
import me.meeshy.sdk.outbox.OutboxRepository
import me.meeshy.sdk.outbox.kindEnum
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * Every stub answers "not wired" so a test that reaches an endpoint it did not
 * intend to exercise fails loudly instead of silently succeeding. Each fake below
 * overrides only the one call it is about — and a new [ConversationApi] method
 * costs one line here rather than one per fake.
 */
private abstract class StubConversationApi : ConversationApi {
    // #3943 — la fiche d'un participant. Ces quatre stubs implémentent
    // `ConversationApi` À LA MAIN : chaque route ajoutée à l'interface est donc
    // un inventaire à tenir dans quatre fichiers, et le compilateur est le seul
    // à s'en souvenir. Refusent par défaut — un test qui a besoin de la route
    // la redéfinit.
    override suspend fun participantProfile(id: String, participantId: String) =
        me.meeshy.sdk.model.ApiResponse<me.meeshy.sdk.model.ApiParticipantProfile>(success = false)

    override suspend fun updateHistoryGrant(
        id: String,
        participantId: String,
        body: me.meeshy.sdk.model.HistoryGrantUpdate,
    ) = me.meeshy.sdk.model.ApiResponse<me.meeshy.sdk.net.api.ParticipantRightsUpdateResult>(success = false)

    override suspend fun list(offset: Int?, limit: Int?) =
        ApiResponse<List<ApiConversation>>(success = false)
    override suspend fun search(query: String) = ApiResponse<List<ApiConversation>>(success = false)
    override suspend fun getById(id: String) = ApiResponse<ApiConversation>(success = false)
    override suspend fun stats(id: String) = ApiResponse<ConversationMessageStatsResponse>(success = false)
    override suspend fun analysis(id: String) = ApiResponse<ConversationAnalysis>(success = false)
    override suspend fun create(body: CreateConversationRequest) =
        ApiResponse<ApiConversation>(success = false)
    override suspend fun markRead(id: String) = ApiResponse<Unit>(success = false)
    override suspend fun markUnread(id: String) = ApiResponse<Unit>(success = false)
    override suspend fun updatePreferences(id: String, body: ConversationPreferencesUpdate) =
        ApiResponse<Unit>(success = false)
    override suspend fun updateSettings(id: String, body: UpdateConversationSettingsRequest) =
        ApiResponse<UpdateConversationResponse>(success = false)
    override suspend fun leave(id: String) = ApiResponse<Unit>(success = false)
    override suspend fun deleteForMe(id: String) = ApiResponse<Unit>(success = false)
    override suspend fun deleteForAll(id: String) = ApiResponse<Unit>(success = false)
    override suspend fun participants(id: String, search: String?, limit: Int?, cursor: String?) =
        PaginatedParticipantsResponse(success = false)
    override suspend fun updateParticipantRole(id: String, userId: String, body: ParticipantRoleUpdate) =
        ApiResponse<Unit>(success = false)
    override suspend fun removeParticipant(id: String, userId: String) =
        ApiResponse<Unit>(success = false)
    override suspend fun addParticipant(id: String, body: AddParticipantRequest) =
        ApiResponse<Unit>(success = false)
    override suspend fun banParticipant(id: String, userId: String) =
        ApiResponse<Unit>(success = false)
    override suspend fun joinViaShareLink(linkId: String) =
        ApiResponse<JoinAuthenticatedResponse>(success = false)
}

private class FakeConversationApi(
    var response: ApiResponse<List<ApiConversation>>,
) : StubConversationApi() {
    override suspend fun list(offset: Int?, limit: Int?) = response
}

private class RecordingSettingsApi(
    private val response: ApiResponse<UpdateConversationResponse>,
) : StubConversationApi() {
    var lastId: String? = null
    var lastBody: UpdateConversationSettingsRequest? = null

    override suspend fun updateSettings(
        id: String,
        body: UpdateConversationSettingsRequest,
    ): ApiResponse<UpdateConversationResponse> {
        lastId = id
        lastBody = body
        return response
    }
}

private class RecordingLeaveApi(
    private val response: ApiResponse<Unit>,
) : StubConversationApi() {
    var lastId: String? = null

    override suspend fun leave(id: String): ApiResponse<Unit> {
        lastId = id
        return response
    }
}

private class RecordingDeleteForMeApi(
    private val response: ApiResponse<Unit>,
) : StubConversationApi() {
    var lastId: String? = null

    override suspend fun deleteForMe(id: String): ApiResponse<Unit> {
        lastId = id
        return response
    }
}

private class RecordingDeleteForAllApi(
    private val response: ApiResponse<Unit>,
) : StubConversationApi() {
    var lastId: String? = null

    override suspend fun deleteForAll(id: String): ApiResponse<Unit> {
        lastId = id
        return response
    }
}

private class RecordingParticipantsApi(
    private val response: PaginatedParticipantsResponse = PaginatedParticipantsResponse(success = true),
    private val roleResponse: ApiResponse<Unit> = ApiResponse(success = true, data = Unit),
    private val removeResponse: ApiResponse<Unit> = ApiResponse(success = true, data = Unit),
    private val addResponse: ApiResponse<Unit> = ApiResponse(success = true, data = Unit),
    private val banResponse: ApiResponse<Unit> = ApiResponse(success = true, data = Unit),
) : StubConversationApi() {
    var lastId: String? = null
    var lastSearch: String? = null
    var lastLimit: Int? = null
    var lastCursor: String? = null
    var lastRoleUserId: String? = null
    var lastRoleBody: ParticipantRoleUpdate? = null
    var lastRemovedUserId: String? = null
    var lastAddedUserId: String? = null
    var lastBannedUserId: String? = null

    override suspend fun participants(
        id: String,
        search: String?,
        limit: Int?,
        cursor: String?,
    ): PaginatedParticipantsResponse {
        lastId = id
        lastSearch = search
        lastLimit = limit
        lastCursor = cursor
        return response
    }

    override suspend fun updateParticipantRole(
        id: String,
        userId: String,
        body: ParticipantRoleUpdate,
    ): ApiResponse<Unit> {
        lastId = id
        lastRoleUserId = userId
        lastRoleBody = body
        return roleResponse
    }

    override suspend fun removeParticipant(id: String, userId: String): ApiResponse<Unit> {
        lastId = id
        lastRemovedUserId = userId
        return removeResponse
    }

    override suspend fun addParticipant(id: String, body: AddParticipantRequest): ApiResponse<Unit> {
        lastId = id
        lastAddedUserId = body.userId
        return addResponse
    }

    override suspend fun banParticipant(id: String, userId: String): ApiResponse<Unit> {
        lastId = id
        lastBannedUserId = userId
        return banResponse
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

    /**
     * Le geste fait sur un AUTRE appareil (#4127). `UserConversationPreferences` est
     * une ligne par UTILISATEUR : sans cet écrivain, épingler depuis le web laissait
     * la ligne Android non épinglée jusqu'à un rechargement complet sans rapport.
     */
    @Test
    fun `applyRemoteConversationPreferences writes a broadcast pin onto the cached row`() = runTest {
        val repo = repository(
            FakeConversationApi(
                ApiResponse(success = true, data = listOf(ApiConversation(id = "c1", title = "Team"))),
            ),
        )
        repo.refresh()

        val applied = repo.applyRemoteConversationPreferences(
            broadcast(version = 1, isPinned = true, categoryId = "cat-1"),
        )

        assertThat(applied).isTrue()
        val prefs = repo.conversationStream("c1").first()?.resolvedPreferences
        assertThat(prefs?.isPinned).isTrue()
        assertThat(prefs?.categoryId).isEqualTo("cat-1")
        assertThat(prefs?.version).isEqualTo(1)
    }

    /**
     * L'écrivain diffuse à TOUS les appareils de l'utilisateur, y compris celui qui
     * vient d'écrire : une trame qui ne dépasse pas le compteur local décrit un
     * passé, et l'appliquer rembobinerait le geste le plus récent.
     */
    @Test
    fun `applyRemoteConversationPreferences drops a broadcast that does not beat the local version`() =
        runTest {
            val repo = repository(
                FakeConversationApi(
                    ApiResponse(success = true, data = listOf(ApiConversation(id = "c1"))),
                ),
            )
            repo.refresh()
            repo.applyRemoteConversationPreferences(broadcast(version = 3, isPinned = true))

            val applied = repo.applyRemoteConversationPreferences(
                broadcast(version = 3, isPinned = false),
            )

            assertThat(applied).isFalse()
            assertThat(repo.conversationStream("c1").first()?.resolvedPreferences?.isPinned).isTrue()
        }

    /** Conversation non hydratée : rien à écrire, la prochaine relecture rattrape. */
    @Test
    fun `applyRemoteConversationPreferences returns false for an unknown conversation id`() = runTest {
        val repo = repository(
            FakeConversationApi(ApiResponse(success = true, data = emptyList())),
        )
        repo.refresh()

        val applied = repo.applyRemoteConversationPreferences(
            broadcast(version = 1, isPinned = true, conversationId = "missing"),
        )

        assertThat(applied).isFalse()
    }

    /**
     * Le relais est un pur ÉCRIVAIN de cache : il ne doit RIEN mettre dans la file
     * hors ligne. Renvoyer au serveur ce que le serveur vient d'annoncer ferait
     * boucler l'écriture entre les appareils.
     */
    @Test
    fun `applyRemoteConversationPreferences queues no outbox mutation`() = runTest {
        val repo = repository(
            FakeConversationApi(
                ApiResponse(success = true, data = listOf(ApiConversation(id = "c1"))),
            ),
        )
        repo.refresh()

        repo.applyRemoteConversationPreferences(broadcast(version = 1, isPinned = true))

        assertThat(OutboxRepository(db, db.outboxDao()).deliverable(OutboxLanes.CONVERSATION_PREFS))
            .isEmpty()
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
    fun `setTagsOptimistic sets the cached tags trimmed and deduplicated, queuing a snapshot`() = runTest {
        val repo = repository(
            FakeConversationApi(
                ApiResponse(success = true, data = listOf(ApiConversation(id = "c1", title = "Team"))),
            ),
        )
        repo.refresh()

        val applied = repo.setTagsOptimistic("c1", listOf("  work  ", "family", "work"))

        assertThat(applied).isTrue()
        assertThat(repo.conversationStream("c1").first()?.preferences?.tags)
            .containsExactly("work", "family").inOrder()
        val row = OutboxRepository(db, db.outboxDao())
            .deliverable(OutboxLanes.CONVERSATION_PREFS).single()
        assertThat(row.targetId).isEqualTo("c1")
        assertThat(row.kindEnum).isEqualTo(OutboxKind.UPDATE_CONVERSATION_PREFS)
        val payload = me.meeshy.sdk.net.MeeshyApi.json
            .decodeFromString<me.meeshy.sdk.outbox.ConversationPrefsPayload>(row.payload)
        assertThat(payload.tags).containsExactly("work", "family").inOrder()
    }

    @Test
    fun `setTagsOptimistic is a no-op when the normalized tag set is unchanged`() = runTest {
        val tagged = ApiConversation(
            id = "c1",
            title = "Team",
            preferences = me.meeshy.sdk.model.ApiConversationPreferences(tags = listOf("work")),
        )
        val repo = repository(FakeConversationApi(ApiResponse(success = true, data = listOf(tagged))))
        repo.refresh()

        val applied = repo.setTagsOptimistic("c1", listOf("work"))

        assertThat(applied).isFalse()
        assertThat(OutboxRepository(db, db.outboxDao()).deliverable(OutboxLanes.CONVERSATION_PREFS))
            .isEmpty()
    }

    @Test
    fun `setTagsOptimistic clearing to an empty list sends an explicit empty array`() = runTest {
        val tagged = ApiConversation(
            id = "c1",
            title = "Team",
            preferences = me.meeshy.sdk.model.ApiConversationPreferences(tags = listOf("work")),
        )
        val repo = repository(FakeConversationApi(ApiResponse(success = true, data = listOf(tagged))))
        repo.refresh()

        val applied = repo.setTagsOptimistic("c1", emptyList())

        assertThat(applied).isTrue()
        assertThat(repo.conversationStream("c1").first()?.preferences?.tags).isEmpty()
        val row = OutboxRepository(db, db.outboxDao())
            .deliverable(OutboxLanes.CONVERSATION_PREFS).single()
        val payload = me.meeshy.sdk.net.MeeshyApi.json
            .decodeFromString<me.meeshy.sdk.outbox.ConversationPrefsPayload>(row.payload)
        assertThat(payload.tags).isEqualTo(emptyList<String>())
        assertThat(row.payload).contains("\"tags\":[]")
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
                data = UpdateConversationResponse(
                    id = "c1",
                    defaultWriteRole = "admin",
                    slowModeSeconds = 60,
                ),
            ),
        )
        val repo = repository(api)
        val request = UpdateConversationSettingsRequest(
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
            UpdateConversationSettingsRequest(isAnnouncementChannel = true),
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

    @Test
    fun `participants maps the cursor envelope onto a roster page`() = runTest {
        val api = RecordingParticipantsApi(
            PaginatedParticipantsResponse(
                success = true,
                data = listOf(
                    PaginatedParticipant(id = "p1", userId = "u1", displayName = "Ada"),
                    PaginatedParticipant(id = "p2", userId = "u2", displayName = "Grace"),
                ),
                pagination = PaginatedParticipantsPagination(
                    nextCursor = "p2",
                    hasMore = true,
                    totalCount = 42,
                ),
            ),
        )
        val repo = repository(api)

        val result = repo.participants("c1")

        assertThat(result).isInstanceOf(NetworkResult.Success::class.java)
        val page = (result as NetworkResult.Success).data
        assertThat(page.members.map { it.id }).containsExactly("p1", "p2").inOrder()
        assertThat(page.nextCursor).isEqualTo("p2")
        assertThat(page.hasMore).isTrue()
        assertThat(page.totalCount).isEqualTo(42)
    }

    @Test
    fun `participants forwards the id, cursor and default page size`() = runTest {
        val api = RecordingParticipantsApi()
        val repo = repository(api)

        repo.participants("c1", cursor = "p9")

        assertThat(api.lastId).isEqualTo("c1")
        assertThat(api.lastCursor).isEqualTo("p9")
        assertThat(api.lastLimit).isEqualTo(ConversationRepository.PARTICIPANTS_PAGE_SIZE)
    }

    @Test
    fun `a blank search term is not sent as a filter`() = runTest {
        val api = RecordingParticipantsApi()
        val repo = repository(api)

        repo.participants("c1", search = "   ")

        assertThat(api.lastSearch).isNull()
    }

    @Test
    fun `a real search term is forwarded verbatim`() = runTest {
        val api = RecordingParticipantsApi()
        val repo = repository(api)

        repo.participants("c1", search = "ada")

        assertThat(api.lastSearch).isEqualTo("ada")
    }

    @Test
    fun `a page with no pagination object is treated as the only page`() = runTest {
        val api = RecordingParticipantsApi(
            PaginatedParticipantsResponse(
                success = true,
                data = listOf(PaginatedParticipant(id = "p1")),
                pagination = null,
            ),
        )
        val repo = repository(api)

        val page = (repo.participants("c1") as NetworkResult.Success).data

        assertThat(page.hasMore).isFalse()
        assertThat(page.nextCursor).isNull()
    }

    @Test
    fun `an unsuccessful participants envelope folds into a Failure`() = runTest {
        val repo = repository(
            RecordingParticipantsApi(
                PaginatedParticipantsResponse(success = false),
            ),
        )

        assertThat(repo.participants("c1")).isInstanceOf(NetworkResult.Failure::class.java)
    }

    @Test
    fun `updateParticipantRole sends the lowercase wire value the gateway enumerates`() = runTest {
        val api = RecordingParticipantsApi()
        val repo = repository(api)

        val result = repo.updateParticipantRole("c1", "u1", MemberRole.MODERATOR)

        assertThat(api.lastId).isEqualTo("c1")
        assertThat(api.lastRoleUserId).isEqualTo("u1")
        assertThat(api.lastRoleBody?.role).isEqualTo("moderator")
        assertThat(result).isInstanceOf(NetworkResult.Success::class.java)
    }

    @Test
    fun `updateParticipantRole folds a refused change into a Failure`() = runTest {
        val repo = repository(
            RecordingParticipantsApi(
                roleResponse = ApiResponse(success = false, error = "You cannot modify your own role"),
            ),
        )

        val result = repo.updateParticipantRole("c1", "u1", MemberRole.ADMIN)

        assertThat(result).isInstanceOf(NetworkResult.Failure::class.java)
        assertThat((result as NetworkResult.Failure).error.message)
            .isEqualTo("You cannot modify your own role")
    }

    @Test
    fun `removeParticipant forwards the conversation and user ids`() = runTest {
        val api = RecordingParticipantsApi()
        val repo = repository(api)

        val result = repo.removeParticipant("c1", "u1")

        assertThat(api.lastId).isEqualTo("c1")
        assertThat(api.lastRemovedUserId).isEqualTo("u1")
        assertThat(result).isInstanceOf(NetworkResult.Success::class.java)
    }

    @Test
    fun `removeParticipant folds a refused removal into a Failure`() = runTest {
        val repo = repository(
            RecordingParticipantsApi(
                removeResponse = ApiResponse(success = false, error = "Insufficient rights"),
            ),
        )

        val result = repo.removeParticipant("c1", "u1")

        assertThat(result).isInstanceOf(NetworkResult.Failure::class.java)
        assertThat((result as NetworkResult.Failure).error.message).isEqualTo("Insufficient rights")
    }

    @Test
    fun `addParticipant forwards the conversation and user ids`() = runTest {
        val api = RecordingParticipantsApi()
        val repo = repository(api)

        val result = repo.addParticipant("c1", "u1")

        assertThat(api.lastId).isEqualTo("c1")
        assertThat(api.lastAddedUserId).isEqualTo("u1")
        assertThat(result).isInstanceOf(NetworkResult.Success::class.java)
    }

    @Test
    fun `addParticipant folds a refusal into a Failure`() = runTest {
        val repo = repository(
            RecordingParticipantsApi(
                addResponse = ApiResponse(success = false, error = "Only admins and moderators can add participants"),
            ),
        )

        val result = repo.addParticipant("c1", "u1")

        assertThat(result).isInstanceOf(NetworkResult.Failure::class.java)
        assertThat((result as NetworkResult.Failure).error.message)
            .isEqualTo("Only admins and moderators can add participants")
    }

    @Test
    fun `banParticipant forwards the conversation and user ids`() = runTest {
        val api = RecordingParticipantsApi()
        val repo = repository(api)

        val result = repo.banParticipant("c1", "u1")

        assertThat(api.lastId).isEqualTo("c1")
        assertThat(api.lastBannedUserId).isEqualTo("u1")
        assertThat(result).isInstanceOf(NetworkResult.Success::class.java)
    }

    @Test
    fun `banParticipant folds a refusal into a Failure`() = runTest {
        val repo = repository(
            RecordingParticipantsApi(
                banResponse = ApiResponse(success = false, error = "Vous ne pouvez pas bannir un participant de rang égal ou supérieur"),
            ),
        )

        val result = repo.banParticipant("c1", "u1")

        assertThat(result).isInstanceOf(NetworkResult.Failure::class.java)
        assertThat((result as NetworkResult.Failure).error.message)
            .isEqualTo("Vous ne pouvez pas bannir un participant de rang égal ou supérieur")
    }

    /**
     * La charge RÉELLE de l'émetteur (`toPreferencesPayload`,
     * `services/gateway/src/services/conversationPreferencesSync.ts`), traversant le
     * vrai décodeur — jamais un événement construit dans le langage du client.
     */
    private fun broadcast(
        version: Int,
        isPinned: Boolean,
        categoryId: String? = null,
        conversationId: String = "c1",
    ): UserPreferencesConversationUpdatedSocketData =
        me.meeshy.sdk.net.MeeshyApi.json.decodeFromString<UserPreferencesConversationUpdatedSocketData>(
            """
            {
              "userId": "u1", "conversationId": "$conversationId",
              "version": $version, "reset": false,
              "preferences": {
                "isPinned": $isPinned, "isMuted": false, "mentionsOnly": false,
                "isArchived": false, "tags": [],
                "categoryId": ${if (categoryId == null) "null" else "\"$categoryId\""},
                "orderInCategory": null, "customName": null, "reaction": null,
                "readingMode": "auto", "deletedForUserAt": null, "clearHistoryBefore": null
              }
            }
            """.trimIndent(),
        )

}
