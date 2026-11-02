package me.meeshy.sdk.conversation

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import java.time.Instant
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.CursorPagination
import me.meeshy.sdk.model.MessagesApiResponse
import me.meeshy.sdk.model.Pagination
import me.meeshy.sdk.net.api.MessageApi
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * #14670 — opening a conversation ON an old message (a search hit): the thread observes the window
 * centred on it, never the recent page with the target out of reach, and never the gap between the two.
 */
@RunWith(RobolectricTestRunner::class)
class MessageAnchoredWindowTest {

    private fun message(id: String, minute: Int) = ApiMessage(
        id = id,
        conversationId = CONVERSATION,
        senderId = "u-peer",
        content = "texte $id",
        createdAt = Instant.ofEpochSecond(1_780_000_000L + minute * 60L).toString(),
    )

    private val recent = (100 until 130).map { message("r$it", it) }
    private val around = (40 until 61).map { message("o$it", it) }

    private fun MessageCollaboratorHarness.repository(api: MessageApi) = MessageRepository(
        api,
        mockk(relaxed = true),
        database,
        database.messageDao(),
        database.syncMetaDao(),
        outbox,
        clock,
        regime = EndToEndRegimeKeeper(me.meeshy.sdk.e2ee.EndToEndRegimeLedger.None, database),
    )

    private fun api(hasNewer: Boolean = true) = mockk<MessageApi> {
        coEvery { listConditional(CONVERSATION, any()) } returns
            retrofit2.Response.success(ApiResponse(success = true, data = recent))
        coEvery { listWindowAround(CONVERSATION, "o50", any()) } returns MessagesApiResponse(
            success = true,
            data = around,
            cursorPagination = CursorPagination(limit = 30, hasMore = true, nextCursor = "o40"),
            hasNewer = hasNewer,
        )
    }

    private suspend fun Flow<CacheResult<List<LocalMessage>>>.idsWhen(predicate: (List<String>) -> Boolean): List<String> =
        first { result -> predicate(result.ids()) }.ids()

    private fun CacheResult<List<LocalMessage>>.ids(): List<String> = when (this) {
        is CacheResult.Fresh -> value
        is CacheResult.Stale -> value
        is CacheResult.Syncing -> value.orEmpty()
        CacheResult.Empty -> emptyList()
    }.map { it.message.id }

    @Test
    fun `an anchor outside the first page opens the window centred on it, without the recent page past the gap`() =
        runHarnessTest { harness ->
            recent.forEach { harness.seedSynced(it) }
            val repo = harness.repository(api())
            val stream = repo.messagesStream(CONVERSATION)
            stream.idsWhen { "r129" in it }

            val landing = repo.loadAround(CONVERSATION, "o50")

            assertThat(landing).isEqualTo(MessageLanding.Anchored(hasNewer = true, hasOlder = true))
            val shown = stream.idsWhen { "o50" in it }
            assertThat(shown).containsExactlyElementsIn(around.map { it.id }).inOrder()
        }

    @Test
    fun `an anchor already in the recent window moves nothing and asks the server nothing`() = runHarnessTest { harness ->
        recent.forEach { harness.seedSynced(it) }
        val api = api()
        val repo = harness.repository(api)

        assertThat(repo.loadAround(CONVERSATION, "r120")).isEqualTo(MessageLanding.InWindow)
        coVerify(exactly = 0) { api.listWindowAround(any(), any(), any()) }
    }

    @Test
    fun `a message the server does not serve is not found and leaves the recent window`() = runHarnessTest { harness ->
        recent.forEach { harness.seedSynced(it) }
        val api = mockk<MessageApi> {
            coEvery { listWindowAround(CONVERSATION, "gone", any()) } returns
                MessagesApiResponse(success = true, data = recent.takeLast(3))
        }
        val repo = harness.repository(api)

        assertThat(repo.loadAround(CONVERSATION, "gone")).isEqualTo(MessageLanding.NotFound)
        assertThat(repo.loadAround(CONVERSATION, "r129")).isEqualTo(MessageLanding.InWindow)
    }

    @Test
    fun `paging newer from an anchored window walks to the present and then shows the recent rows`() =
        runHarnessTest { harness ->
            recent.forEach { harness.seedSynced(it) }
            val api = api()
            val bridge = (61 until 100).map { message("b$it", it) }
            coEvery { api.listAfter(CONVERSATION, around.last().createdAt!!, any()) } returns MessagesApiResponse(
                success = true,
                data = bridge,
                cursorPagination = CursorPagination(limit = 30, hasMore = false, nextCursor = null),
            )
            val repo = harness.repository(api)
            val stream = repo.messagesStream(CONVERSATION)
            repo.loadAround(CONVERSATION, "o50")

            val more = repo.loadNewer(CONVERSATION)

            assertThat(more).isFalse()
            val shown = stream.idsWhen { "r129" in it }
            assertThat(shown).containsExactlyElementsIn((around + bridge + recent).map { it.id }).inOrder()
        }

