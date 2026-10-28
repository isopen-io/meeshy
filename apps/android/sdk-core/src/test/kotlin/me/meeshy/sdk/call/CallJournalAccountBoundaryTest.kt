package me.meeshy.sdk.call

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.mockk
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.runBlocking
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.Pagination
import me.meeshy.sdk.model.call.CallHistoryPeer
import me.meeshy.sdk.model.call.CallJournalQuery
import me.meeshy.sdk.model.call.CallRecord
import me.meeshy.sdk.net.SessionTransitionFlags
import me.meeshy.sdk.net.api.CallHistoryApi
import me.meeshy.sdk.outbox.OutboxOwnerSource
import me.meeshy.sdk.session.AccountFence
import me.meeshy.sdk.session.PerAccountCache
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * #13560 — the call journal answers a search (Manqués, a type, a typed name) from a memory cache. That memory belongs
 * to the account that searched: it never survives the account's close, and a search answered after A signed out never
 * fills it for B.
 */
@RunWith(RobolectricTestRunner::class)
class CallJournalAccountBoundaryTest {

    private class Owner(var id: String?) : OutboxOwnerSource {
        override fun currentOwnerId(): String? = id
    }

    private lateinit var db: MeeshyDatabase
    private val owner = Owner("A")
    private val transition = SessionTransitionFlags()
    private val fence = AccountFence(owner, transition)
    private val api: CallHistoryApi = mockk(relaxed = true)
    private val clock = object : CacheClock {
        override fun nowMillis(): Long = 1_700_000_000_000L
    }
    private val search = CallJournalQuery(search = "zoe")

    @Before
    fun setUp() {
        db = Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext(), MeeshyDatabase::class.java)
            .allowMainThreadQueries()
            .build()
    }

    @After
    fun tearDown() = db.close()

    private fun repository() = CallHistoryRepository(api, db, db.callHistoryDao(), db.syncMetaDao(), clock, fence)

    private val callOfA = CallRecord(
        callId = "appel-de-A",
        conversationId = "c1",
        conversationType = "direct",
        mode = "p2p",
        status = "ended",
        direction = "incoming",
        isVideo = false,
        startedAt = "2026-10-20T10:00:00Z",
        durationSec = 0,
        peer = CallHistoryPeer(userId = "u-zoe", username = "zoe", displayName = "Zoé"),
    )

    private fun answers(vararg records: CallRecord) =
        ApiResponse(success = true, data = records.toList(), pagination = Pagination(hasMore = false))

    private fun goOffline() {
        coEvery { api.history(any(), any(), any(), any(), any()) } returns ApiResponse(success = false, error = "offline")
    }

    private suspend fun signOutThenSignInAsB(wipeAlso: suspend () -> Unit = {}) {
        owner.id = null
        transition.bumpGeneration()
        fence.close {
            db.clearAllTables()
            wipeAlso()
        }
        owner.id = "B"
        transition.bumpGeneration()
    }

    @Test
    fun `a search of A is forgotten when A's account closes`(): Unit = runBlocking {
        coEvery { api.history(any(), any(), any(), any(), any()) } returns answers(callOfA)
        val repository = repository()
        repository.journalStream(search, "?").toList()

        signOutThenSignInAsB { (repository as PerAccountCache).clear() }
        goOffline()

        assertThat(repository.journalStream(search, "?").first()).isEqualTo(CacheResult.Empty)
    }

    @Test
    fun `a search of A answered after A signed out never fills B's memory`(): Unit = runBlocking {
        val repository = repository()
        coEvery { api.history(any(), any(), any(), any(), any()) } coAnswers {
            signOutThenSignInAsB()
            answers(callOfA)
        }
        repository.journalStream(search, "?").toList()
        goOffline()

        assertThat(repository.journalStream(search, "?").first()).isEqualTo(CacheResult.Empty)
    }

    @Test
    fun `a search of the account still signed in is remembered`(): Unit = runBlocking {
        coEvery { api.history(any(), any(), any(), any(), any()) } returns answers(callOfA)
        val repository = repository()
        repository.journalStream(search, "?").toList()
        goOffline()

        val again = repository.journalStream(search, "?").first()

        assertThat((again as CacheResult.Stale).value.map { it.callId }).containsExactly("appel-de-A")
    }
}
