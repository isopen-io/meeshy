package me.meeshy.sdk.conversation

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.mockk
import java.io.IOException
import java.time.Instant
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import me.meeshy.core.database.entity.SyncMetaEntity
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.cache.purge.RoomCachePayloadStores
import me.meeshy.sdk.model.mediacache.CacheDataKind
import me.meeshy.sdk.model.mediacache.CacheDomain
import me.meeshy.sdk.e2ee.EndToEndRegimeLedger
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.CursorPagination
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.MessagePinChanged
import me.meeshy.sdk.model.MessagesApiResponse
import me.meeshy.sdk.net.api.MessageApi
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import retrofit2.Response

/**
 * The gateway's two reads of a thread, over ONE server-side history [served] (mutable: a test changes the server
 * between two revalidations):
 * - the recent window ([listConditional]): the newest [window] messages, newest first, with an `ETag` that is a pure
 *   function of the page's content — the SAME page answers 304 to the validator it was served with (`sendWithETag`,
 *   `services/gateway/src/routes/conversations/messages-list.ts`);
 * - the forward sweep ([listAfter], #5206): `createdAt > after`, ascending, `hasMore` measured by a `limit + 1` probe.
 * Every other route stays unanswered: a revalidation never needs it.
 */
private class GatewayMessageHistory(
    var served: List<ApiMessage>,
    private val window: Int = Int.MAX_VALUE,
) : MessageApi by mockk<MessageApi>() {
    val validators: MutableList<String?> = mutableListOf()
    val listAfterCalls: MutableList<String> = mutableListOf()
    var notModified: Int = 0

    private fun millisOf(message: ApiMessage): Long = Instant.parse(message.createdAt!!).toEpochMilli()

    override suspend fun listConditional(
        conversationId: String,
        ifNoneMatch: String?,
    ): Response<ApiResponse<List<ApiMessage>>> {
        validators += ifNoneMatch
        val envelope = ApiResponse(success = true, data = served.sortedByDescending { millisOf(it) }.take(window))
        val etag = "\"${envelope.hashCode()}\""
        if (ifNoneMatch == etag) {
            notModified += 1
            return Response.error("".toResponseBody(null), windowNotModifiedRawResponse())
        }
        return Response.success(envelope, okhttp3.Headers.headersOf("ETag", etag))
    }

    override suspend fun listAfter(conversationId: String, after: String, limit: Int?): MessagesApiResponse {
        listAfterCalls += after
        val afterMillis = Instant.parse(after).toEpochMilli()
        val appliedLimit = limit ?: 20
        val matching = served.filter { millisOf(it) > afterMillis }.sortedBy { millisOf(it) }
        return MessagesApiResponse(
            success = true,
            data = matching.take(appliedLimit),
            cursorPagination = CursorPagination(nextCursor = null, hasMore = matching.size > appliedLimit, limit = appliedLimit),
        )
    }
}

/** A raw 304: Retrofit's `(Int, ResponseBody)` error factory requires `code >= 400`. #5188. */
private fun windowNotModifiedRawResponse(): okhttp3.Response =
    okhttp3.Response.Builder()
        .code(304)
        .message("Not Modified")
        .protocol(okhttp3.Protocol.HTTP_1_1)
        .request(okhttp3.Request.Builder().url("http://localhost/").build())
        .build()

/**
 * #18915 — what a revalidation of a thread reads, and what it may prune.
 *
 * It reads the RECENT WINDOW every time, conditionally (a 304 without a body when nothing changed): that is the only
 * read that sees what happened to messages ALREADY held — `after=` only serves messages created after the newest one
 * held. The forward sweep (#5206) only fills a gap the page does not reach back over. And a page is built BEFORE it
 * arrives: a message written while it was in flight (socket, my send acknowledged) is unknown to it, so only what was
 * held before the request may be declared deleted by its absence.
 */
@RunWith(RobolectricTestRunner::class)
class MessageWindowRevalidationTest {

    private fun message(
        id: String,
        at: String,
        senderId: String = "u-peer",
        clientMessageId: String? = null,
        content: String = "texte $id",
    ) = ApiMessage(
        id = id,
        conversationId = CONVERSATION,
        senderId = senderId,
        content = content,
        clientMessageId = clientMessageId,
        createdAt = at,
    )

    private fun page(vararg messages: ApiMessage) = Response.success(ApiResponse(success = true, data = messages.toList()))

