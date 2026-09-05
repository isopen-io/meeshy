package me.meeshy.sdk.conversation

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import java.time.Instant
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.cache.SystemCacheClock
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.ApiTextTranslation
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.MessageEffectFlags
import me.meeshy.sdk.model.MessageEffects
import me.meeshy.sdk.model.Pagination
import me.meeshy.sdk.model.SendMessageRequest
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.net.api.EditMessageRequest
import me.meeshy.sdk.net.api.MessageApi
import me.meeshy.sdk.net.api.TranslateRequest
import me.meeshy.sdk.net.api.TranslateResponse
import me.meeshy.sdk.net.api.TranslationApi
import me.meeshy.sdk.outbox.OutboxDependencyKey
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxLanes
import me.meeshy.sdk.outbox.OutboxRepository
import me.meeshy.sdk.outbox.OutboxState
import me.meeshy.sdk.outbox.kindEnum
import me.meeshy.sdk.outbox.stateEnum
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

private class FakeMessageApi(
    var response: ApiResponse<List<ApiMessage>>,
    var olderResponse: ApiResponse<List<ApiMessage>> = ApiResponse(success = false, error = "no older page"),
) : MessageApi {
    var lastBefore: String? = null
    var lastLimit: Int? = null
    var listCalls: Int = 0

    override suspend fun list(
        conversationId: String,
        offset: Int?,
        limit: Int?,
        before: String?,
    ): ApiResponse<List<ApiMessage>> {
        listCalls += 1
        lastBefore = before
        lastLimit = limit
        return if (before != null) olderResponse else response
    }

    // #5188 — [MessageCacheSource.revalidate] now always goes through the
    // conditional call for its recent-window fetch; this fake never simulates
    // a 304 (no existing test here holds a validator), so it always answers
    // 200 with the SAME body [list] would have returned.
    override suspend fun listConditional(
        conversationId: String,
        ifNoneMatch: String?,
    ): retrofit2.Response<ApiResponse<List<ApiMessage>>> =
        retrofit2.Response.success(list(conversationId, null, null, null))

    // #5206 — [MessageCacheSource.revalidate] now checks for a local
    // high-water mark FIRST; refusing here (rather than silently answering
    // "nothing new") makes it fall back to [listConditional] within the SAME
    // call — the exact full-window path every test using this fake already
    // exercises and asserts against, so their SECOND `refresh()` call (once
    // Room holds a high-water mark from the first) still reaches the
    // response the test actually set up.
    override suspend fun listAfter(conversationId: String, after: String, limit: Int?) =
        me.meeshy.sdk.model.MessagesApiResponse(success = false)

    override suspend fun send(conversationId: String, body: SendMessageRequest) =
        ApiResponse<ApiMessage>(success = false)
    override suspend fun edit(messageId: String, body: EditMessageRequest) =
        ApiResponse<ApiMessage>(success = false)
    override suspend fun delete(messageId: String) = ApiResponse<Unit>(success = false)
    override suspend fun search(conversationId: String, query: String, limit: Int?, cursor: String?) =
        ApiResponse<List<ApiMessage>>(success = false)
    override suspend fun pin(conversationId: String, messageId: String) =
        ApiResponse<Unit>(success = true)
    override suspend fun unpin(conversationId: String, messageId: String) =
        ApiResponse<Unit>(success = true)
}

/**
 * Simulates the gateway's ETag/If-None-Match contract for the recent-message
 * window (`sendWithETag`, `services/gateway/src/routes/conversations/
 * messages-list.ts:825-829`): the validator is a pure function of [served]'s
 * current content, so the SAME request against an UNCHANGED [served] always
 * recomputes the SAME validator — which is what makes `If-None-Match` match
 * and a 304 possible. [served] is mutable so a test can simulate the server
 * changing between two `revalidate()` calls. #5188.
 */
private class EtagAwareMessageApi(
    var served: List<ApiMessage>,
) : MessageApi {
    val calls: MutableList<String?> = mutableListOf()

    override suspend fun list(conversationId: String, offset: Int?, limit: Int?, before: String?) =
        ApiResponse(success = true, data = served)

    override suspend fun listConditional(
        conversationId: String,
        ifNoneMatch: String?,
    ): retrofit2.Response<ApiResponse<List<ApiMessage>>> {
        calls += ifNoneMatch
        val envelope = ApiResponse(success = true, data = served)
        val etag = "\"${envelope.hashCode()}\""
        return if (ifNoneMatch != null && ifNoneMatch == etag) {
            retrofit2.Response.error(
                "".toResponseBody(null),
                messagesNotModifiedRawResponse(),
            )
        } else {
            retrofit2.Response.success(envelope, okhttp3.Headers.headersOf("ETag", etag))
        }
    }

    // #5206 — refusing (see [FakeMessageApi.listAfter]'s doc-comment for why
    // this is the safe default) makes a SECOND `refresh()` call — once Room
    // holds a high-water mark from the first — fall back to the SAME
    // full-window/[listConditional] path every existing test using this fake
    // already exercises.
    override suspend fun listAfter(conversationId: String, after: String, limit: Int?) =
        me.meeshy.sdk.model.MessagesApiResponse(success = false)

    override suspend fun send(conversationId: String, body: SendMessageRequest) =
        ApiResponse<ApiMessage>(success = false)
    override suspend fun edit(messageId: String, body: EditMessageRequest) =
        ApiResponse<ApiMessage>(success = false)
    override suspend fun delete(messageId: String) = ApiResponse<Unit>(success = false)
    override suspend fun search(conversationId: String, query: String, limit: Int?, cursor: String?) =
        ApiResponse<List<ApiMessage>>(success = false)
    override suspend fun pin(conversationId: String, messageId: String) =
        ApiResponse<Unit>(success = false)
    override suspend fun unpin(conversationId: String, messageId: String) =
        ApiResponse<Unit>(success = false)
}

/**
 * A raw 304 `okhttp3.Response` — [retrofit2.Response]'s `(Int, ResponseBody)`
 * error factory REQUIRES `code >= 400` (Retrofit's own precondition), so a 304
 * must go through the raw-response overload instead. #5188.
 */
private fun messagesNotModifiedRawResponse(): okhttp3.Response =
    okhttp3.Response.Builder()
        .code(304)
        .message("Not Modified")
        .protocol(okhttp3.Protocol.HTTP_1_1)
        .request(okhttp3.Request.Builder().url("http://localhost/").build())
        .build()

/**
 * Simulates the gateway's forward-watermark gap backfill (#5206,
 * `services/gateway/src/routes/conversations/messages-list.ts:112, 228-232,
 * 370-372, 505-529`): `after` filters `createdAt > after`, ascending,
 * `cursorPagination.hasMore` computed from a `limit + 1` probe (trimmed
 * before being counted). [listConditionalCalls] tracks how often the
 * FULL-WINDOW ([MessageApi.listConditional]) path fires — #5206's core claim
 * is that a successful gap sweep never needs it, and never sends the
 * full-window's own `ETag` (structurally impossible here: [listAfter] takes
 * no `If-None-Match` parameter at all).
 */
private class GapAwareMessageApi(
    var served: List<ApiMessage>,
) : MessageApi {
    data class AfterCall(val after: String, val limit: Int?)

    val listAfterCalls: MutableList<AfterCall> = mutableListOf()
    var listConditionalCalls: Int = 0

    override suspend fun list(conversationId: String, offset: Int?, limit: Int?, before: String?) =
        ApiResponse(success = true, data = served)

    override suspend fun listConditional(
        conversationId: String,
        ifNoneMatch: String?,
    ): retrofit2.Response<ApiResponse<List<ApiMessage>>> {
        listConditionalCalls += 1
        return retrofit2.Response.success(ApiResponse(success = true, data = served))
    }

    override suspend fun listAfter(conversationId: String, after: String, limit: Int?): me.meeshy.sdk.model.MessagesApiResponse {
        listAfterCalls += AfterCall(after, limit)
        val afterMillis = Instant.parse(after).toEpochMilli()
        val appliedLimit = limit ?: 20
        val matching = served
            .filter { Instant.parse(it.createdAt!!).toEpochMilli() > afterMillis }
            .sortedBy { Instant.parse(it.createdAt!!).toEpochMilli() }
        val page = matching.take(appliedLimit)
        return me.meeshy.sdk.model.MessagesApiResponse(
            success = true,
            data = page,
            cursorPagination = me.meeshy.sdk.model.CursorPagination(
                nextCursor = null,
                hasMore = matching.size > appliedLimit,
                limit = appliedLimit,
            ),
        )
    }

    override suspend fun send(conversationId: String, body: SendMessageRequest) =
        ApiResponse<ApiMessage>(success = false)
    override suspend fun edit(messageId: String, body: EditMessageRequest) =
        ApiResponse<ApiMessage>(success = false)
    override suspend fun delete(messageId: String) = ApiResponse<Unit>(success = false)
    override suspend fun search(conversationId: String, query: String, limit: Int?, cursor: String?) =
        ApiResponse<List<ApiMessage>>(success = false)
    override suspend fun pin(conversationId: String, messageId: String) =
        ApiResponse<Unit>(success = false)
    override suspend fun unpin(conversationId: String, messageId: String) =
        ApiResponse<Unit>(success = false)
}

