package me.meeshy.sdk.conversation

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import java.time.Instant
import java.util.concurrent.atomic.AtomicInteger
import kotlin.time.Duration.Companion.seconds
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.decodeFromString
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.core.database.dao.SearchIndexDao
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.mediahub.ConversationMediaHubIndex
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiConversationLastMessage
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.AttachmentDeletedEvent
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.Pagination
import me.meeshy.sdk.model.sync.SyncConversationRow
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.net.api.ConversationApi
import me.meeshy.sdk.outbox.OutboxRepository
import me.meeshy.sdk.search.LocalSearchIndex
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.sync.SyncAccountProvider
import me.meeshy.sdk.sync.SyncDeltaFetching
import me.meeshy.sdk.sync.SyncDeltaOutcome
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import retrofit2.Response

/**
 * #18926 — a sweep read before a live write lands after it: its page — or its `/sync` delta — never takes the row back
 * (compare-and-swap, facet by facet), whoever wrote it — a `message:new`, an `attachment:deleted`, a read on this device —
 * while a preview that went back on the server goes back.
 * #18927 — the list runs one sweep at a time per account: callers join it, a catch-up adds exactly one more, and a caller
 * of the next account never joins the sweep of the one that left.
 */
@RunWith(RobolectricTestRunner::class)
class ConversationCacheSourceLiveSweepTest {

    private lateinit var db: MeeshyDatabase