    private fun MessageCollaboratorHarness.repository(api: MessageApi) = MessageRepository(
        api,
        mockk(relaxed = true),
        database,
        database.messageDao(),
        database.syncMetaDao(),
        outbox,
        clock,
        regime = EndToEndRegimeKeeper(EndToEndRegimeLedger.None, database),
    )

    private suspend fun MessageCollaboratorHarness.held(vararg messages: ApiMessage) = messages.forEach { seedSynced(it) }

    private suspend fun MessageCollaboratorHarness.ids(): List<String> =
        database.messageDao().listForConversation(CONVERSATION).sortedBy { it.createdAt }.map { it.id }

    /** What a stream emission paints, oldest first. */
    private fun CacheResult<List<LocalMessage>>.shownIds(): List<String> = when (this) {
        is CacheResult.Fresh -> value
        is CacheResult.Stale -> value
        is CacheResult.Syncing -> value.orEmpty()
        CacheResult.Empty -> emptyList()
    }.map { it.message.id }

    // — what the page may prune —

    @Test
    fun `a message the socket writes while the recent window is in flight survives the page that predates it`() =
        runHarnessTest { harness ->
            val api = mockk<MessageApi> {
                coEvery { listConditional(CONVERSATION, any()) } coAnswers {
                    MessageIngestPipeline(harness.database).ingest(listOf(message("m3", T3)), harness.clock.now)
                    page(message("m1", T1))
                }
            }

            harness.repository(api).refresh(CONVERSATION)

            assertThat(harness.database.messageDao().find("m1")).isNotNull()
            assertThat(harness.database.messageDao().find("m3")).isNotNull()
        }

    @Test
    fun `my message acknowledged while the recent window is in flight survives the page that predates it`() =
        runHarnessTest { harness ->
            harness.held(message("m1", T1))
            lateinit var repo: MessageRepository
            lateinit var cid: String
            val api = mockk<MessageApi> {
                coEvery { listAfter(CONVERSATION, any(), any()) } throws IOException("offline")
                coEvery { listConditional(CONVERSATION, any()) } coAnswers {
                    repo.reconcileSent(cid, message("m3", T3, senderId = "me", clientMessageId = cid))
                    page(message("m1", T1))
                }
            }
            repo = harness.repository(api)
            cid = repo.sendOptimistic(CONVERSATION, "salut", "fr", MeeshyUser(id = "me", username = "me"))

            repo.refresh(CONVERSATION)

            assertThat(harness.database.messageDao().find("m3")).isNotNull()
            assertThat(harness.database.messageDao().find("m1")).isNotNull()
        }

    // — what the page may overwrite: reactions and pin, unless a write landed on the row during its flight (#18915, F4) —

    @Test
    fun `a reaction the socket brings while the recent window is in flight survives the page that predates it`() =
        runHarnessTest { harness ->
            harness.held(message("m1", T1))
            lateinit var repo: MessageRepository
            val api = mockk<MessageApi> {
                coEvery { listConditional(CONVERSATION, any()) } coAnswers {
                    repo.applyReactionDelta("m1", "👍", 1)
                    page(message("m1", T1))
                }
            }
            repo = harness.repository(api)

            repo.refresh(CONVERSATION)

            assertThat(harness.cachedMessage("m1").reactionSummary).containsExactly("👍", 1)
        }

    @Test
    fun `a pin the socket brings while the recent window is in flight survives the page that predates it`() =
        runHarnessTest { harness ->
            harness.held(message("m1", T1))
            val deltas = MessageDeltaApplier(harness.database, harness.updater, harness.clock)
            val api = mockk<MessageApi> {
                coEvery { listConditional(CONVERSATION, any()) } coAnswers {
                    deltas.apply(MessagePinChanged("m1", CONVERSATION, pinned = true, pinnedAt = T2, pinnedBy = "u-peer"), viewerId = "me")
                    page(message("m1", T1))
                }
            }

            harness.repository(api).refresh(CONVERSATION)

            assertThat(harness.cachedMessage("m1").pinnedAt).isEqualTo(T2)
        }

    /** The boundary of the two above: a row nothing wrote during the flight takes the page's reactions and pin, emptied. */
    @Test
    fun `a reaction withdrawn and a pin removed elsewhere reach the held row at the next refresh`() =
        runHarnessTest { harness ->
            harness.held(message("m1", T1).copy(reactionSummary = mapOf("👍" to 1), pinnedAt = T2, pinnedBy = "u-peer"))
            val gateway = GatewayMessageHistory(served = listOf(message("m1", T1)))

            harness.repository(gateway).refresh(CONVERSATION)

            assertThat(harness.cachedMessage("m1").reactionSummary.orEmpty()).isEmpty()
            assertThat(harness.cachedMessage("m1").pinnedAt).isNull()
        }