private class FakeTranslationApi(
    var response: ApiResponse<TranslateResponse> = ApiResponse(success = false, error = "no translator"),
) : TranslationApi {
    var lastRequest: TranslateRequest? = null
    var calls: Int = 0

    override suspend fun translate(body: TranslateRequest): ApiResponse<TranslateResponse> {
        calls += 1
        lastRequest = body
        return response
    }
}

private fun apiMessage(
    id: String,
    conversationId: String = "c1",
    clientMessageId: String? = null,
    createdAt: String? = null,
) = ApiMessage(
    id = id,
    conversationId = conversationId,
    content = "hi",
    clientMessageId = clientMessageId,
    createdAt = createdAt,
)

private class MutableClock(var now: Long) : me.meeshy.sdk.cache.CacheClock {
    override fun nowMillis(): Long = now
}

private const val T1 = "2026-06-01T10:00:00Z"
private const val T2 = "2026-06-01T11:00:00Z"
private const val T3 = "2026-06-01T12:00:00Z"
private const val T4 = "2026-06-01T13:00:00Z"

/** A strictly increasing timestamp for [seconds] — #5189's bounded-window tests. */
private fun isoAt(seconds: Int): String = Instant.ofEpochSecond(seconds.toLong()).toString()

private val sender = MeeshyUser(id = "me", username = "atabeth", displayName = "Atabeth")

@RunWith(RobolectricTestRunner::class)
class MessageRepositoryTest {

    private lateinit var db: MeeshyDatabase
    private lateinit var outbox: OutboxRepository

    @Before
    fun setUp() {
        db = Room.inMemoryDatabaseBuilder(
            ApplicationProvider.getApplicationContext(),
            MeeshyDatabase::class.java,
        ).allowMainThreadQueries().build()
        outbox = OutboxRepository(db, db.outboxDao())
    }

    @After
    fun tearDown() {
        db.close()
    }

    private fun repository(
        api: MessageApi,
        translationApi: TranslationApi = FakeTranslationApi(),
        clock: me.meeshy.sdk.cache.CacheClock = SystemCacheClock,
    ) = MessageRepository(api, translationApi, db, db.messageDao(), db.syncMetaDao(), outbox, clock)

    private suspend fun streamedMessages(repo: MessageRepository, conversationId: String = "c1") =
        db.messageDao().observeForConversation(conversationId).first()

    private suspend fun cachedApiMessage(id: String): ApiMessage =
        MeeshyApi.json.decodeFromString<ApiMessage>(db.messageDao().find(id)!!.payload)

    private suspend fun sentRequest(lane: String): SendMessageRequest =
        MeeshyApi.json.decodeFromString<SendMessageRequest>(outbox.deliverable(lane).last().payload)

    /** Unwraps a [CacheResult]'s carried value, empty for [CacheResult.Empty] — #5189 tests. */
    private fun CacheResult<List<LocalMessage>>.valueOrEmpty(): List<LocalMessage> = when (this) {
        is CacheResult.Fresh -> value
        is CacheResult.Stale -> value
        is CacheResult.Syncing -> value.orEmpty()
        CacheResult.Empty -> emptyList()
    }

    @Test
    fun `requestTranslation stores the returned translation and reports success`() = runTest {
        val translation = FakeTranslationApi(
            ApiResponse(success = true, data = TranslateResponse(translatedText = "Bonjour")),
        )
        val repo = repository(
            FakeMessageApi(ApiResponse(success = true, data = listOf(apiMessage("m1")))),
            translationApi = translation,
        )
        repo.refresh("c1")

        val stored = repo.requestTranslation("m1", "fr")

        assertThat(stored).isTrue()
        assertThat(translation.lastRequest?.targetLanguage).isEqualTo("fr")
        assertThat(
            cachedApiMessage("m1").translations
                .single { it.targetLanguage == "fr" }.translatedContent,
        ).isEqualTo("Bonjour")
    }

    @Test
    fun `requestTranslation returns false and stores nothing when the translator fails`() = runTest {
        val repo = repository(
            FakeMessageApi(ApiResponse(success = true, data = listOf(apiMessage("m1")))),
            translationApi = FakeTranslationApi(ApiResponse(success = false, error = "translator down")),
        )
        repo.refresh("c1")

        val stored = repo.requestTranslation("m1", "fr")

        assertThat(stored).isFalse()
        assertThat(cachedApiMessage("m1").translations).isEmpty()
    }

    @Test
    fun `requestTranslation on an unknown message never calls the translator`() = runTest {
        val translation = FakeTranslationApi()
        val repo = repository(
            FakeMessageApi(ApiResponse(success = false, error = "down")),
            translationApi = translation,
        )

        val stored = repo.requestTranslation("ghost", "fr")

        assertThat(stored).isFalse()
        assertThat(translation.calls).isEqualTo(0)
    }

    @Test
    fun `requestTranslation on a deleted message is inert`() = runTest {
        val translation = FakeTranslationApi(
            ApiResponse(success = true, data = TranslateResponse(translatedText = "Bonjour")),
        )
        val repo = repository(
            FakeMessageApi(
                ApiResponse(
                    success = true,
                    data = listOf(apiMessage("m1").copy(deletedAt = "2026-06-01T10:00:00Z")),
                ),
            ),
            translationApi = translation,
        )
        repo.refresh("c1")

        val stored = repo.requestTranslation("m1", "fr")

        assertThat(stored).isFalse()
        assertThat(translation.calls).isEqualTo(0)
    }

    @Test
    fun `requestTranslation with a blank target is inert`() = runTest {
        val translation = FakeTranslationApi()
        val repo = repository(
            FakeMessageApi(ApiResponse(success = true, data = listOf(apiMessage("m1")))),
            translationApi = translation,
        )
        repo.refresh("c1")

        val stored = repo.requestTranslation("m1", "   ")

        assertThat(stored).isFalse()
        assertThat(translation.calls).isEqualTo(0)
    }

    @Test
    fun `requestTranslation ignores a blank translated result`() = runTest {
        val repo = repository(
            FakeMessageApi(ApiResponse(success = true, data = listOf(apiMessage("m1")))),
            translationApi = FakeTranslationApi(
                ApiResponse(success = true, data = TranslateResponse(translatedText = "   ")),
            ),
        )
        repo.refresh("c1")

        val stored = repo.requestTranslation("m1", "fr")

        assertThat(stored).isFalse()
        assertThat(cachedApiMessage("m1").translations).isEmpty()
    }

    @Test
    fun `requestTranslation is idempotent when the translation already matches the cache`() = runTest {
        val existing = apiMessage("m1").copy(
            translations = listOf(
                ApiTextTranslation(targetLanguage = "fr", translatedContent = "Bonjour"),
            ),
        )
        val repo = repository(
            FakeMessageApi(ApiResponse(success = true, data = listOf(existing))),
            translationApi = FakeTranslationApi(
                ApiResponse(success = true, data = TranslateResponse(translatedText = "Bonjour")),
            ),
        )
        repo.refresh("c1")

        val stored = repo.requestTranslation("m1", "fr")

        assertThat(stored).isFalse()
        assertThat(cachedApiMessage("m1").translations).hasSize(1)
    }

    @Test
    fun `stream first emission is Empty on a cold cache`() = runTest {
        val repo = repository(FakeMessageApi(ApiResponse(success = false, error = "down")))

        assertThat(repo.messagesStream("c1").first()).isEqualTo(CacheResult.Empty)
    }

    @Test
    fun `refresh persists the conversation's messages`() = runTest {
        val repo = repository(
            FakeMessageApi(
                ApiResponse(success = true, data = listOf(apiMessage("m1"), apiMessage("m2"))),
            ),
        )

        repo.refresh("c1")

        assertThat(streamedMessages(repo).map { it.id }).containsExactly("m1", "m2")
    }

