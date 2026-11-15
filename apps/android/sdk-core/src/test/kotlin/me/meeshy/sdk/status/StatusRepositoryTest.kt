package me.meeshy.sdk.status

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import io.mockk.slot
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.ApiAuthor
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.Pagination
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.CreatePostRequest
import me.meeshy.sdk.net.api.PostApi
import me.meeshy.sdk.net.api.PostLikeRequest
import org.junit.Test
import java.io.IOException

@OptIn(ExperimentalCoroutinesApi::class)
class StatusRepositoryTest {

    private val api: PostApi = mockk(relaxed = true)
    private val repo = StatusRepository(api)

    private fun status(id: String, emoji: String = "😀", userId: String = "u_$id") = ApiPost(
        id = id,
        type = "STATUS",
        moodEmoji = emoji,
        content = "content-$id",
        author = ApiAuthor(id = userId, username = "user-$id", displayName = "User $id"),
    )

    private fun plainPost(id: String) = ApiPost(id = id, type = "POST", content = "not a status")

    private fun page(posts: List<ApiPost>, nextCursor: String?, hasMore: Boolean) =
        ApiResponse(
            success = true,
            data = posts,
            pagination = Pagination(nextCursor = nextCursor, hasMore = hasMore),
        )

    private fun <T> NetworkResult<T>.success(): T = (this as NetworkResult.Success).data
    private fun <T> NetworkResult<T>.failure(): me.meeshy.sdk.net.ApiError =
        (this as NetworkResult.Failure).error

    // ─── list ────────────────────────────────────────────────────────────────

    @Test
    fun list_friends_mapsStatusesAndCarriesWatermark() = runTest {
        coEvery { api.getStatuses(any(), any()) } returns
            page(listOf(status("a"), status("b")), nextCursor = "cur2", hasMore = true)

        val result = repo.list(StatusFeedMode.FRIENDS, cursor = "cur1", limit = 30).success()

        assertThat(result.statuses.map { it.id }).containsExactly("a", "b").inOrder()
        assertThat(result.statuses.first().moodEmoji).isEqualTo("😀")
        assertThat(result.nextCursor).isEqualTo("cur2")
        assertThat(result.hasMore).isTrue()
        coVerify(exactly = 1) { api.getStatuses("cur1", 30) }
    }

    @Test
    fun list_discover_usesDiscoverEndpoint() = runTest {
        coEvery { api.getStatusesDiscover(any(), any()) } returns
            page(listOf(status("d")), nextCursor = null, hasMore = false)

        val result = repo.list(StatusFeedMode.DISCOVER).success()

        assertThat(result.statuses.map { it.id }).containsExactly("d")
        coVerify(exactly = 1) { api.getStatusesDiscover(null, 20) }
        coVerify(exactly = 0) { api.getStatuses(any(), any()) }
    }

    @Test
    fun list_dropsNonStatusPostsFromThePage() = runTest {
        coEvery { api.getStatuses(any(), any()) } returns
            page(listOf(status("a"), plainPost("p"), status("b")), nextCursor = null, hasMore = false)

        val result = repo.list(StatusFeedMode.FRIENDS).success()

        assertThat(result.statuses.map { it.id }).containsExactly("a", "b").inOrder()
    }

    @Test
    fun list_missingPagination_defaultsHasMoreFalse() = runTest {
        coEvery { api.getStatuses(any(), any()) } returns ApiResponse(success = true, data = listOf(status("a")))

        val result = repo.list(StatusFeedMode.FRIENDS).success()

        assertThat(result.hasMore).isFalse()
        assertThat(result.nextCursor).isNull()
    }

    @Test
    fun list_failureEnvelope_becomesFailure() = runTest {
        coEvery { api.getStatuses(any(), any()) } returns
            ApiResponse(success = false, data = null, error = "nope", code = "BOOM")

        val error = repo.list(StatusFeedMode.FRIENDS).failure()

        assertThat(error.message).isEqualTo("nope")
        assertThat(error.code).isEqualTo("BOOM")
    }