    /**
     * The same withdrawal, but a write (a receipt, a translation) touched the row while the first page was in flight: that
     * page kept the stale reaction and pin out of reach of its own values. Its validator used to be kept, so every later
     * revalidation of a quiet thread was answered 304 and the stale values stayed for good. A page that disavowed part of
     * what it served leaves no validator: the next revalidation reads the window again, and corrects the row.
     */
    @Test
    fun `a reaction withdrawn while I was away leaves the row at the next quiet refresh, even when a write touched it during the first`() =
        runHarnessTest { harness ->
            harness.held(message("m1", T1).copy(reactionSummary = mapOf("👍" to 1), pinnedAt = T2, pinnedBy = "u-peer"))
            val history = GatewayMessageHistory(served = listOf(message("m1", T1)))
            var touched = false
            val gateway = object : MessageApi by history {
                override suspend fun listConditional(conversationId: String, ifNoneMatch: String?): Response<ApiResponse<List<ApiMessage>>> {
                    if (!touched) {
                        touched = true
                        harness.database.messageDao().bumpChangeVersion("m1")
                    }
                    return history.listConditional(conversationId, ifNoneMatch)
                }
            }
            val repo = harness.repository(gateway)

            repo.refresh(CONVERSATION)
            repo.refresh(CONVERSATION)

            assertThat(history.validators).hasSize(2)
            assertThat(history.validators.last()).isNull()
            assertThat(harness.cachedMessage("m1").reactionSummary.orEmpty()).isEmpty()
            assertThat(harness.cachedMessage("m1").pinnedAt).isNull()
        }

    // — what the revalidation reads: the window first —

    /**
     * The key witness: m2 was deleted on another device while this one was away (the event was never replayed). It is
     * the NEWEST message held, so a sweep `after=` m2 could never see it go; the window can.
     */
    @Test
    fun `a message deleted elsewhere leaves the thread at the next refresh`() = runHarnessTest { harness ->
        harness.held(message("m1", T1), message("m2", T2))
        val gateway = GatewayMessageHistory(served = listOf(message("m1", T1)))

        harness.repository(gateway).refresh(CONVERSATION)

        assertThat(harness.database.messageDao().find("m2")).isNull()
        assertThat(harness.ids()).containsExactly("m1")
    }

    @Test
    fun `an edit made elsewhere and a read of my message reach the held rows at the next refresh`() =
        runHarnessTest { harness ->
            harness.held(message("m1", T1, content = "avant"), message("m2", T2, senderId = "me"))
            val gateway = GatewayMessageHistory(
                served = listOf(
                    message("m1", T1, content = "après").copy(isEdited = true, editedAt = T3),
                    message("m2", T2, senderId = "me").copy(readCount = 1),
                ),
            )

            harness.repository(gateway).refresh(CONVERSATION)

            assertThat(harness.cachedMessage("m1").content).isEqualTo("après")
            assertThat(harness.cachedMessage("m1").isEdited).isTrue()
            assertThat(harness.cachedMessage("m2").readCount).isEqualTo(1)
        }

    /**
     * The #5206 promise, kept where it holds: nothing changed costs one conditional request answered 304 without a body,
     * no forward sweep, no row rewritten. And the revalidation still counts (AND-07): the thread is fresh again, so the
     * next Room write — a receipt, a translation — starts no new request.
     */
    @Test
    fun `a refresh that finds nothing new costs one conditional request answered 304 and still marks the thread fresh`() =
        runHarnessTest { harness ->
            val gateway = GatewayMessageHistory(served = listOf(message("m1", T1)))
            val repo = harness.repository(gateway)
            repo.refresh(CONVERSATION)
            val primed = harness.database.syncMetaDao().etag(KEY)
            val cachedAt = harness.database.messageDao().find("m1")?.cachedAt
            harness.clock.now += 60_000

            repo.refresh(CONVERSATION)

            assertThat(primed).isNotNull()
            assertThat(gateway.validators).hasSize(2)
            assertThat(gateway.validators.first()).isNull()
            assertThat(gateway.validators.last()).isEqualTo(primed)
            assertThat(gateway.notModified).isEqualTo(1)
            assertThat(gateway.listAfterCalls).isEmpty()
            assertThat(harness.database.messageDao().find("m1")?.cachedAt).isEqualTo(cachedAt)
            assertThat(harness.database.syncMetaDao().lastSyncedAt(KEY)).isEqualTo(harness.clock.now)
        }