    @Test
    fun `refresh prunes messages absent from the latest sync`() = runTest {
        val api = FakeMessageApi(
            ApiResponse(success = true, data = listOf(apiMessage("m1"), apiMessage("m2"))),
        )
        val repo = repository(api)
        repo.refresh("c1")

        api.response = ApiResponse(success = true, data = listOf(apiMessage("m2")))
        repo.refresh("c1")

        assertThat(streamedMessages(repo).map { it.id }).containsExactly("m2")
    }

    @Test
    fun `refresh throws when the network fails`() = runTest {
        val repo = repository(FakeMessageApi(ApiResponse(success = false, error = "Server down")))

        val thrown = runCatching { repo.refresh("c1") }.exceptionOrNull()

        assertThat(thrown).isInstanceOf(MessageSyncException::class.java)
    }

    /**
     * #5188 — the FIRST revalidate ever for this conversation (no held
     * `etag`) must not send `If-None-Match` at all.
     */
    @Test
    fun `the first-ever refresh sends no If-None-Match`() = runTest {
        val api = EtagAwareMessageApi(served = listOf(apiMessage("m1")))
        val repo = repository(api)

        repo.refresh("c1")

        assertThat(api.calls).hasSize(1)
        assertThat(api.calls.single()).isNull()
    }

    /**
     * #5188 — core witness. A first refresh primes a real `ETag`. Repeating
     * the exact same refresh against an UNCHANGED server must get a 304: the
     * second call sends `If-None-Match`, no body is ever decoded, and NOTHING
     * is written to the `messages` table — proven by the seeded row's
     * `cachedAt` staying byte-identical (an upsert, even of identical
     * content, would bump it). Freshness (`lastSyncedAt`) DOES advance — a
     * 304 is still a successful revalidation.
     */
    @Test
    fun `refresh with a held validator and an unchanged server gets a 304 and writes nothing`() = runTest {
        val api = EtagAwareMessageApi(served = listOf(apiMessage("m1", createdAt = T1)))
        val repo = repository(api)

        repo.refresh("c1") // primes a real ETag
        val etagAfterPriming = db.syncMetaDao().etag("messages:c1")
        assertThat(etagAfterPriming).isNotNull()
        val cachedAtBeforeSecondCall = db.messageDao().find("m1")?.cachedAt
        val lastSyncedAtBeforeSecondCall = db.syncMetaDao().observe("messages:c1").first()!!

        repo.refresh("c1") // repeat — server unchanged, must 304

        assertThat(api.calls).hasSize(2)
        assertThat(api.calls[1]).isEqualTo(etagAfterPriming)
        assertThat(db.messageDao().find("m1")?.cachedAt).isEqualTo(cachedAtBeforeSecondCall)
        assertThat(db.syncMetaDao().etag("messages:c1")).isEqualTo(etagAfterPriming)
        assertThat(db.syncMetaDao().observe("messages:c1").first()).isGreaterThan(lastSyncedAtBeforeSecondCall)
    }

    /**
     * #5188 — the server DID change between two refreshes: the second call
     * gets 200 (not 304), the stored `ETag` is REPLACED, and Room reflects
     * the new content.
     */
    @Test
    fun `refresh when the server changed gets 200, a replaced validator, and updates Room`() = runTest {
        val api = EtagAwareMessageApi(served = listOf(apiMessage("m1", createdAt = T1)))
        val repo = repository(api)
        repo.refresh("c1") // primes an ETag
        val etagBefore = db.syncMetaDao().etag("messages:c1")
        assertThat(etagBefore).isNotNull()

        api.served = listOf(apiMessage("m1", createdAt = T1), apiMessage("m2", createdAt = T2))
        repo.refresh("c1")

        val etagAfter = db.syncMetaDao().etag("messages:c1")
        assertThat(etagAfter).isNotEqualTo(etagBefore)
        assertThat(streamedMessages(repo).map { it.id }).containsExactly("m1", "m2")
    }

    /**
     * Seeds a held row directly into Room, bypassing `revalidate()` — the
     * "already-held window" this whole family of tests must never re-fetch.
     */
    private fun heldMessageEntity(id: String, createdAt: String) =
        me.meeshy.core.database.entity.MessageEntity(
            id = id,
            conversationId = "c1",
            seq = null,
            payload = MeeshyApi.json.encodeToString(apiMessage(id, createdAt = createdAt)),
            createdAt = Instant.parse(createdAt).toEpochMilli(),
            cachedAt = Instant.parse(createdAt).toEpochMilli(),
        )

    /**
     * #5206 — core witness. The client already holds m1/m2; the server also
     * has m3 (the gap). ONE bounded `after=<m2's createdAt>` request must
     * fill it, and the already-held window must never be re-requested: the
     * fake's `listAfter` only ever returns what is STRICTLY newer than
     * `after`, so a single call returning exactly the gap (never m1/m2)
     * proves the held window was never asked for again.
     */
    @Test
    fun `a gap of new messages is filled by one bounded after request without re-downloading the held window`() =
        runTest {
            val api = GapAwareMessageApi(
                served = listOf(
                    apiMessage("m1", createdAt = T1),
                    apiMessage("m2", createdAt = T2),
                    apiMessage("m3", createdAt = T3),
                ),
            )
            db.messageDao().upsertAll(listOf(heldMessageEntity("m1", T1), heldMessageEntity("m2", T2)))
            val repo = repository(api)

            repo.refresh("c1")

            assertThat(api.listAfterCalls).hasSize(1)
            assertThat(api.listAfterCalls.single().after).isEqualTo(T2)
            assertThat(api.listConditionalCalls).isEqualTo(0)
            assertThat(streamedMessages(repo).map { it.id }).containsExactly("m1", "m2", "m3")
        }

    /**
     * #5206 — a gap sweep never deletes a local message. Both m1 (old) and
     * m5 (the current high-water mark) are held directly; the gap sweep
     * (`after=m5's createdAt`) only ever returns m6. Neither original
     * survivor was even IN the fetched page — proving the sweep's own write
     * path never ran a delete of any kind, windowed or not.
     */
    @Test
    fun `a gap sweep never deletes a local message`() = runTest {
        val api = GapAwareMessageApi(
            served = listOf(apiMessage("m1", createdAt = T1), apiMessage("m5", createdAt = "2026-06-01T14:00:00Z"), apiMessage("m6", createdAt = "2026-06-01T15:00:00Z")),
        )
        db.messageDao().upsertAll(
            listOf(heldMessageEntity("m1", T1), heldMessageEntity("m5", "2026-06-01T14:00:00Z")),
        )
        val repo = repository(api)

        repo.refresh("c1")

        assertThat(streamedMessages(repo).map { it.id }).containsExactly("m1", "m5", "m6")
    }

    /**
     * #5206 — the dominant "caught up, nothing missed" case. The gap sweep
     * confirms zero new messages: this must write NOTHING to Room at all —
     * proven by the held row's `cachedAt` staying byte-identical (an
     * upsert, even of identical content, would bump it) and `lastSyncedAt`
     * staying untouched too.
     */
    @Test
    fun `an empty after response makes zero Room writes`() = runTest {
        val api = GapAwareMessageApi(served = listOf(apiMessage("m1", createdAt = T1)))
        db.messageDao().upsertAll(listOf(heldMessageEntity("m1", T1)))
        val repo = repository(api)
        val cachedAtBefore = db.messageDao().find("m1")?.cachedAt
        val lastSyncedAtBefore = db.syncMetaDao().observe("messages:c1").first()

        repo.refresh("c1")

        assertThat(api.listAfterCalls).hasSize(1)
        assertThat(db.messageDao().find("m1")?.cachedAt).isEqualTo(cachedAtBefore)
        assertThat(db.syncMetaDao().observe("messages:c1").first()).isEqualTo(lastSyncedAtBefore)
    }

    /**
     * #5206 — the full-window `ETag` from #5188 must never be sent on an
     * `after` request: a DIFFERENT request shape entirely, whose validator
     * (if any existed for it) would never match anyway. Proven here by the
     * strongest available signal — the full-window/[listConditional] path is
     * never even CALLED when the gap sweep succeeds, so the stored `etag`
     * never gets a chance to be sent at all.
     */
    @Test
    fun `the full-window ETag validator is not sent on an after request`() = runTest {
        val api = GapAwareMessageApi(served = listOf(apiMessage("m1", createdAt = T1), apiMessage("m2", createdAt = T2)))
        db.messageDao().upsertAll(listOf(heldMessageEntity("m1", T1)))
        db.syncMetaDao().upsert(
            me.meeshy.core.database.entity.SyncMetaEntity(
                "messages:c1",
                System.currentTimeMillis(),
                null,
                "\"stale-full-window-etag\"",
                null,
            ),
        )
        val repo = repository(api)

        repo.refresh("c1")

        assertThat(api.listConditionalCalls).isEqualTo(0)
        assertThat(streamedMessages(repo).map { it.id }).containsExactly("m1", "m2")
    }

