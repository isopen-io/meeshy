package me.meeshy.sdk.conversation

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import java.time.Instant
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.encodeToString
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

    override suspend fun list(offset: Int?, limit: Int?, updatedSince: String?) =
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
    override suspend fun list(offset: Int?, limit: Int?, updatedSince: String?) = response
}

/**
 * Mirrors the gateway's own defaults for `GET /conversations`
 * (`services/gateway/src/routes/conversations/core-list.ts`, `validatePagination`):
 * `offset ?: 0`, `limit ?: 30`, and `hasMore = appliedOffset + returned < total`.
 * Backs the #5186 regression test — a caller that omits `limit` (the pre-fix
 * [ConversationCacheSource]) only ever sees the first 30 of [totalConversations].
 */
private class PagedConversationApi(
    totalConversations: Int,
) : StubConversationApi() {
    private val all: List<ApiConversation> =
        (0 until totalConversations).map { ApiConversation(id = "c$it", title = "Conv $it") }

    override suspend fun list(offset: Int?, limit: Int?, updatedSince: String?): ApiResponse<List<ApiConversation>> {
        val appliedOffset = offset ?: 0
        val appliedLimit = limit ?: 30
        val page = all.drop(appliedOffset).take(appliedLimit)
        return ApiResponse(
            success = true,
            data = page,
            pagination = me.meeshy.sdk.model.Pagination(
                total = all.size,
                offset = appliedOffset,
                limit = appliedLimit,
                hasMore = appliedOffset + page.size < all.size,
            ),
        )
    }
}

/**
 * A single page with NO `pagination` block at all — a legal but degraded
 * envelope shape (`{ success, data }`, no `pagination` key). Backs the
 * hardening regression on #5186's own fix: `pagination?.hasMore ?: false`
 * used to read "envelope omitted pagination" the same as "server confirms no
 * more pages", which is the wrong failure direction for a DELETE — it must
 * read as UNKNOWN completeness (never prune), not proven completeness.
 */
private class PaginationlessConversationApi(
    private val served: List<ApiConversation>,
) : StubConversationApi() {
    override suspend fun list(offset: Int?, limit: Int?, updatedSince: String?): ApiResponse<List<ApiConversation>> =
        ApiResponse(success = true, data = served, pagination = null)
}

/**
 * Mirrors the gateway's DELTA contract for `GET /conversations`
 * (`services/gateway/src/routes/conversations/core-list.ts:251-264`): with
 * [updatedSince] set, only conversations whose `updatedAt` is STRICTLY
 * greater than it are served (`gt`, not `gte` — repassing the exact watermark
 * must not re-serve a row already held); with it unset (a full sweep),
 * everyone is served. [calls] records every request — offset, limit and
 * `updatedSince` — so a test can assert both HOW MANY requests a sweep made
 * and whether it asked for a delta or a full page at all (#5187).
 */