    /** M3 — a push prefetched P ahead of m2 and m3, which no push carried: the window brings them back. */
    @Test
    fun `the messages a push prefetched ahead of come back with the recent window`() = runHarnessTest { harness ->
        harness.held(message("m1", T1), message("p", T5))
        val gateway = GatewayMessageHistory(
            served = listOf(message("m1", T1), message("m2", T2), message("m3", T3), message("p", T5)),
        )

        harness.repository(gateway).refresh(CONVERSATION)

        assertThat(harness.ids()).containsExactly("m1", "m2", "m3", "p").inOrder()
    }

    @Test
    fun `no forward sweep runs while the page reaches back to what was held`() = runHarnessTest { harness ->
        harness.held(message("m1", T1))
        val gateway = GatewayMessageHistory(served = listOf(message("m1", T1), message("m2", T2)))

        harness.repository(gateway).refresh(CONVERSATION)

        assertThat(gateway.listAfterCalls).isEmpty()
        assertThat(harness.ids()).containsExactly("m1", "m2").inOrder()
    }

    // — the gap beyond the window (#5206) —

    @Test
    fun `a gap wider than the recent window is filled by one after request from the newest message held`() =
        runHarnessTest { harness ->
            harness.held(message("m1", T1), message("m2", T2))
            val gateway = GatewayMessageHistory(
                served = listOf(message("m1", T1), message("m2", T2), message("m3", T3), message("m4", T4), message("m5", T5)),
                window = 2,
            )

            harness.repository(gateway).refresh(CONVERSATION)

            assertThat(gateway.validators).hasSize(1)
            assertThat(gateway.listAfterCalls).containsExactly(T2)
            assertThat(harness.ids()).containsExactly("m1", "m2", "m3", "m4", "m5").inOrder()
        }

    /** The sweep is append-only: neither held message is in what it reads, and neither is pruned. */
    @Test
    fun `a gap sweep never deletes a local message`() = runHarnessTest { harness ->
        harness.held(message("m1", T1), message("m5", T5))
        val gateway = GatewayMessageHistory(
            served = listOf(message("m1", T1), message("m5", T5), message("m6", T6)),
            window = 1,
        )

        harness.repository(gateway).refresh(CONVERSATION)

        assertThat(gateway.listAfterCalls).containsExactly(T5)
        assertThat(harness.ids()).containsExactly("m1", "m5", "m6").inOrder()
    }

    /**
     * A sweep whose `hasMore` cannot be proven either way reads as a failure: nothing of it is trusted, and the window
     * is not written without it — written alone, it would raise the high-water mark over the gap for good. The refresh
     * fails, the thread stays as it was.
     */
    @Test
    fun `a malformed after response writes nothing, the gap stays visible to the next revalidation`() =
        runHarnessTest { harness ->
            harness.held(message("m1", T1))
            val gateway = object : MessageApi by GatewayMessageHistory(served = listOf(message("m1", T1), message("m2", T2)), window = 1) {
                override suspend fun listAfter(conversationId: String, after: String, limit: Int?) =
                    MessagesApiResponse(success = true, data = emptyList(), cursorPagination = null)
            }

            val refreshed = runCatching { harness.repository(gateway).refresh(CONVERSATION) }

            assertThat(refreshed.exceptionOrNull()).isInstanceOf(MessageSyncException::class.java)
            assertThat(harness.ids()).containsExactly("m1")
            assertThat(harness.database.syncMetaDao().lastSyncedAt(KEY)).isNull()
        }

    // — the thread as it opens: `cacheFirstFlow` revalidates inside `transformLatest` (#18915, F1) —