    /**
     * #5206 direction-of-failure — a malformed/refused gap sweep (here:
     * `cursorPagination` absent, so `hasMore` cannot be proven either way)
     * falls back to the full window WITHIN THE SAME CALL rather than
     * throwing: the user still gets a successful revalidation this tick.
     */
    @Test
    fun `a malformed after response falls back to the full window in the same call`() = runTest {
        val api = object : MessageApi by GapAwareMessageApi(served = emptyList()) {
            override suspend fun listAfter(conversationId: String, after: String, limit: Int?) =
                me.meeshy.sdk.model.MessagesApiResponse(success = true, data = emptyList(), cursorPagination = null)
            override suspend fun listConditional(conversationId: String, ifNoneMatch: String?) =
                retrofit2.Response.success(
                    ApiResponse(success = true, data = listOf(apiMessage("m2", createdAt = T2))),
                )
        }
        db.messageDao().upsertAll(listOf(heldMessageEntity("m1", T1)))
        val repo = repository(api)

        repo.refresh("c1")

        // The fallback reached the full window and persisted its content —
        // m1 legitimately survives too: the full-window response here only
        // returned m2, so the windowed prune's fetched-window floor sits AT
        // m2's createdAt, and m1 (older, outside that narrow window) is
        // untouched by design (`MessageDao.deleteMissingSince`'s own
        // contract) — the point of this test is that m2 arrived at all.
        assertThat(streamedMessages(repo).map { it.id }).containsExactly("m1", "m2")
    }

    @Test
    fun `sendOptimistic shows a SENDING bubble instantly and queues the outbox`() = runTest {
        val repo = repository(FakeMessageApi(ApiResponse(success = false, error = "offline")))

        val cmid = repo.sendOptimistic("c1", "salut", "fr", sender)

        val row = streamedMessages(repo).single()
        assertThat(row.id).isEqualTo(cmid)
        assertThat(row.sendState).isEqualTo(LocalSendState.SENDING.name)
        assertThat(outbox.deliverable("message:c1").map { it.cmid }).containsExactly(cmid)
    }

    @Test
    fun `sendOptimistic with no effects carries a clean SendMessageRequest`() = runTest {
        val repo = repository(FakeMessageApi(ApiResponse(success = false, error = "offline")))

        val cmid = repo.sendOptimistic("c1", "salut", "fr", sender)

        val request = sentRequest("message:c1")
        assertThat(request.clientMessageId).isEqualTo(cmid)
        assertThat(request.effectFlags).isNull()
        assertThat(request.isBlurred).isNull()
        assertThat(request.isViewOnce).isNull()
        assertThat(request.ephemeralDuration).isNull()
        assertThat(request.expiresAt).isNull()
    }

    /**
     * **Le corps envoye porte un `clientMessageId` au format que le gateway
     * EXIGE** (#4624).
     *
     * Le temoin voisin epingle `request.clientMessageId == cmid` : la coherence
     * du client AVEC LUI-MEME, vraie quel que soit le prefixe. Il est reste
     * vert pendant que TOUT envoi Android etait rejete en 400. Ce qui manquait
     * est le FORMAT, et il appartient au serveur — les trois portes le
     * declarent a l'identique :
     * `routes/conversations/messages-send.ts:56` (REST),
     * `validation/socket-event-schemas.ts:24` (socket),
     * `routes/links/types.ts:99` (lien anonyme).
     *
     * Le litteral est RECOPIE plutot que derive d'`OutboxIds` : une constante
     * partagee avec la source ferait passer ce temoin par construction, et
     * c'est justement la construction qui etait fausse.
     */
    @Test
    fun `sendOptimistic puts a gateway-shaped clientMessageId on the wire`() = runTest {
        val repo = repository(FakeMessageApi(ApiResponse(success = false, error = "offline")))

        val cmid = repo.sendOptimistic("c1", "salut", "fr", sender)

        val serverContract =
            "^cid_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
        assertThat(sentRequest("message:c1").clientMessageId).matches(serverContract)
        assertThat(cmid).matches(serverContract)
    }

    @Test
    fun `sendOptimistic encodes the chosen effects onto the outbox request`() = runTest {
        val repo = repository(FakeMessageApi(ApiResponse(success = false, error = "offline")), clock = MutableClock(0L))
        val effects = MessageEffects(
            flags = MessageEffectFlags.GLOW or MessageEffectFlags.VIEW_ONCE or MessageEffectFlags.EPHEMERAL,
            ephemeralDuration = 300,
            maxViewOnceCount = 2,
        )

        repo.sendOptimistic("c1", "secret", "fr", sender, effects = effects)

        val request = sentRequest("message:c1")
        assertThat(request.effectFlags)
            .isEqualTo((MessageEffectFlags.GLOW or MessageEffectFlags.VIEW_ONCE or MessageEffectFlags.EPHEMERAL).toInt())
        assertThat(request.isViewOnce).isTrue()
        assertThat(request.ephemeralDuration).isEqualTo(300)
        assertThat(request.expiresAt).isEqualTo("1970-01-01T00:05:00Z")
        assertThat(request.maxViewOnceCount).isEqualTo(2)
    }

    @Test
    fun `sendOptimistic surfaces the effects on the optimistic bubble`() = runTest {
        val repo = repository(FakeMessageApi(ApiResponse(success = false, error = "offline")))

        val cmid = repo.sendOptimistic(
            "c1", "peekaboo", "fr", sender,
            effects = MessageEffects(flags = MessageEffectFlags.BLURRED),
        )

        assertThat(cachedApiMessage(cmid).effects.has(MessageEffectFlags.BLURRED)).isTrue()
    }

    @Test
    fun `sendOptimistic without attachments carries null attachmentIds and no dependency`() = runTest {
        val repo = repository(FakeMessageApi(ApiResponse(success = false, error = "offline")))

        val cmid = repo.sendOptimistic("c1", "salut", "fr", sender)

        val row = outbox.deliverable("message:c1").single { it.cmid == cmid }
        assertThat(OutboxDependencyKey.decode(row.dependsOn)).isEmpty()
        assertThat(sentRequest("message:c1").attachmentIds).isNull()
        assertThat(cachedApiMessage(cmid).messageType).isEqualTo("text")
    }

    @Test
    fun `sendOptimistic with an upload carries the placeholder id and gates on the upload`() = runTest {
        val repo = repository(FakeMessageApi(ApiResponse(success = false, error = "offline")))

        val cmid = repo.sendOptimistic(
            "c1", "", "fr", sender,
            messageType = "file",
            attachmentUploadCmids = listOf("upload-cmid"),
            attachments = listOf(
                ApiMessageAttachment(id = "upload-cmid", fileName = "paste.txt", mimeType = "text/plain"),
            ),
        )

        val row = outbox.deliverable("message:c1").single { it.cmid == cmid }
        assertThat(OutboxDependencyKey.decode(row.dependsOn)).containsExactly("upload-cmid")
        val request = sentRequest("message:c1")
        assertThat(request.attachmentIds).containsExactly("upload-cmid")
        assertThat(request.messageType).isEqualTo("file")
    }

    @Test
    fun `sendOptimistic shows the attachment on the SENDING bubble instantly`() = runTest {
        val repo = repository(FakeMessageApi(ApiResponse(success = false, error = "offline")))

        val cmid = repo.sendOptimistic(
            "c1", "", "fr", sender,
            messageType = "file",
            attachmentUploadCmids = listOf("upload-cmid"),
            attachments = listOf(
                ApiMessageAttachment(id = "upload-cmid", fileName = "paste.txt", mimeType = "text/plain"),
            ),
        )

        val bubble = cachedApiMessage(cmid)
        assertThat(bubble.messageType).isEqualTo("file")
        assertThat(bubble.attachments.map { it.fileName }).containsExactly("paste.txt")
    }

    @Test
    fun `sendOptimistic dedupes blank upload cmids out of the dependency and payload`() = runTest {
        val repo = repository(FakeMessageApi(ApiResponse(success = false, error = "offline")))

        val cmid = repo.sendOptimistic(
            "c1", "hi", "fr", sender,
            attachmentUploadCmids = listOf("  ", "u1", "u1"),
        )

        val row = outbox.deliverable("message:c1").single { it.cmid == cmid }
        assertThat(OutboxDependencyKey.decode(row.dependsOn)).containsExactly("u1")
        assertThat(sentRequest("message:c1").attachmentIds).containsExactly("u1")
    }