private class DeltaAwareConversationApi(
    private val all: List<ApiConversation>,
) : StubConversationApi() {
    data class Call(val offset: Int?, val limit: Int?, val updatedSince: String?)

    val calls: MutableList<Call> = mutableListOf()

    override suspend fun list(offset: Int?, limit: Int?, updatedSince: String?): ApiResponse<List<ApiConversation>> {
        calls += Call(offset, limit, updatedSince)
        val sinceMillis = updatedSince?.let { Instant.parse(it).toEpochMilli() }
        val matching = if (sinceMillis != null) {
            all.filter { conversation -> Instant.parse(conversation.updatedAt!!).toEpochMilli() > sinceMillis }
        } else {
            all
        }
        val appliedOffset = offset ?: 0
        val appliedLimit = limit ?: 30
        val page = matching.drop(appliedOffset).take(appliedLimit)
        return ApiResponse(
            success = true,
            data = page,
            pagination = me.meeshy.sdk.model.Pagination(
                total = matching.size,
                offset = appliedOffset,
                limit = appliedLimit,
                hasMore = appliedOffset + page.size < matching.size,
            ),
        )
    }
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

    /**
     * Both fake responses declare `pagination.hasMore = false` explicitly —
     * a completed single-page sweep, per #5186's hardening: an envelope with
     * NO `pagination` block is UNKNOWN completeness and never prunes (see
     * `revalidate prunes nothing when the envelope omits pagination`), so
     * this test must prove its sweep exhaustive to exercise deletion at all.
     */
    @Test
    fun `refresh removes conversations absent from the latest sync`() = runTest {
        val api = FakeConversationApi(
            ApiResponse(
                success = true,
                data = listOf(ApiConversation(id = "c1"), ApiConversation(id = "c2")),
                pagination = me.meeshy.sdk.model.Pagination(hasMore = false),
            ),
        )
        val repo = repository(api)
        repo.refresh()

        api.response = ApiResponse(
            success = true,
            data = listOf(ApiConversation(id = "c2")),
            pagination = me.meeshy.sdk.model.Pagination(hasMore = false),
        )
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
     * #5186 — `ConversationCacheSource.revalidate()` used to call
     * `conversationApi.list()` with NO pagination (≤ 30 rows, the server's own
     * default), then `deleteNotIn` everything outside that single page. An
     * account with more than 30 cached conversations lost the rest on every
     * revalidation, even though every one of them still existed server-side.
     *
     * 245 previously-synced rows are seeded directly into Room (bypassing
     * `revalidate`, so the test doesn't depend on the fix under test to
     * populate the cache), then [ConversationRepository.refresh] runs ONCE
     * against a server that still serves all 245 conversations — spanning
     * several pages, since [PagedConversationApi] answers `GET /conversations`
     * exactly like the gateway. None of the 245 should be pruned.
     */
    @Test
    fun `revalidate does not drop cached conversations that live beyond the first page`() = runTest {
        val total = 245
        db.conversationDao().upsertAll(
            (0 until total).map { i ->
                me.meeshy.core.database.entity.ConversationEntity(
                    id = "c$i",
                    payload = me.meeshy.sdk.net.MeeshyApi.json.encodeToString(
                        ApiConversation(id = "c$i", title = "Conv $i"),
                    ),
                    updatedAt = i.toLong(),
                    cachedAt = i.toLong(),
                )
            },
        )
        val repo = repository(PagedConversationApi(totalConversations = total))

        repo.refresh()

        val cachedIds = repo.cachedConversations().first().map { it.id }.toSet()
        assertThat(cachedIds).containsExactlyElementsIn((0 until total).map { "c$it" })
    }

    /**
     * Hardening on #5186's own fix: a completed sweep can legitimately be
     * LARGER than SQLite's per-statement bound-variable ceiling
     * (`SQLITE_MAX_VARIABLE_NUMBER` = 999 on Android API 26-29, the floor
     * `minSdk = 26` must hold under) — this is exactly the scale the fix
     * exists to sweep. A naive `DELETE ... WHERE id NOT IN (:keptIds)` binds
     * one variable per kept id and would throw "too many SQL variables" on
     * device for the very account sizes #5186 protects.
     *
     * 1 200 conversations are seeded directly into Room; the server sweep
     * (spanning several pages, `hasMore = false` on the last one) serves only
     * the first 1 100 of them — the other 100 genuinely no longer exist. Room
     * itself does not enforce `SQLITE_MAX_VARIABLE_NUMBER` under Robolectric,
     * so this cannot reproduce the on-device crash directly; what it proves
     * is the delete-set's CORRECTNESS at a scale past the 999 threshold — the
     * chunked `deleteByIds` calls in [ConversationCacheSource] are what keep
     * that correct behaviour from crashing where SQLite actually enforces the
     * limit.
     */
    @Test
    fun `revalidate purges only the conversations truly gone from a 1200-row local cache`() = runTest {
        val localTotal = 1200
        val keptTotal = 1100
        db.conversationDao().upsertAll(
            (0 until localTotal).map { i ->
                me.meeshy.core.database.entity.ConversationEntity(
                    id = "c$i",
                    payload = me.meeshy.sdk.net.MeeshyApi.json.encodeToString(
                        ApiConversation(id = "c$i", title = "Conv $i"),
                    ),
                    updatedAt = i.toLong(),
                    cachedAt = i.toLong(),
                )
            },
        )
        val repo = repository(PagedConversationApi(totalConversations = keptTotal))

        repo.refresh()

        val cachedIds = repo.cachedConversations().first().map { it.id }.toSet()
        assertThat(cachedIds).containsExactlyElementsIn((0 until keptTotal).map { "c$it" })
    }

    /**
     * #5186 hardening — an envelope with NO `pagination` block is UNKNOWN
     * completeness, not proven completeness. Reading `pagination?.hasMore ?:
     * false` as "no more pages, sweep is done" pointed the failure direction
     * the wrong way for a DELETE: a server that simply forgot to send the
     * block would wipe every conversation the cache had never seen mentioned
     * on that one page. 5 previously-synced rows are seeded directly; the
     * fake server answers with a single, different conversation and NO
     * `pagination` key at all. None of the 5 should be pruned — what the page
     * DID mention is still upserted alongside them.
     */
    @Test
    fun `revalidate prunes nothing when the envelope omits pagination`() = runTest {
        val existing = (0 until 5).map { i ->
            me.meeshy.core.database.entity.ConversationEntity(
                id = "c$i",
                payload = me.meeshy.sdk.net.MeeshyApi.json.encodeToString(
                    ApiConversation(id = "c$i", title = "Conv $i"),
                ),
                updatedAt = i.toLong(),
                cachedAt = i.toLong(),
            )
        }
        db.conversationDao().upsertAll(existing)
        val repo = repository(
            PaginationlessConversationApi(
                served = listOf(ApiConversation(id = "new1", title = "New")),
            ),
        )

        repo.refresh()

        val cachedIds = repo.cachedConversations().first().map { it.id }.toSet()
        assertThat(cachedIds).containsExactlyElementsIn(
            (0 until 5).map { "c$it" } + "new1",
        )
    }

    /**
     * #5187 — delta-sync. A resource with a fresh, proven watermark (< 24h)
     * asks the server for `updatedSince=<watermark>` instead of re-fetching
     * everyone. When the server confirms nothing changed (an empty page,
     * `hasMore = false` immediately), the sweep makes exactly ONE request —
     * no further pages to walk — and writes NOTHING to Room: not the
     * conversation the cache already held (its `cachedAt` — bumped by any
     * upsert, even a same-content one — stays byte-for-byte the same), not
     * `sync_meta.lastSyncedAt`, and not the watermark itself (there is no new
     * `updatedAt` to advance it to).
     */
    @Test
    fun `revalidate with a fresh watermark and no server changes makes one request and writes nothing`() = runTest {
        val watermarkMillis = System.currentTimeMillis() - 60_000L
        db.syncMetaDao().upsert(
            me.meeshy.core.database.entity.SyncMetaEntity(
                ConversationCacheSource.RESOURCE_KEY,
                watermarkMillis,
                watermarkMillis,
            ),
        )
        db.conversationDao().upsertAll(
            listOf(
                me.meeshy.core.database.entity.ConversationEntity(
                    id = "c1",
                    payload = me.meeshy.sdk.net.MeeshyApi.json.encodeToString(
                        ApiConversation(id = "c1", title = "Team", updatedAt = Instant.ofEpochMilli(watermarkMillis).toString()),
                    ),
                    updatedAt = watermarkMillis,
                    cachedAt = watermarkMillis,
                ),
            ),
        )
        // The server's own copy of "c1" carries the EXACT watermark instant — a
        // `gt` filter must exclude it (repassing what you already hold must not
        // re-serve it), so this is a genuine "nothing changed" response.
        val api = DeltaAwareConversationApi(
            all = listOf(ApiConversation(id = "c1", title = "Team", updatedAt = Instant.ofEpochMilli(watermarkMillis).toString())),
        )
        val repo = repository(api)
        val cachedAtBefore = db.conversationDao().find("c1")?.cachedAt
        val lastSyncedAtBefore = db.syncMetaDao().observe(ConversationCacheSource.RESOURCE_KEY).first()

        repo.refresh()

        assertThat(api.calls).hasSize(1)
        assertThat(api.calls.single().updatedSince).isEqualTo(Instant.ofEpochMilli(watermarkMillis).toString())
        assertThat(db.conversationDao().find("c1")?.cachedAt).isEqualTo(cachedAtBefore)
        assertThat(db.syncMetaDao().watermark(ConversationCacheSource.RESOURCE_KEY)).isEqualTo(watermarkMillis)
        assertThat(db.syncMetaDao().observe(ConversationCacheSource.RESOURCE_KEY).first()).isEqualTo(lastSyncedAtBefore)
    }

    /**
     * #5187 — a conversation reachable only on the SECOND delta page (150
     * conversations changed server-side, [ConversationCacheSource]'s own
     * page size is 100) still reaches Room. This is the multi-page delta walk
     * that pattern (b) of #5186 already established for the full sweep,
     * reused here for the delta sweep — proving it isn't a one-page special
     * case.
     */
    @Test
    fun `a conversation updated beyond page 1 arrives via a delta sweep and updates Room`() = runTest {
        val watermarkMillis = System.currentTimeMillis() - 60_000L
        val total = 150
        db.syncMetaDao().upsert(
            me.meeshy.core.database.entity.SyncMetaEntity(
                ConversationCacheSource.RESOURCE_KEY,
                watermarkMillis,
                watermarkMillis,
            ),
        )
        db.conversationDao().upsertAll(
            (0 until total).map { i ->
                me.meeshy.core.database.entity.ConversationEntity(
                    id = "c$i",
                    payload = me.meeshy.sdk.net.MeeshyApi.json.encodeToString(
                        ApiConversation(id = "c$i", title = "Old $i"),
                    ),
                    updatedAt = watermarkMillis,
                    cachedAt = watermarkMillis,
                )
            },
        )
        val changedAtIso = Instant.ofEpochMilli(watermarkMillis + 1_000L).toString()
        val api = DeltaAwareConversationApi(
            all = (0 until total).map { i ->
                ApiConversation(id = "c$i", title = "New $i", updatedAt = changedAtIso)
            },
        )
        val repo = repository(api)

        repo.refresh()

        assertThat(api.calls.size).isGreaterThan(1)
        // Every page of the sweep must be a DELTA page (non-null `updatedSince`) —
        // an unfiltered FULL sweep would also happen to update every row here
        // (this fake's backing set has no "unchanged" rows to tell them apart by
        // outcome), so the request shape itself is what proves the delta path ran.
        assertThat(api.calls.all { it.updatedSince != null }).isTrue()
        val lastRow = db.conversationDao().find("c${total - 1}")
        val decoded = lastRow?.let {
            me.meeshy.sdk.net.MeeshyApi.json.decodeFromString<ApiConversation>(it.payload)
        }
        assertThat(decoded?.title).isEqualTo("New ${total - 1}")
    }

    /**
     * #5187 — the core delta-sync safety property. A delta's `whereClause`
     * only ever PROVES a conversation still matches; a conversation absent
     * from a delta response could mean "unchanged" OR "left the account
     * entirely" (closed, left, banned, deleted-for-me elsewhere), and a delta
     * page cannot distinguish the two. It must therefore never delete —
     * "untouched" survives locally even though the server's delta response
     * never mentions it at all.
     */
    @Test
    fun `a delta sweep never erases a local conversation absent from its response`() = runTest {
        val watermarkMillis = System.currentTimeMillis() - 60_000L
        db.syncMetaDao().upsert(
            me.meeshy.core.database.entity.SyncMetaEntity(
                ConversationCacheSource.RESOURCE_KEY,
                watermarkMillis,
                watermarkMillis,
            ),
        )
        db.conversationDao().upsertAll(
            listOf(
                me.meeshy.core.database.entity.ConversationEntity(
                    id = "untouched",
                    payload = me.meeshy.sdk.net.MeeshyApi.json.encodeToString(
                        ApiConversation(id = "untouched", title = "Untouched"),
                    ),
                    updatedAt = watermarkMillis,
                    cachedAt = watermarkMillis,
                ),
                me.meeshy.core.database.entity.ConversationEntity(
                    id = "changed",
                    payload = me.meeshy.sdk.net.MeeshyApi.json.encodeToString(
                        ApiConversation(id = "changed", title = "Old"),
                    ),
                    updatedAt = watermarkMillis,
                    cachedAt = watermarkMillis,
                ),
            ),
        )
        // The delta response mentions ONLY "changed" — "untouched" is absent,
        // whether because it truly didn't change or because it left the
        // account; a delta page can't tell, and must not act as if it could.
        val api = DeltaAwareConversationApi(
            all = listOf(
                ApiConversation(
                    id = "changed",
                    title = "Changed!",
                    updatedAt = Instant.ofEpochMilli(watermarkMillis + 1_000L).toString(),
                ),
            ),
        )
        val repo = repository(api)

        repo.refresh()

        val ids = repo.cachedConversations().first().map { it.id }.toSet()
        assertThat(ids).containsExactly("untouched", "changed")
    }

    /**
     * #5187 — a watermark older than [CachePolicy.Conversations]' 24h retention
     * forces the exhaustive full sweep (no `updatedSince` sent at all), and
     * ONLY that full sweep is trusted to purge: a conversation the cache held
     * that the server's CURRENT, exhaustive list no longer mentions is gone
     * for real.
     */
    @Test
    fun `a watermark older than 24h forces a full sweep, and only the full sweep purges`() = runTest {
        val staleWatermarkMillis = System.currentTimeMillis() - (25 * 60 * 60 * 1000L)
        db.syncMetaDao().upsert(
            me.meeshy.core.database.entity.SyncMetaEntity(
                ConversationCacheSource.RESOURCE_KEY,
                staleWatermarkMillis,
                staleWatermarkMillis,
            ),
        )
        db.conversationDao().upsertAll(
            listOf(
                me.meeshy.core.database.entity.ConversationEntity(
                    id = "gone",
                    payload = me.meeshy.sdk.net.MeeshyApi.json.encodeToString(
                        ApiConversation(id = "gone", title = "Gone"),
                    ),
                    updatedAt = staleWatermarkMillis,
                    cachedAt = staleWatermarkMillis,
                ),
            ),
        )
        // The server's exhaustive list no longer includes "gone" at all.
        val api = DeltaAwareConversationApi(
            all = listOf(
                ApiConversation(id = "kept", title = "Kept", updatedAt = Instant.now().toString()),
            ),
        )
        val repo = repository(api)

        repo.refresh()

        assertThat(api.calls.single().updatedSince).isNull()
        val ids = repo.cachedConversations().first().map { it.id }.toSet()
        assertThat(ids).containsExactly("kept")
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