    /**
     * Opening a thread revalidates INSIDE the stream's `transformLatest`: any Room write of that revalidation makes the
     * stream emit, which cancels the revalidation still running. Written before the sweep, the window cancelled the very
     * sweep it needed, and made the thread fresh with its high-water mark above the gap — 25 messages missed with no push,
     * five of them never shown. The window and the gap are read first, then land in ONE write.
     */
    @Test
    fun `opening a thread after more missed messages than the window shows every one of them`() =
        runHarnessTest(startMillis = System.currentTimeMillis()) { harness ->
            val served = (1..27).map { message(id = "m%02d".format(it), at = minute(it)) }
            harness.held(served[0], served[1])
            val history = GatewayMessageHistory(served = served, window = 20)
            var windowVisibleWhenSweepAsked: Boolean? = null
            var syncedWhenSweepAsked: Long? = -1L
            val gateway = object : MessageApi by history {
                override suspend fun listAfter(conversationId: String, after: String, limit: Int?): MessagesApiResponse {
                    windowVisibleWhenSweepAsked = harness.database.messageDao().find("m27") != null
                    syncedWhenSweepAsked = harness.database.syncMetaDao().lastSyncedAt(KEY)
                    return history.listAfter(conversationId, after, limit)
                }
            }

            val opened = harness.repository(gateway).messagesStream(CONVERSATION)
                .first { it is CacheResult.Fresh && it.value.any { local -> local.message.id == "m27" } }

            assertThat(windowVisibleWhenSweepAsked).isFalse()
            assertThat(syncedWhenSweepAsked).isNull()
            assertThat(history.listAfterCalls.first()).isEqualTo(minute(2))
            assertThat(opened.shownIds()).containsExactlyElementsIn(served.map { it.id }).inOrder()
            assertThat(harness.database.syncMetaDao().lastSyncedAt(KEY)).isEqualTo(harness.clock.now)
        }

    /**
     * The sweep fails: nothing is written — no window, no `sync_meta` — so the thread stays stale with its gap still
     * ahead of the next revalidation, and since nothing was written the stream does not emit again: no reread loop. The
     * stream stays open for a quiet spell AFTER the failure, so a loop — a write, an emission, a new request, a new
     * failure — would show itself. The failure that reaches the screen names no internal identifier: the thread shows
     * its own localized notice, never this text.
     */
    @Test
    fun `a thread whose gap cannot be read stays stale, unwritten, and asks no more`() =
        runHarnessTest(startMillis = System.currentTimeMillis()) { harness ->
            val served = (1..27).map { message(id = "m%02d".format(it), at = minute(it)) }
            harness.held(served[0], served[1])
            val syncedBefore = harness.clock.now - THREE_MINUTES
            harness.database.syncMetaDao().upsert(SyncMetaEntity(KEY, syncedBefore))
            val history = GatewayMessageHistory(served = served, window = 20)
            val gateway = object : MessageApi by history {
                override suspend fun listAfter(conversationId: String, after: String, limit: Int?): MessagesApiResponse =
                    throw IOException("offline")
            }
            val seen = mutableListOf<CacheResult<List<LocalMessage>>>()
            val failures = mutableListOf<Throwable>()

            val settled = coroutineScope {
                val outcome = CompletableDeferred<String>()
                val opening = launch {
                    harness.repository(gateway)
                        .messagesStream(
                            CONVERSATION,
                            onSyncError = { failure ->
                                failures += failure
                                outcome.complete("failed: ${failure::class.simpleName}")
                            },
                        )
                        .collect { result ->
                            seen += result
                            if (result is CacheResult.Fresh) outcome.complete("fresh")
                        }
                }
                outcome.await().also {
                    withContext(Dispatchers.Default) { delay(QUIET_SPELL_MILLIS) }
                    opening.cancel()
                }
            }

            assertThat(settled).isEqualTo("failed: MessageSyncException")
            assertThat(failures).hasSize(1)
            assertThat(failures.single().message.orEmpty()).doesNotContain(CONVERSATION)
            assertThat(seen.map { it::class }).containsExactly(CacheResult.Stale::class)
            assertThat(harness.database.messageDao().find("m27")).isNull()
            assertThat(harness.database.syncMetaDao().lastSyncedAt(KEY)).isEqualTo(syncedBefore)
            assertThat(history.validators).hasSize(1)
        }

    // — the validator of the recent window (#5188) —

    @Test
    fun `the first-ever refresh sends no If-None-Match`() = runHarnessTest { harness ->
        val gateway = GatewayMessageHistory(served = listOf(message("m1", T1)))

        harness.repository(gateway).refresh(CONVERSATION)

        assertThat(gateway.validators).hasSize(1)
        assertThat(gateway.validators.single()).isNull()
    }

    @Test
    fun `refresh when the server changed gets 200, a replaced validator, and updates Room`() = runHarnessTest { harness ->
        val gateway = GatewayMessageHistory(served = listOf(message("m1", T1)))
        val repo = harness.repository(gateway)
        repo.refresh(CONVERSATION)
        val etagBefore = harness.database.syncMetaDao().etag(KEY)

        gateway.served = listOf(message("m1", T1), message("m2", T2))
        repo.refresh(CONVERSATION)

        assertThat(etagBefore).isNotNull()
        assertThat(harness.database.syncMetaDao().etag(KEY)).isNotEqualTo(etagBefore)
        assertThat(gateway.notModified).isEqualTo(0)
        assertThat(harness.ids()).containsExactly("m1", "m2").inOrder()
    }