    @Test
    fun `retrySend preserves the effects from the cached bubble`() = runTest {
        val repo = repository(FakeMessageApi(ApiResponse(success = false, error = "n/a")), clock = MutableClock(0L))
        val cmid = repo.sendOptimistic(
            "c1", "secret", "fr", sender,
            effects = MessageEffects(flags = MessageEffectFlags.VIEW_ONCE),
        )
        outbox.markSucceeded(cmid)
        repo.markSendFailed(cmid)

        repo.retrySend(cmid)

        val request = sentRequest("message:c1")
        assertThat(request.isViewOnce).isTrue()
        assertThat(request.effectFlags).isEqualTo(MessageEffectFlags.VIEW_ONCE.toInt())
    }

    @Test
    fun `refresh keeps the optimistic bubble the server does not know yet`() = runTest {
        val api = FakeMessageApi(ApiResponse(success = true, data = listOf(apiMessage("m1"))))
        val repo = repository(api)

        val cmid = repo.sendOptimistic("c1", "salut", "fr", sender)
        repo.refresh("c1")

        assertThat(streamedMessages(repo).map { it.id }).containsExactly("m1", cmid)
    }

    @Test
    fun `refresh reconciles the bubble once the server list echoes its clientMessageId`() = runTest {
        val api = FakeMessageApi(ApiResponse(success = true, data = emptyList()))
        val repo = repository(api)
        val cmid = repo.sendOptimistic("c1", "salut", "fr", sender)

        api.response = ApiResponse(
            success = true,
            data = listOf(apiMessage("srv1", clientMessageId = cmid)),
        )
        repo.refresh("c1")

        val rows = streamedMessages(repo)
        assertThat(rows.map { it.id }).containsExactly("srv1")
        assertThat(rows.single().sendState).isNull()
    }

    @Test
    fun `reconcileSent swaps the local bubble for the server message atomically`() = runTest {
        val repo = repository(FakeMessageApi(ApiResponse(success = false, error = "n/a")))
        val cmid = repo.sendOptimistic("c1", "salut", "fr", sender)

        repo.reconcileSent(cmid, apiMessage("srv1", clientMessageId = cmid))

        val rows = streamedMessages(repo)
        assertThat(rows.map { it.id }).containsExactly("srv1")
        assertThat(rows.single().sendState).isNull()
    }

    @Test
    fun `markSendFailed flips the bubble to FAILED`() = runTest {
        val repo = repository(FakeMessageApi(ApiResponse(success = false, error = "n/a")))
        val cmid = repo.sendOptimistic("c1", "salut", "fr", sender)

        repo.markSendFailed(cmid)

        assertThat(streamedMessages(repo).single().sendState)
            .isEqualTo(LocalSendState.FAILED.name)
    }

    @Test
    fun `retrySend revives the exhausted outbox row and flips back to SENDING`() = runTest {
        val repo = repository(FakeMessageApi(ApiResponse(success = false, error = "n/a")))
        val cmid = repo.sendOptimistic("c1", "salut", "fr", sender)
        outbox.markExhausted(cmid, "gave up")
        repo.markSendFailed(cmid)

        repo.retrySend(cmid)

        assertThat(streamedMessages(repo).single().sendState)
            .isEqualTo(LocalSendState.SENDING.name)
        val row = outbox.deliverable("message:c1").single()
        assertThat(row.cmid).isEqualTo(cmid)
        assertThat(row.stateEnum).isEqualTo(OutboxState.PENDING)
    }

    @Test
    fun `retrySend re-enqueues from the cached payload when the outbox row is gone`() = runTest {
        val repo = repository(FakeMessageApi(ApiResponse(success = false, error = "n/a")))
        val cmid = repo.sendOptimistic("c1", "salut", "fr", sender)
        outbox.markSucceeded(cmid)
        repo.markSendFailed(cmid)

        repo.retrySend(cmid)

        assertThat(outbox.deliverable("message:c1").map { it.cmid }).containsExactly(cmid)
    }

    @Test
    fun `sendOptimistic forwards carry the forwarded-from refs on the bubble and the queued request`() = runTest {
        val repo = repository(FakeMessageApi(ApiResponse(success = false, error = "offline")))

        val cmid = repo.sendOptimistic(
            conversationId = "c2",
            content = "salut",
            originalLanguage = "fr",
            sender = sender,
            forwardedFromId = "orig-msg",
            forwardedFromConversationId = "c1",
        )

        val bubble = cachedMessage(cmid)
        assertThat(bubble.forwardedFromId).isEqualTo("orig-msg")
        assertThat(bubble.forwardedFromConversationId).isEqualTo("c1")

        val row = outbox.deliverable("message:c2").single()
        assertThat(row.cmid).isEqualTo(cmid)
        val request = MeeshyApi.json.decodeFromString<SendMessageRequest>(row.payload)
        assertThat(request.forwardedFromId).isEqualTo("orig-msg")
        assertThat(request.forwardedFromConversationId).isEqualTo("c1")
    }

    @Test
    fun `a non-forward send carries no forwarded-from refs`() = runTest {
        val repo = repository(FakeMessageApi(ApiResponse(success = false, error = "offline")))

        val cmid = repo.sendOptimistic("c1", "salut", "fr", sender)

        val request = MeeshyApi.json.decodeFromString<SendMessageRequest>(
            outbox.deliverable("message:c1").single().payload,
        )
        assertThat(request.forwardedFromId).isNull()
        assertThat(request.forwardedFromConversationId).isNull()
    }

    @Test
    fun `retrySend preserves the forwarded-from refs when re-enqueuing from the cached payload`() = runTest {
        val repo = repository(FakeMessageApi(ApiResponse(success = false, error = "n/a")))
        val cmid = repo.sendOptimistic(
            conversationId = "c2",
            content = "salut",
            originalLanguage = "fr",
            sender = sender,
            forwardedFromId = "orig-msg",
            forwardedFromConversationId = "c1",
        )
        outbox.markSucceeded(cmid)
        repo.markSendFailed(cmid)

        repo.retrySend(cmid)

        val request = MeeshyApi.json.decodeFromString<SendMessageRequest>(
            outbox.deliverable("message:c2").single().payload,
        )
        assertThat(request.forwardedFromId).isEqualTo("orig-msg")
        assertThat(request.forwardedFromConversationId).isEqualTo("c1")
    }

    @Test
    fun `sendOptimistic story replies carry the storyReplyToId on the bubble and the queued request`() = runTest {
        val repo = repository(FakeMessageApi(ApiResponse(success = false, error = "offline")))

        val cmid = repo.sendOptimistic(
            conversationId = "c1",
            content = "check this out",
            originalLanguage = "fr",
            sender = sender,
            storyReplyToId = "story-1",
        )

        val bubble = cachedMessage(cmid)
        assertThat(bubble.storyReplyToId).isEqualTo("story-1")

        val request = MeeshyApi.json.decodeFromString<SendMessageRequest>(
            outbox.deliverable("message:c1").single().payload,
        )
        assertThat(request.storyReplyToId).isEqualTo("story-1")
    }

    @Test
    fun `a non-story send carries no storyReplyToId`() = runTest {
        val repo = repository(FakeMessageApi(ApiResponse(success = false, error = "offline")))

        val cmid = repo.sendOptimistic("c1", "salut", "fr", sender)

        val request = MeeshyApi.json.decodeFromString<SendMessageRequest>(
            outbox.deliverable("message:c1").single().payload,
        )
        assertThat(request.storyReplyToId).isNull()
        assertThat(cachedMessage(cmid).storyReplyToId).isNull()
    }

    @Test
    fun `retrySend preserves the storyReplyToId when re-enqueuing from the cached payload`() = runTest {
        val repo = repository(FakeMessageApi(ApiResponse(success = false, error = "n/a")))
        val cmid = repo.sendOptimistic(
            conversationId = "c1",
            content = "check this out",
            originalLanguage = "fr",
            sender = sender,
            storyReplyToId = "story-1",
        )
        outbox.markSucceeded(cmid)
        repo.markSendFailed(cmid)

        repo.retrySend(cmid)

        val request = MeeshyApi.json.decodeFromString<SendMessageRequest>(
            outbox.deliverable("message:c1").single().payload,
        )
        assertThat(request.storyReplyToId).isEqualTo("story-1")
    }

    private suspend fun cachedMessage(id: String): ApiMessage =
        MeeshyApi.json.decodeFromString(db.messageDao().find(id)!!.payload)