    @Test
    fun list_transportError_becomesFailure() = runTest {
        coEvery { api.getStatuses(any(), any()) } throws IOException("offline")

        val error = repo.list(StatusFeedMode.FRIENDS).failure()

        assertThat(error.code).isEqualTo("NETWORK")
    }

    // ─── create ──────────────────────────────────────────────────────────────

    @Test
    fun create_postsStatusTypeAndMapsEntry() = runTest {
        val body = slot<CreatePostRequest>()
        coEvery { api.create(capture(body), any()) } returns ApiResponse(success = true, data = status("s1", emoji = "🔥"))

        val entry = repo.create(moodEmoji = "🔥", content = "hello", visibility = "FRIENDS").success()

        assertThat(entry.id).isEqualTo("s1")
        assertThat(entry.moodEmoji).isEqualTo("🔥")
        assertThat(body.captured.type).isEqualTo("STATUS")
        assertThat(body.captured.moodEmoji).isEqualTo("🔥")
        assertThat(body.captured.content).isEqualTo("hello")
        assertThat(body.captured.visibility).isEqualTo("FRIENDS")
    }

    @Test
    fun create_republish_carriesRepostAttributionInTheBody() = runTest {
        val body = slot<CreatePostRequest>()
        coEvery { api.create(capture(body), any()) } returns ApiResponse(success = true, data = status("s2", emoji = "🎉"))

        repo.create(
            moodEmoji = "🎉",
            content = "party time",
            audioUrl = "https://cdn/mood.m4a",
            repostOfId = "src-1",
            viaUsername = "alice",
        ).success()

        assertThat(body.captured.repostOfId).isEqualTo("src-1")
        assertThat(body.captured.viaUsername).isEqualTo("alice")
        assertThat(body.captured.audioUrl).isEqualTo("https://cdn/mood.m4a")
    }

    @Test
    fun create_nonStatusResponse_becomesParseFailure() = runTest {
        coEvery { api.create(any(), any()) } returns ApiResponse(success = true, data = plainPost("p1"))

        val error = repo.create(moodEmoji = "🔥", content = null).failure()

        assertThat(error.code).isEqualTo("PARSE")
    }

    @Test
    fun create_transportFailure_propagates() = runTest {
        coEvery { api.create(any(), any()) } throws IOException("offline")

        val error = repo.create(moodEmoji = "🔥", content = null).failure()

        assertThat(error.code).isEqualTo("NETWORK")
    }

    @Test
    fun create_withoutNetwork_queuesTheSameCreatePostRowWithTheCmidItSent() = runTest {
        val cmid = slot<String>()
        val row = slot<me.meeshy.sdk.outbox.OutboxMutation>()
        val outbox: me.meeshy.sdk.outbox.OutboxRepository = mockk(relaxed = true)
        coEvery { api.create(any(), capture(cmid)) } throws IOException("offline")
        coEvery { outbox.enqueue(capture(row), any()) } returns "queued"

        val error = StatusRepository(api, outbox)
            .create(moodEmoji = "🔥", content = "hello", visibility = "FRIENDS", visibilityUserIds = listOf("u1"))
            .failure()

        assertThat(error.code).isEqualTo(StatusRepository.QUEUED_OFFLINE)
        assertThat(row.captured.kind).isEqualTo(me.meeshy.sdk.outbox.OutboxKind.CREATE_POST)
        assertThat(row.captured.cmid).isEqualTo(cmid.captured)
        assertThat(row.captured.payload).contains("\"type\":\"STATUS\"")
        assertThat(row.captured.payload).contains("\"visibilityUserIds\":[\"u1\"]")
    }