    // — a purged thread (#19050): its validator leaves with its messages —

    private fun MessageCollaboratorHarness.retention() = MessageRetentionPurger(
        database, database.messageDao(), database.pendingIdDao(), database.editRevisionDao(), database.ephemeralReceiptDao(), outbox,
    )

    /**
     * The cache purge empties every thread. Its validator, kept, made the first conditional request after the purge come
     * back 304 — which confirmed an EMPTY thread as fresh, for good on a quiet thread.
     */
    @Test
    fun `a thread emptied by the cache purge is read again without If-None-Match, and its messages come back`() =
        runHarnessTest { harness ->
            val gateway = GatewayMessageHistory(served = listOf(message("m1", T1), message("m2", T2)))
            val repo = harness.repository(gateway)
            repo.refresh(CONVERSATION)

            RoomCachePayloadStores(harness.database).store(CacheDataKind.MESSAGES, CacheDomain.CONVERSATIONS)!!.clear()
            repo.refresh(CONVERSATION)

            assertThat(gateway.validators).containsExactly(null, null).inOrder()
            assertThat(gateway.notModified).isEqualTo(0)
            assertThat(harness.ids()).containsExactly("m1", "m2").inOrder()
        }

    @Test
    fun `a thread purged whole by the retention is read again without If-None-Match`() = runHarnessTest { harness ->
        val gateway = GatewayMessageHistory(served = listOf(message("m1", T1)))
        val repo = harness.repository(gateway)
        repo.refresh(CONVERSATION)

        harness.retention().purgeConversation(CONVERSATION)
        repo.refresh(CONVERSATION)

        assertThat(gateway.validators).containsExactly(null, null).inOrder()
        assertThat(harness.ids()).containsExactly("m1")
    }

    /** A quiet thread whose every message is older than the retention window: the pass empties it, its validator goes. */
    @Test
    fun `a thread the retention ages out is read again without If-None-Match`() = runHarnessTest { harness ->
        val gateway = GatewayMessageHistory(served = listOf(message("m1", T1)))
        val repo = harness.repository(gateway)
        repo.refresh(CONVERSATION)

        harness.retention().run(nowMillis = Instant.parse(T1).toEpochMilli() + ONE_YEAR)
        repo.refresh(CONVERSATION)

        assertThat(gateway.validators).containsExactly(null, null).inOrder()
        assertThat(harness.ids()).containsExactly("m1")
    }

    /** A thread the retention only trims keeps nothing stale to confirm: the other threads keep their validator. */
    @Test
    fun `the retention leaves the validator of a thread it did not touch`() = runHarnessTest { harness ->
        val gateway = GatewayMessageHistory(served = listOf(message("m1", T1)))
        val repo = harness.repository(gateway)
        repo.refresh(CONVERSATION)
        val primed = harness.database.syncMetaDao().etag(KEY)

        harness.retention().run(nowMillis = Instant.parse(T1).toEpochMilli() + ONE_DAY)

        assertThat(primed).isNotNull()
        assertThat(harness.database.syncMetaDao().etag(KEY)).isEqualTo(primed)
    }

    /** A strictly increasing server instant, one minute per message. */
    private fun minute(index: Int): String = Instant.ofEpochSecond(BASE_SECOND + index * 60L).toString()

    private companion object {
        const val CONVERSATION = "c1"
        const val KEY = "messages:$CONVERSATION"
        const val BASE_SECOND = 1_780_000_000L
        const val THREE_MINUTES = 180_000L
        const val ONE_DAY = 86_400_000L
        const val ONE_YEAR = 365L * ONE_DAY

        /** Real time the stream stays open after a failure: ample for an in-memory reread loop to show itself. */
        const val QUIET_SPELL_MILLIS = 300L
        const val T1 = "2026-06-01T10:00:00Z"
        const val T2 = "2026-06-01T11:00:00Z"
        const val T3 = "2026-06-01T12:00:00Z"
        const val T4 = "2026-06-01T13:00:00Z"
        const val T5 = "2026-06-01T14:00:00Z"
        const val T6 = "2026-06-01T15:00:00Z"
    }
}