    @Test
    fun `toggleReactionOptimistic add bumps the summary instantly and queues ADD_REACTION`() = runTest {
        val repo = repository(
            FakeMessageApi(ApiResponse(success = true, data = listOf(apiMessage("m1")))),
        )
        repo.refresh("c1")

        val applied = repo.toggleReactionOptimistic("m1", "❤️", isAdding = true)

        assertThat(applied).isTrue()
        assertThat(cachedMessage("m1").reactionSummary).containsEntry("❤️", 1)
        val row = outbox.deliverable(OutboxLanes.REACTION).single()
        assertThat(row.kindEnum).isEqualTo(OutboxKind.ADD_REACTION)
        assertThat(row.targetId).isEqualTo("m1")
        assertThat(row.payload).contains("❤️")
    }

    @Test
    fun `toggleReactionOptimistic remove decrements and drops the emoji at zero`() = runTest {
        val repo = repository(
            FakeMessageApi(
                ApiResponse(
                    success = true,
                    data = listOf(
                        apiMessage("m1").copy(reactionSummary = mapOf("❤️" to 1, "🔥" to 3)),
                    ),
                ),
            ),
        )
        repo.refresh("c1")

        repo.toggleReactionOptimistic("m1", "❤️", isAdding = false)

        val summary = cachedMessage("m1").reactionSummary
        assertThat(summary).doesNotContainKey("❤️")
        assertThat(summary).containsEntry("🔥", 3)
        assertThat(outbox.deliverable(OutboxLanes.REACTION).single().kindEnum)
            .isEqualTo(OutboxKind.REMOVE_REACTION)
    }

    @Test
    fun `toggleReactionOptimistic refuses a bubble the server does not know yet`() = runTest {
        val repo = repository(FakeMessageApi(ApiResponse(success = false, error = "n/a")))
        val cmid = repo.sendOptimistic("c1", "salut", "fr", sender)

        val applied = repo.toggleReactionOptimistic(cmid, "❤️", isAdding = true)

        assertThat(applied).isFalse()
        assertThat(outbox.deliverable(OutboxLanes.REACTION)).isEmpty()
    }

    @Test
    fun `applyReactionDelta updates the cached summary without touching the outbox`() = runTest {
        val repo = repository(
            FakeMessageApi(ApiResponse(success = true, data = listOf(apiMessage("m1")))),
        )
        repo.refresh("c1")

        repo.applyReactionDelta("m1", "🔥", delta = 1)

        assertThat(cachedMessage("m1").reactionSummary).containsEntry("🔥", 1)
        assertThat(outbox.deliverable(OutboxLanes.REACTION)).isEmpty()
    }

    @Test
    fun `editOptimistic rewrites the cached message and queues EDIT_MESSAGE`() = runTest {
        val translated = apiMessage("m1").copy(
            translations = listOf(
                ApiTextTranslation(targetLanguage = "en", translatedContent = "hi there"),
            ),
        )
        val repo = repository(FakeMessageApi(ApiResponse(success = true, data = listOf(translated))))
        repo.refresh("c1")

        val applied = repo.editOptimistic("m1", "bonjour")

        assertThat(applied).isTrue()
        val message = cachedMessage("m1")
        assertThat(message.content).isEqualTo("bonjour")
        assertThat(message.isEdited).isTrue()
        assertThat(message.translations).isEmpty()
        val row = outbox.deliverable("message:c1").single()
        assertThat(row.kindEnum).isEqualTo(OutboxKind.EDIT_MESSAGE)
        assertThat(row.targetId).isEqualTo("m1")
        assertThat(row.payload).contains("bonjour")
    }

    @Test
    fun `editOptimistic refuses a bubble the server does not know yet`() = runTest {
        val repo = repository(FakeMessageApi(ApiResponse(success = false, error = "n/a")))
        val cmid = repo.sendOptimistic("c1", "salut", "fr", sender)

        val applied = repo.editOptimistic(cmid, "changed")

        assertThat(applied).isFalse()
        assertThat(cachedMessage(cmid).content).isEqualTo("salut")
        assertThat(outbox.deliverable("message:c1").single().kindEnum)
            .isEqualTo(OutboxKind.SEND_MESSAGE)
    }

    @Test
    fun `setPinnedOptimistic pin stamps pinnedAt and queues PIN_MESSAGE`() = runTest {
        val repo = repository(
            FakeMessageApi(ApiResponse(success = true, data = listOf(apiMessage("m1")))),
            clock = MutableClock(1_700_000_000_000),
        )
        repo.refresh("c1")

        val applied = repo.setPinnedOptimistic("m1", pin = true)

        assertThat(applied).isTrue()
        assertThat(cachedMessage("m1").pinnedAt).isNotNull()
        val row = outbox.deliverable(OutboxLanes.PIN).single()
        assertThat(row.kindEnum).isEqualTo(OutboxKind.PIN_MESSAGE)
        assertThat(row.targetId).isEqualTo("m1")
        assertThat(row.payload).contains("c1")
    }

    @Test
    fun `setPinnedOptimistic unpin clears pinnedAt and queues UNPIN_MESSAGE`() = runTest {
        val repo = repository(
            FakeMessageApi(
                ApiResponse(
                    success = true,
                    data = listOf(apiMessage("m1").copy(pinnedAt = "2026-07-08T10:00:00Z")),
                ),
            ),
        )
        repo.refresh("c1")

        val applied = repo.setPinnedOptimistic("m1", pin = false)

        assertThat(applied).isTrue()
        assertThat(cachedMessage("m1").pinnedAt).isNull()
        assertThat(outbox.deliverable(OutboxLanes.PIN).single().kindEnum)
            .isEqualTo(OutboxKind.UNPIN_MESSAGE)
    }

    @Test
    fun `setPinnedOptimistic refuses a bubble the server does not know yet`() = runTest {
        val repo = repository(FakeMessageApi(ApiResponse(success = false, error = "n/a")))
        val cmid = repo.sendOptimistic("c1", "salut", "fr", sender)

        val applied = repo.setPinnedOptimistic(cmid, pin = true)

        assertThat(applied).isFalse()
        assertThat(cachedMessage(cmid).pinnedAt).isNull()
        assertThat(outbox.deliverable(OutboxLanes.PIN)).isEmpty()
    }

    @Test
    fun `loadOlder pages backwards from the oldest synced message`() = runTest {
        val api = FakeMessageApi(
            response = ApiResponse(
                success = true,
                data = listOf(apiMessage("m3", createdAt = T3), apiMessage("m2", createdAt = T2)),
            ),
            olderResponse = ApiResponse(
                success = true,
                data = listOf(apiMessage("m1", createdAt = T1)),
                pagination = Pagination(hasMore = false),
            ),
        )
        val repo = repository(api)
        repo.refresh("c1")

        val hasMore = repo.loadOlder("c1")

        assertThat(api.lastBefore).isEqualTo("m2")
        assertThat(hasMore).isFalse()
        assertThat(streamedMessages(repo).map { it.id })
            .containsExactly("m1", "m2", "m3")
            .inOrder()
    }

    @Test
    fun `loadOlder reports more history when the server says so`() = runTest {
        val api = FakeMessageApi(
            response = ApiResponse(success = true, data = listOf(apiMessage("m2", createdAt = T2))),
            olderResponse = ApiResponse(
                success = true,
                data = listOf(apiMessage("m1", createdAt = T1)),
                pagination = Pagination(hasMore = true),
            ),
        )
        val repo = repository(api)
        repo.refresh("c1")

        assertThat(repo.loadOlder("c1")).isTrue()
    }

    @Test
    fun `loadOlder leaves the freshness watermark untouched`() = runTest {
        val clock = MutableClock(1_000)
        val api = FakeMessageApi(
            response = ApiResponse(success = true, data = listOf(apiMessage("m2", createdAt = T2))),
            olderResponse = ApiResponse(
                success = true,
                data = listOf(apiMessage("m1", createdAt = T1)),
                pagination = Pagination(hasMore = false),
            ),
        )
        val repo = repository(api, clock = clock)
        repo.refresh("c1")
        clock.now = 5_000

        repo.loadOlder("c1")

        assertThat(db.syncMetaDao().observe("messages:c1").first()).isEqualTo(1_000)
    }

    @Test
    fun `loadOlder does nothing on a cache with no synced message`() = runTest {
        val api = FakeMessageApi(ApiResponse(success = false, error = "n/a"))
        val repo = repository(api)
        repo.sendOptimistic("c1", "salut", "fr", sender)

        val hasMore = repo.loadOlder("c1")

        assertThat(hasMore).isTrue()
        assertThat(api.listCalls).isEqualTo(0)
    }

    @Test
    fun `loadOlder throws when the network fails`() = runTest {
        val api = FakeMessageApi(
            response = ApiResponse(success = true, data = listOf(apiMessage("m2", createdAt = T2))),
            olderResponse = ApiResponse(success = false, error = "down"),
        )
        val repo = repository(api)
        repo.refresh("c1")

        val thrown = runCatching { repo.loadOlder("c1") }.exceptionOrNull()

        assertThat(thrown).isInstanceOf(MessageSyncException::class.java)
    }