    @Before
    fun setUp() {
        db = Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext(), MeeshyDatabase::class.java)
            .allowMainThreadQueries()
            .build()
    }

    @After
    fun tearDown() = db.close()

    private val clock = object : CacheClock {
        override fun nowMillis() = 1_700_000_000_000L
    }

    private val journal = ConversationLiveJournal()

    private fun group(lastId: String, at: String) = ApiConversation(
        id = "c1",
        type = "group",
        title = "Groupe",
        lastMessage = ApiConversationLastMessage(id = lastId, content = "texte $lastId", createdAt = at),
        updatedAt = at,
    )

    private fun page(vararg rows: ApiConversation) = Response.success(
        ApiResponse(success = true, data = rows.toList(), pagination = Pagination(total = rows.size, offset = 0, limit = 100, hasMore = false)),
    )

    private fun source(
        api: ConversationApi,
        sync: SyncDeltaFetching = SyncDeltaFetching.None,
        accounts: SyncAccountProvider = SyncAccountProvider.None,
    ) = ConversationCacheSource(
        db, db.conversationDao(), db.syncMetaDao(), api, clock, LocalSearchIndex(SearchIndexDao(db)),
        accountProvider = accounts,
        syncDelta = sync,
        journal = journal,
    )

    private fun repository(api: ConversationApi) = ConversationRepository(
        conversationApi = api,
        database = db,
        conversationDao = db.conversationDao(),
        syncMetaDao = db.syncMetaDao(),
        outboxRepository = OutboxRepository(db, db.outboxDao()),
        liveJournal = journal,
    )

    private fun peerMessage(id: String, at: String) =
        ApiMessage(id = id, conversationId = "c1", senderId = "u-peer", content = "nouveau", createdAt = at)

    private fun patcher() = ConversationLivePatcher(
        database = db,
        conversationDao = db.conversationDao(),
        messageDao = db.messageDao(),
        conversationApi = mockk(relaxed = true),
        session = mockk<SessionRepository> {
            every { currentUser } returns MutableStateFlow(MeeshyUser(id = "me", username = "me", systemLanguage = "fr"))
        },
        readerLabel = object : ReaderLabelProvider {
            override fun youLabel(): String = "Vous"
        },
        journal = journal,
    )

    private suspend fun cached(): ApiConversation? =
        db.conversationDao().find("c1")?.let { MeeshyApi.json.decodeFromString<ApiConversation>(it.payload) }

    @Test
    fun `a message received while a sweep read before it is in flight keeps the preview and the rank it brought`() = runTest {
        val api = mockk<ConversationApi>()
        coEvery { api.listConditional(any(), any(), any(), any()) } returns page(group("m1", T1))
        source(api).revalidate()
        val live = patcher()
        coEvery { api.listConditional(any(), any(), any(), any()) } coAnswers {
            live.applyMessage(peerMessage("m2", T2))
            page(group("m1", T1))
        }

        source(api).revalidate()

        assertThat(cached()!!.lastMessage?.id).isEqualTo("m2")
        assertThat(db.conversationDao().find("c1")!!.updatedAt).isEqualTo(Instant.parse(T2).toEpochMilli())
    }

    /**
     * The `/sync` delta of a warm cache is read first, and its line ranks the row by the `updatedAt` it was built with: the
     * rank a `message:new` raised during its flight stays. The rich re-read it triggers finds nothing here, so what is
     * checked is what the delta itself wrote.
     */
    @Test
    fun `a message received while a sync delta read before it is in flight keeps the rank it brought`() = runTest {
        val api = mockk<ConversationApi>()
        coEvery { api.listConditional(any(), any(), any(), any()) } returns page(group("m1", T1))
        source(api).revalidate()
        val live = patcher()
        val sync = SyncDeltaFetching {
            live.applyMessage(peerMessage("m2", T2))
            SyncDeltaOutcome.Delta(
                rows = listOf(SyncConversationRow(id = "c1", type = "group", title = "Renommé", isActive = true, updatedAt = T1, lastMessageAt = T1)),
                deletedIds = emptyList(),
                checkpoint = T1,
                complete = true,
                hasGap = false,
                validator = null,
            )
        }
        coEvery { api.listConditional(any(), any(), any(), any()) } returns page()

        source(api, sync).revalidate()

        assertThat(cached()!!.title).isEqualTo("Renommé")
        assertThat(cached()!!.lastMessage?.id).isEqualTo("m2")
        assertThat(db.conversationDao().find("c1")!!.updatedAt).isEqualTo(Instant.parse(T2).toEpochMilli())
    }

    @Test
    fun `an attachment deleted live while a sweep read before it is in flight stays out of the preview`() = runTest {
        val photo = ApiMessageAttachment(id = "a", mimeType = "image/jpeg")
        val withPhoto = group("m1", T1).let { it.copy(lastMessage = it.lastMessage?.copy(attachments = listOf(photo))) }
        val api = mockk<ConversationApi>()
        coEvery { api.listConditional(any(), any(), any(), any()) } returns page(withPhoto)
        source(api).revalidate()
        val applier = AttachmentDeletionApplier(db, db.messageDao(), clock, null, ConversationMediaHubIndex(null), journal = journal)
        coEvery { api.listConditional(any(), any(), any(), any()) } coAnswers {
            applier.apply(AttachmentDeletedEvent(attachmentId = "a", messageId = "m1", conversationId = "c1"))
            page(withPhoto.copy(title = "Renommé"))
        }

        source(api).revalidate()

        assertThat(cached()!!.title).isEqualTo("Renommé")
        assertThat(cached()!!.lastMessage?.attachments.orEmpty()).isEmpty()
    }

    @Test
    fun `a conversation read on this device while a sweep read before it is in flight keeps its badge at zero`() = runTest {
        val api = mockk<ConversationApi>()
        coEvery { api.listConditional(any(), any(), any(), any()) } returns page(group("m1", T1).copy(unreadCount = 3))
        val repository = repository(api)
        assertThat(repository.syncSilently()).isTrue()
        coEvery { api.listConditional(any(), any(), any(), any()) } coAnswers {
            repository.markReadLocally("c1")
            page(group("m1", T1).copy(title = "Renommé", unreadCount = 3))
        }

        assertThat(repository.syncSilently()).isTrue()

        assertThat(cached()!!.title).isEqualTo("Renommé")
        assertThat(db.conversationDao().find("c1")!!.unreadCount).isEqualTo(0)
    }

    /** The boundary: nothing live during the flight — the last message deleted while away takes the preview back. */
    @Test
    fun `a last message deleted while away takes the preview back, the sweep writing what it read`() = runTest {
        val api = mockk<ConversationApi>()
        coEvery { api.listConditional(any(), any(), any(), any()) } returns page(group("m1", T1))
        source(api).revalidate()
        coEvery { api.listConditional(any(), any(), any(), any()) } returns page(group("m0", T0))

        source(api).revalidate()

        assertThat(cached()!!.lastMessage?.id).isEqualTo("m0")
    }

    @Test
    fun `two callers during a sweep share one network read`() = runTest {
        val gate = CompletableDeferred<Unit>()
        val api = mockk<ConversationApi>()
        coEvery { api.listConditional(any(), any(), any(), any()) } coAnswers {
            gate.await()
            page(group("m1", T1))
        }
        val src = source(api)

        val first = async { src.revalidate() }
        val second = async { src.revalidate() }
        runCurrent()
        gate.complete(Unit)
        first.await()
        second.await()

        coVerify(exactly = 1) { api.listConditional(any(), any(), any(), any()) }
    }

    @Test
    fun `a catch-up asked during a sweep adds exactly one more sweep`() = runTest {
        val gate = CompletableDeferred<Unit>()
        val api = mockk<ConversationApi>()
        coEvery { api.listConditional(any(), any(), any(), any()) } coAnswers {
            gate.await()
            page(group("m1", T1))
        }
        val src = source(api)

        val running = async { src.revalidate() }
        runCurrent()
        val catchUps = List(2) { async { src.catchUp() } }
        runCurrent()
        gate.complete(Unit)
        running.await()
        catchUps.forEach { it.await() }

        coVerify(exactly = 2) { api.listConditional(any(), any(), any(), any()) }
    }

    /**
     * The sweep of the account that left still flies when the next one asks: joining it would hand the next account a sweep
     * whose writes its fence refuses — nothing would land for it. It starts its own. (Red: the call never returns.)
     */
    @Test
    fun `a caller of the next account does not join the sweep of the account that left`() = runTest(timeout = 10.seconds) {
        val reached = CompletableDeferred<Unit>()
        val leftGate = CompletableDeferred<Unit>()
        val reads = AtomicInteger()
        var active = "left"
        val api = mockk<ConversationApi>()
        coEvery { api.listConditional(any(), any(), any(), any()) } coAnswers {
            if (reads.incrementAndGet() == 1) {
                reached.complete(Unit)
                leftGate.await()
            }
            page(group("m1", T1))
        }
        val src = source(api, accounts = SyncAccountProvider { active })
        val leaving = async { src.revalidate() }
        reached.await()
        active = "next"

        src.revalidate()

        leftGate.complete(Unit)
        leaving.await()
        coVerify(exactly = 2) { api.listConditional(any(), any(), any(), any()) }
    }

    private companion object {
        const val T0 = "2023-11-14T19:00:00.000Z"
        const val T1 = "2023-11-14T20:00:00.000Z"
        const val T2 = "2023-11-14T21:00:00.000Z"
    }
}