    @Test
    fun create_refusedByTheGateway_isNeverQueued() = runTest {
        val outbox: me.meeshy.sdk.outbox.OutboxRepository = mockk(relaxed = true)
        coEvery { api.create(any(), any()) } throws retrofit2.HttpException(
            retrofit2.Response.error<Any>(403, okhttp3.ResponseBody.create(null, "{}")),
        )

        StatusRepository(api, outbox).create(moodEmoji = "🔥").failure()

        coVerify(exactly = 0) { outbox.enqueue(any(), any()) }
    }

    private fun row(cmid: String, request: CreatePostRequest, createdAt: Long) = me.meeshy.core.database.entity.OutboxEntity(
        cmid = cmid, lane = "post", kind = "CREATE_POST", targetId = cmid,
        payload = me.meeshy.sdk.net.MeeshyApi.json.encodeToString(CreatePostRequest.serializer(), request),
        dependsOn = null, attempts = 0, state = "PENDING", createdAt = createdAt, updatedAt = createdAt,
    )

    @Test
    fun recoverStuckMood_takesBackAMoodQueuedForMoreThanAMinuteAsADraft() = runTest {
        val outbox: me.meeshy.sdk.outbox.OutboxRepository = mockk(relaxed = true)
        val mood = CreatePostRequest(content = "hello", type = "STATUS", visibility = "FRIENDS", moodEmoji = "🔥")
        val plain = CreatePostRequest(content = "post", type = "POST")
        coEvery { outbox.pendingRows(me.meeshy.sdk.outbox.OutboxKind.CREATE_POST) } returns
            listOf(row("p", plain, 0L), row("m", mood, 1_000L))

        val draft = StatusRepository(api, outbox).recoverStuckMood(nowMillis = 100_000L)

        assertThat(draft?.emoji).isEqualTo("🔥")
        assertThat(draft?.text).isEqualTo("hello")
        assertThat(draft?.visibility).isEqualTo("FRIENDS")
        coVerify { outbox.discard("m") }
        coVerify(exactly = 0) { outbox.discard("p") }
    }

    @Test
    fun recoverStuckMood_leavesAFreshQueuedMoodAlone() = runTest {
        val outbox: me.meeshy.sdk.outbox.OutboxRepository = mockk(relaxed = true)
        val mood = CreatePostRequest(type = "STATUS", moodEmoji = "🔥")
        coEvery { outbox.pendingRows(me.meeshy.sdk.outbox.OutboxKind.CREATE_POST) } returns listOf(row("m", mood, 90_000L))

        assertThat(StatusRepository(api, outbox).recoverStuckMood(nowMillis = 100_000L)).isNull()
        coVerify(exactly = 0) { outbox.discard(any()) }
    }

    // ─── delete ──────────────────────────────────────────────────────────────

    @Test
    fun delete_callsApi() = runTest {
        coEvery { api.delete("s1") } returns ApiResponse(success = true, data = Unit)

        assertThat(repo.delete("s1")).isInstanceOf(NetworkResult.Success::class.java)
        coVerify(exactly = 1) { api.delete("s1") }
    }

    @Test
    fun delete_failurePropagates() = runTest {
        coEvery { api.delete("s1") } returns ApiResponse(success = false, error = "gone", code = "NOPE")

        assertThat(repo.delete("s1").failure().code).isEqualTo("NOPE")
    }

    // ─── react ───────────────────────────────────────────────────────────────

    @Test
    fun react_sendsEmojiToLikeEndpoint() = runTest {
        val body = slot<PostLikeRequest>()
        coEvery { api.likeWithEmoji(eq("s1"), capture(body)) } returns ApiResponse(success = true, data = Unit)

        assertThat(repo.react("s1", "🎉")).isInstanceOf(NetworkResult.Success::class.java)
        assertThat(body.captured.emoji).isEqualTo("🎉")
        coVerify(exactly = 1) { api.likeWithEmoji("s1", PostLikeRequest("🎉")) }
    }

    @Test
    fun react_failurePropagates() = runTest {
        coEvery { api.likeWithEmoji(any(), any()) } throws IOException("offline")

        assertThat(repo.react("s1", "🎉").failure().code).isEqualTo("NETWORK")
    }
}