    @Test
    fun `messagesStream observes only a bounded recent window, not the whole synced history`() = runTest {
        // 30 rows land inside a single recent-window fetch; #5189's bounded
        // observe (MessageRepository.INITIAL_HISTORY_WINDOW) trims the
        // OLDEST rows off, keeping the newest 30 — never the full 35 Room holds.
        val api = FakeMessageApi(
            response = ApiResponse(
                success = true,
                data = (1..35).map { i -> apiMessage("m$i", createdAt = isoAt(i)) },
            ),
        )
        val repo = repository(api)
        repo.refresh("c1")

        val observed = repo.messagesStream("c1").first().valueOrEmpty().map { it.message.id }

        assertThat(observed).hasSize(30)
        assertThat(observed).containsNoneOf("m1", "m2", "m3", "m4", "m5")
        assertThat(observed).contains("m35")
    }

    @Test
    fun `loadOlder extends the bounded window so newly-fetched older rows become visible`() = runTest {
        val api = FakeMessageApi(
            response = ApiResponse(
                success = true,
                // The 30-row recent window, already at the bound.
                data = (6..35).map { i -> apiMessage("m$i", createdAt = isoAt(i)) },
            ),
            olderResponse = ApiResponse(
                success = true,
                data = (1..5).map { i -> apiMessage("m$i", createdAt = isoAt(i)) },
                pagination = Pagination(hasMore = false),
            ),
        )
        val repo = repository(api)
        repo.refresh("c1")
        val before = repo.messagesStream("c1").first().valueOrEmpty().map { it.message.id }
        assertThat(before).doesNotContain("m5")

        repo.loadOlder("c1")

        val after = repo.messagesStream("c1").first().valueOrEmpty().map { it.message.id }
        assertThat(after).containsAtLeast("m1", "m2", "m3", "m4", "m5")
    }

    @Test
    fun `refresh keeps paginated history outside the window it fetched`() = runTest {
        val api = FakeMessageApi(
            response = ApiResponse(
                success = true,
                data = listOf(apiMessage("m3", createdAt = T3), apiMessage("m2", createdAt = T2)),
            ),
            olderResponse = ApiResponse(
                success = true,
                data = listOf(apiMessage("m1", createdAt = T1)),
                pagination = Pagination(hasMore = false),
            ),
        )
        val repo = repository(api)
        repo.refresh("c1")
        repo.loadOlder("c1")

        api.response = ApiResponse(
            success = true,
            data = listOf(apiMessage("m4", createdAt = T4), apiMessage("m3", createdAt = T3)),
        )
        repo.refresh("c1")

        assertThat(streamedMessages(repo).map { it.id })
            .containsExactly("m1", "m2", "m3", "m4")
            .inOrder()
    }

    @Test
    fun `refresh still prunes deletions inside the fetched window`() = runTest {
        val api = FakeMessageApi(
            response = ApiResponse(
                success = true,
                data = listOf(
                    apiMessage("m3", createdAt = T3),
                    apiMessage("m2", createdAt = T2),
                    apiMessage("m1", createdAt = T1),
                ),
            ),
        )
        val repo = repository(api)
        repo.refresh("c1")

        api.response = ApiResponse(
            success = true,
            data = listOf(apiMessage("m3", createdAt = T3), apiMessage("m1", createdAt = T1)),
        )
        repo.refresh("c1")

        assertThat(streamedMessages(repo).map { it.id })
            .containsExactly("m1", "m3")
            .inOrder()
    }

    @Test
    fun `deleteOptimistic tombstones the cached message and queues DELETE_MESSAGE`() = runTest {
        val repo = repository(
            FakeMessageApi(ApiResponse(success = true, data = listOf(apiMessage("m1")))),
        )
        repo.refresh("c1")

        val applied = repo.deleteOptimistic("m1")

        assertThat(applied).isTrue()
        val message = cachedMessage("m1")
        assertThat(message.deletedAt).isNotNull()
        assertThat(message.content).isEmpty()
        assertThat(message.translations).isEmpty()
        val row = outbox.deliverable("message:c1").single()
        assertThat(row.kindEnum).isEqualTo(OutboxKind.DELETE_MESSAGE)
        assertThat(row.targetId).isEqualTo("m1")
    }

    @Test
    fun `applyReadReceipt upgrades own messages up to the frontier`() = runTest {
        val repo = repository(
            FakeMessageApi(
                ApiResponse(
                    success = true,
                    data = listOf(
                        apiMessage("m1", createdAt = T1).copy(senderId = "me"),
                        apiMessage("m2", createdAt = T2).copy(senderId = "me"),
                        apiMessage("m3", createdAt = T4).copy(senderId = "me"),
                    ),
                ),
            ),
        )
        repo.refresh("c1")

        repo.applyReadReceipt(
            conversationId = "c1",
            ownSenderId = "me",
            deliveredCount = 2,
            readCount = 1,
            frontierIso = T3,
        )

        assertThat(cachedMessage("m1").readCount).isEqualTo(1)
        assertThat(cachedMessage("m1").deliveredCount).isEqualTo(2)
        assertThat(cachedMessage("m2").readCount).isEqualTo(1)
        assertThat(cachedMessage("m3").readCount).isEqualTo(0)
        assertThat(cachedMessage("m3").deliveredCount).isEqualTo(0)
    }

    @Test
    fun `applyReadReceipt leaves peer messages untouched`() = runTest {
        val repo = repository(
            FakeMessageApi(
                ApiResponse(
                    success = true,
                    data = listOf(apiMessage("m1", createdAt = T1).copy(senderId = "other")),
                ),
            ),
        )
        repo.refresh("c1")

        repo.applyReadReceipt(
            conversationId = "c1",
            ownSenderId = "me",
            deliveredCount = 1,
            readCount = 1,
            frontierIso = T2,
        )

        assertThat(cachedMessage("m1").readCount).isEqualTo(0)
        assertThat(cachedMessage("m1").deliveredCount).isEqualTo(0)
    }

    @Test
    fun `applyReadReceipt skips optimistic bubbles the server does not know yet`() = runTest {
        val repo = repository(FakeMessageApi(ApiResponse(success = false, error = "n/a")))
        val cmid = repo.sendOptimistic("c1", "salut", "fr", sender)

        repo.applyReadReceipt(
            conversationId = "c1",
            ownSenderId = "me",
            deliveredCount = 1,
            readCount = 1,
            frontierIso = T4,
        )

        assertThat(cachedMessage(cmid).readCount).isEqualTo(0)
        assertThat(cachedMessage(cmid).deliveredCount).isEqualTo(0)
    }

    @Test
    fun `applyReadReceipt never downgrades a read message`() = runTest {
        val repo = repository(
            FakeMessageApi(
                ApiResponse(
                    success = true,
                    data = listOf(
                        apiMessage("m1", createdAt = T1)
                            .copy(senderId = "me", deliveredCount = 3, readCount = 2),
                    ),
                ),
            ),
        )
        repo.refresh("c1")

        repo.applyReadReceipt(
            conversationId = "c1",
            ownSenderId = "me",
            deliveredCount = 1,
            readCount = 0,
            frontierIso = T2,
        )

        assertThat(cachedMessage("m1").readCount).isEqualTo(2)
        assertThat(cachedMessage("m1").deliveredCount).isEqualTo(3)
    }

    @Test
    fun `applyReadReceipt with no delivery progress is a no-op`() = runTest {
        val repo = repository(
            FakeMessageApi(
                ApiResponse(
                    success = true,
                    data = listOf(apiMessage("m1", createdAt = T1).copy(senderId = "me")),
                ),
            ),
        )
        repo.refresh("c1")

        repo.applyReadReceipt(
            conversationId = "c1",
            ownSenderId = "me",
            deliveredCount = 0,
            readCount = 0,
            frontierIso = T2,
        )

        assertThat(cachedMessage("m1").readCount).isEqualTo(0)
        assertThat(cachedMessage("m1").deliveredCount).isEqualTo(0)
    }

    @Test
    fun `applyTranslation upserts a translation into the cached message without an outbox row`() = runTest {
        val repo = repository(
            FakeMessageApi(ApiResponse(success = true, data = listOf(apiMessage("m1")))),
        )
        repo.refresh("c1")

        repo.applyTranslation("m1", "fr", "Bonjour")

        val message = cachedMessage("m1")
        assertThat(message.translations.map { it.targetLanguage }).containsExactly("fr")
        assertThat(message.translations.single().translatedContent).isEqualTo("Bonjour")
        assertThat(outbox.deliverable("message:c1")).isEmpty()
    }