    @Test
    fun `sending from an anchored window returns to the present`() = runHarnessTest { harness ->
        recent.forEach { harness.seedSynced(it) }
        val repo = harness.repository(api())
        val stream = repo.messagesStream(CONVERSATION)
        repo.loadAround(CONVERSATION, "o50")
        stream.idsWhen { "o50" in it }

        repo.sendOptimistic(CONVERSATION, "salut", "fr", me.meeshy.sdk.model.MeeshyUser(id = "me", username = "me"))

        val shown = stream.idsWhen { "r129" in it }
        assertThat(shown).doesNotContain("o50")
    }

    @Test
    fun `older pages of the recent window start from its own oldest row, never from an older island`() =
        runHarnessTest { harness ->
            recent.forEach { harness.seedSynced(it) }
            around.forEach { harness.seedSynced(it) }
            val api = mockk<MessageApi> {
                coEvery { list(CONVERSATION, any(), any(), any()) } returns
                    ApiResponse(success = true, data = emptyList(), pagination = Pagination(hasMore = true))
            }
            val repo = harness.repository(api)

            repo.loadOlder(CONVERSATION)

            coVerify { api.list(CONVERSATION, any(), any(), "r100") }
        }

    @Test
    fun `back to the present from an anchored window reads the recent page, even when the cache stops in the past`() =
        runHarnessTest { harness ->
            val repo = harness.repository(api())
            repo.loadAround(CONVERSATION, "o50")

            repo.jumpToPresent(CONVERSATION)

            assertThat(repo.recentMessages(CONVERSATION, 1).map { it.message.id }).containsExactly("r129")
            assertThat(repo.loadAround(CONVERSATION, "r120")).isEqualTo(MessageLanding.InWindow)
        }

    @Test
    fun `a gap sweep that hits its page ceiling still caches the present`() = runHarnessTest { harness ->
        around.forEach { harness.seedSynced(it) }
        val present = (5_000 until 5_030).map { message("p$it", it) }
        val api = mockk<MessageApi> {
            coEvery { listConditional(CONVERSATION, any()) } returns
                retrofit2.Response.success(ApiResponse(success = true, data = present))
            coEvery { listAfter(CONVERSATION, any(), any()) } answers {
                val first = ((Instant.parse(secondArg<String>()).epochSecond - BASE_SECOND) / 60).toInt() + 1
                MessagesApiResponse(
                    success = true,
                    data = (first until first + 50).map { message("g$it", it) },
                    cursorPagination = CursorPagination(limit = 50, hasMore = true, nextCursor = null),
                )
            }
        }
        val repo = harness.repository(api)

        repo.refresh(CONVERSATION)

        assertThat(repo.recentMessages(CONVERSATION, 1).map { it.message.id }).containsExactly("p5029")
    }

    @Test
    fun `a newer page that lands while an older page grew the window still reaches the present`() =
        runHarnessTest { harness ->
            recent.forEach { harness.seedSynced(it) }
            val api = api()
            val bridge = (61 until 100).map { message("b$it", it) }
            val older = (10 until 40).map { message("e$it", it) }
            val newerServed = kotlinx.coroutines.CompletableDeferred<Unit>()
            coEvery { api.listAfter(CONVERSATION, around.last().createdAt!!, any()) } coAnswers {
                newerServed.await()
                MessagesApiResponse(
                    success = true,
                    data = bridge + recent,
                    cursorPagination = CursorPagination(limit = 30, hasMore = false, nextCursor = null),
                )
            }
            coEvery { api.list(CONVERSATION, any(), any(), "o40") } returns
                ApiResponse(success = true, data = older.reversed(), pagination = Pagination(hasMore = true))
            coEvery { api.listWindowAround(CONVERSATION, "r129", any()) } returns MessagesApiResponse(
                success = true,
                data = recent,
                cursorPagination = CursorPagination(limit = 30, hasMore = true, nextCursor = "r100"),
                hasNewer = false,
            )
            val repo = harness.repository(api)
            repo.loadAround(CONVERSATION, "o50")

            val newer = kotlinx.coroutines.coroutineScope {
                val paging = async { repo.loadNewer(CONVERSATION) }
                kotlinx.coroutines.yield()
                repo.loadOlder(CONVERSATION)
                newerServed.complete(Unit)
                paging.await()
            }

            assertThat(newer).isFalse()
            assertThat(repo.loadAround(CONVERSATION, "r129")).isEqualTo(MessageLanding.InWindow)
        }

    private companion object {
        const val CONVERSATION = "c-global"
        const val BASE_SECOND = 1_780_000_000L
    }
}