    @Test
    fun `applyTranslation replaces the existing translation for the same language`() = runTest {
        val seeded = apiMessage("m1").copy(
            translations = listOf(ApiTextTranslation(targetLanguage = "fr", translatedContent = "Salut")),
        )
        val repo = repository(FakeMessageApi(ApiResponse(success = true, data = listOf(seeded))))
        repo.refresh("c1")

        repo.applyTranslation("m1", "fr", "Bonjour")

        val message = cachedMessage("m1")
        assertThat(message.translations).hasSize(1)
        assertThat(message.translations.single().translatedContent).isEqualTo("Bonjour")
    }

    @Test
    fun `applyTranslation is inert on an unknown message id`() = runTest {
        val repo = repository(
            FakeMessageApi(ApiResponse(success = true, data = listOf(apiMessage("m1")))),
        )
        repo.refresh("c1")

        repo.applyTranslation("ghost", "fr", "Bonjour")

        assertThat(cachedMessage("m1").translations).isEmpty()
    }

    @Test
    fun `applyTranslation ignores a blank translation`() = runTest {
        val repo = repository(
            FakeMessageApi(ApiResponse(success = true, data = listOf(apiMessage("m1")))),
        )
        repo.refresh("c1")

        repo.applyTranslation("m1", "fr", "   ")

        assertThat(cachedMessage("m1").translations).isEmpty()
    }

    @Test
    fun `applyTranscription upserts a transcription onto the audio attachment without an outbox row`() = runTest {
        val seeded = apiMessage("m1").copy(
            attachments = listOf(ApiMessageAttachment(id = "a1", mimeType = "audio/m4a")),
        )
        val repo = repository(FakeMessageApi(ApiResponse(success = true, data = listOf(seeded))))
        repo.refresh("c1")

        repo.applyTranscription("m1", "a1", "Hello there", "en", 0.9, 4200L)

        val attachment = cachedMessage("m1").attachments.single()
        assertThat(attachment.transcription?.text).isEqualTo("Hello there")
        assertThat(attachment.transcription?.language).isEqualTo("en")
        assertThat(outbox.deliverable("message:c1")).isEmpty()
    }

    @Test
    fun `applyTranscription falls back to the single audio attachment when no id is given`() = runTest {
        val seeded = apiMessage("m1").copy(
            attachments = listOf(ApiMessageAttachment(id = "a1", mimeType = "audio/m4a")),
        )
        val repo = repository(FakeMessageApi(ApiResponse(success = true, data = listOf(seeded))))
        repo.refresh("c1")

        repo.applyTranscription("m1", null, "Voice note", null, null, null)

        assertThat(cachedMessage("m1").attachments.single().transcription?.text).isEqualTo("Voice note")
    }

    @Test
    fun `applyTranscription is inert on an unknown message id`() = runTest {
        val seeded = apiMessage("m1").copy(
            attachments = listOf(ApiMessageAttachment(id = "a1", mimeType = "audio/m4a")),
        )
        val repo = repository(FakeMessageApi(ApiResponse(success = true, data = listOf(seeded))))
        repo.refresh("c1")

        repo.applyTranscription("ghost", "a1", "Hello", "en", null, null)

        assertThat(cachedMessage("m1").attachments.single().transcription).isNull()
    }

    @Test
    fun `applyTranscription ignores a blank transcription`() = runTest {
        val seeded = apiMessage("m1").copy(
            attachments = listOf(ApiMessageAttachment(id = "a1", mimeType = "audio/m4a")),
        )
        val repo = repository(FakeMessageApi(ApiResponse(success = true, data = listOf(seeded))))
        repo.refresh("c1")

        repo.applyTranscription("m1", "a1", "   ", "en", null, null)

        assertThat(cachedMessage("m1").attachments.single().transcription).isNull()
    }

    @Test
    fun `applyAudioTranslation upserts a cloned-voice translation onto the audio attachment without an outbox row`() = runTest {
        val seeded = apiMessage("m1").copy(
            attachments = listOf(ApiMessageAttachment(id = "a1", mimeType = "audio/m4a")),
        )
        val repo = repository(FakeMessageApi(ApiResponse(success = true, data = listOf(seeded))))
        repo.refresh("c1")

        repo.applyAudioTranslation("m1", "a1", "es", "https://cdn/es.mp3", "hola", 5200L, "mp3", true, 0.9, "vm-1", "xtts")

        val translation = cachedMessage("m1").attachments.single().translations!!.getValue("es")
        assertThat(translation.url).isEqualTo("https://cdn/es.mp3")
        assertThat(translation.transcription).isEqualTo("hola")
        assertThat(translation.cloned).isTrue()
        assertThat(outbox.deliverable("message:c1")).isEmpty()
    }

    @Test
    fun `applyAudioTranslation falls back to the single audio attachment when no id is given`() = runTest {
        val seeded = apiMessage("m1").copy(
            attachments = listOf(ApiMessageAttachment(id = "a1", mimeType = "audio/m4a")),
        )
        val repo = repository(FakeMessageApi(ApiResponse(success = true, data = listOf(seeded))))
        repo.refresh("c1")

        repo.applyAudioTranslation("m1", null, "es", "https://cdn/es.mp3", "hola", null, null, false, null, null, null)

        assertThat(cachedMessage("m1").attachments.single().translations!!.getValue("es").url)
            .isEqualTo("https://cdn/es.mp3")
    }

    @Test
    fun `applyAudioTranslation is inert on an unknown message id`() = runTest {
        val seeded = apiMessage("m1").copy(
            attachments = listOf(ApiMessageAttachment(id = "a1", mimeType = "audio/m4a")),
        )
        val repo = repository(FakeMessageApi(ApiResponse(success = true, data = listOf(seeded))))
        repo.refresh("c1")

        repo.applyAudioTranslation("ghost", "a1", "es", "https://cdn/es.mp3", "hola", null, null, false, null, null, null)

        assertThat(cachedMessage("m1").attachments.single().translations).isNull()
    }

    @Test
    fun `applyAudioTranslation ignores a blank url`() = runTest {
        val seeded = apiMessage("m1").copy(
            attachments = listOf(ApiMessageAttachment(id = "a1", mimeType = "audio/m4a")),
        )
        val repo = repository(FakeMessageApi(ApiResponse(success = true, data = listOf(seeded))))
        repo.refresh("c1")

        repo.applyAudioTranslation("m1", "a1", "es", "   ", "hola", null, null, false, null, null, null)

        assertThat(cachedMessage("m1").attachments.single().translations).isNull()
    }

    @Test
    fun `recentMessages returns the cached tail in chronological order`() = runTest {
        val repo = repository(
            FakeMessageApi(
                ApiResponse(
                    success = true,
                    data = listOf(
                        apiMessage("m1", createdAt = T1),
                        apiMessage("m2", createdAt = T2),
                        apiMessage("m3", createdAt = T3),
                        apiMessage("m4", createdAt = T4),
                    ),
                ),
            ),
        )
        repo.refresh("c1")

        val recent = repo.recentMessages("c1", limit = 3)

        assertThat(recent.map { it.message.id }).containsExactly("m2", "m3", "m4").inOrder()
    }

    @Test
    fun `recentMessages never calls the network`() = runTest {
        val api = FakeMessageApi(
            ApiResponse(success = true, data = listOf(apiMessage("m1", createdAt = T1))),
        )
        val repo = repository(api)
        repo.refresh("c1")
        api.listCalls = 0

        repo.recentMessages("c1", limit = 5)

        assertThat(api.listCalls).isEqualTo(0)
    }

    @Test
    fun `recentMessages on a cold conversation is empty`() = runTest {
        val repo = repository(FakeMessageApi(ApiResponse(success = false, error = "down")))

        assertThat(repo.recentMessages("ghost", limit = 5)).isEmpty()
    }

    @Test
    fun `recentMessages reports each row's local send state`() = runTest {
        val clock = MutableClock(now = 1_000L)
        val repo = repository(
            FakeMessageApi(
                ApiResponse(
                    success = true,
                    data = listOf(apiMessage("m1", createdAt = java.time.Instant.ofEpochMilli(1_000L).toString())),
                ),
            ),
            clock = clock,
        )
        repo.refresh("c1")
        clock.now = 2_000L
        repo.sendOptimistic(
            conversationId = "c1",
            content = "hi",
            originalLanguage = "fr",
            sender = sender,
        )

        val recent = repo.recentMessages("c1", limit = 5)

        assertThat(recent.map { it.sendState }).containsExactly(LocalSendState.SYNCED, LocalSendState.SENDING)
    }
}
