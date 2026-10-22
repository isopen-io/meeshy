package me.meeshy.sdk.friend

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.decodeFromString
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.FriendRequest
import me.meeshy.sdk.model.FriendRequestActionBody
import me.meeshy.sdk.model.FriendRequestActionResult
import me.meeshy.sdk.model.FriendRequestDirection
import me.meeshy.sdk.model.Pagination
import me.meeshy.sdk.model.RespondFriendRequest
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.FriendApi
import me.meeshy.sdk.outbox.FriendRequestPayload
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxLanes
import me.meeshy.sdk.outbox.OutboxRepository
import me.meeshy.sdk.outbox.kindEnum
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import retrofit2.HttpException
import retrofit2.Response
import java.io.IOException

@RunWith(RobolectricTestRunner::class)
class FriendRepositoryTest {

    private val api: FriendApi = mockk()
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

    private fun outbox() = OutboxRepository(db, db.outboxDao())

    private fun repo(outbox: OutboxRepository = outbox()) = FriendRepository(api, outbox)

    @Test
    fun `a durable send queues a SEND_FRIEND_REQUEST row on the friend lane`() = runTest {
        val outbox = outbox()
        val repository = repo(outbox)

        val cmid = repository.enqueueSendFriendRequest("alice")

        assertThat(cmid).isNotNull()
        val queued = outbox.deliverable(OutboxLanes.FRIEND)
        assertThat(queued).hasSize(1)
        assertThat(queued.single().kindEnum).isEqualTo(OutboxKind.SEND_FRIEND_REQUEST)
        assertThat(queued.single().targetId).isEqualTo("alice")
        assertThat(queued.single().cmid).isEqualTo(cmid)
    }

    @Test
    fun `the queued payload carries the optional greeting`() = runTest {
        val outbox = outbox()
        val repository = repo(outbox)

        repository.enqueueSendFriendRequest("alice", message = "hey there")

        val payload = MeeshyApi.json
            .decodeFromString<FriendRequestPayload>(outbox.deliverable(OutboxLanes.FRIEND).single().payload)
        assertThat(payload.message).isEqualTo("hey there")
    }

    @Test
    fun `a blank receiver id is inert - nothing queued`() = runTest {
        val outbox = outbox()
        val repository = repo(outbox)

        val cmid = repository.enqueueSendFriendRequest("   ")

        assertThat(cmid).isNull()
        assertThat(outbox.deliverable(OutboxLanes.FRIEND)).isEmpty()
    }

    @Test
    fun `a supplied cmid keys the queued row so it matches the optimistic placeholder`() = runTest {
        val outbox = outbox()
        val repository = repo(outbox)

        val cmid = repository.enqueueSendFriendRequest("alice", cmid = "cmid_fixed")

        assertThat(cmid).isEqualTo("cmid_fixed")
        assertThat(outbox.deliverable(OutboxLanes.FRIEND).single().cmid).isEqualTo("cmid_fixed")
    }

    @Test
    fun `a repeated send to the same receiver supersedes the earlier queued row`() = runTest {
        val outbox = outbox()
        val repository = repo(outbox)

        repository.enqueueSendFriendRequest("alice", message = "first")
        val second = repository.enqueueSendFriendRequest("alice", message = "second")

        val queued = outbox.deliverable(OutboxLanes.FRIEND)
        assertThat(queued).hasSize(1)
        assertThat(queued.single().cmid).isEqualTo(second)
        val payload = MeeshyApi.json.decodeFromString<FriendRequestPayload>(queued.single().payload)
        assertThat(payload.message).isEqualTo("second")
    }

    // --- Les gestes : une route canonique, une action ----------------------

    private fun httpError(status: Int, json: String) =
        HttpException(Response.error<Any>(status, json.toResponseBody("application/json".toMediaType())))

    /** Ce que Fastify rend quand il ne connait pas le chemin : un 404 sans enveloppe Meeshy. */
    private fun routeNotServed() = httpError(
        404,
        """{"message":"Route PATCH:/api/v1/directory/friend-requests/r1 not found","error":"Not Found","statusCode":404}""",
    )

    /** Ce que rend le HANDLER quand la demande n'existe plus : l'enveloppe Meeshy et son propre message. */
    private fun requestGone() = httpError(
        404,
        """{"success":false,"error":"Demande d'ami non trouvee","message":"Demande d'ami non trouvee"}""",
    )

    private fun served(id: String = "r1") = ApiResponse(success = true, data = FriendRequest(id = id, status = "accepted"))

    private fun receipt() = ApiResponse(
        success = true,
        data = FriendRequestActionResult(id = "r1", deleted = true, message = "removed"),
    )

    @Test
    fun `accepting a received request sends action accept on the canonical route`() = runTest {
        coEvery { api.act("r1", FriendRequestActionBody("accept")) } returns served()

        val result = repo().respond("r1", accepted = true)

        assertThat(result).isInstanceOf(NetworkResult.Success::class.java)
        coVerify(exactly = 1) { api.act("r1", FriendRequestActionBody("accept")) }
        coVerify(exactly = 0) { api.respond(any(), any()) }
    }

    @Test
    fun `refusing a received request maps rejected to the reject action`() = runTest {
        coEvery { api.act("r1", FriendRequestActionBody("reject")) } returns served()

        repo().respond("r1", accepted = false)

        coVerify(exactly = 1) { api.act("r1", FriendRequestActionBody("reject")) }
    }

    @Test
    fun `a gateway that does not serve the canonical route is asked through the legacy alias`() = runTest {
        coEvery { api.act(any(), any()) } throws routeNotServed()
        coEvery { api.respond("r1", RespondFriendRequest("accepted")) } returns served()

        val result = repo().respond("r1", accepted = true)

        assertThat(result).isInstanceOf(NetworkResult.Success::class.java)
        coVerify(exactly = 1) { api.respond("r1", RespondFriendRequest("accepted")) }
    }

    @Test
    fun `the legacy refusal keeps the old rejected status word`() = runTest {
        coEvery { api.act(any(), any()) } throws routeNotServed()
        coEvery { api.respond("r1", RespondFriendRequest("rejected")) } returns served()

        repo().respond("r1", accepted = false)

        coVerify(exactly = 1) { api.respond("r1", RespondFriendRequest("rejected")) }
    }

    @Test
    fun `a request the handler says is gone does not replay on the alias`() = runTest {
        coEvery { api.act(any(), any()) } throws requestGone()

        val result = repo().respond("r1", accepted = true)

        assertThat(result).isInstanceOf(NetworkResult.Failure::class.java)
        assertThat((result as NetworkResult.Failure).error.httpStatus).isEqualTo(404)
        coVerify(exactly = 0) { api.respond(any(), any()) }
    }

    @Test
    fun `cancelling a sent request is a dismiss action, never a DELETE`() = runTest {
        coEvery { api.actRemoving("r1", FriendRequestActionBody("dismiss")) } returns receipt()

        val result = repo().deleteRequest("r1")

        assertThat(result).isEqualTo(NetworkResult.Success(Unit))
        coVerify(exactly = 1) { api.actRemoving("r1", FriendRequestActionBody("dismiss")) }
        coVerify(exactly = 0) { api.deleteRequest(any()) }
    }

    @Test
    fun `a dismiss whose row no longer exists is an idempotent success`() = runTest {
        coEvery { api.actRemoving(any(), any()) } throws requestGone()

        val result = repo().deleteRequest("r1")

        assertThat(result).isEqualTo(NetworkResult.Success(Unit))
        coVerify(exactly = 0) { api.deleteRequest(any()) }
    }

    @Test
    fun `a dismiss acknowledged without a receipt is still a success`() = runTest {
        coEvery { api.actRemoving(any(), any()) } returns ApiResponse(success = true)

        val result = repo().deleteRequest("r1")

        assertThat(result).isEqualTo(NetworkResult.Success(Unit))
    }

    @Test
    fun `a dismiss refused for another reason stays a failure`() = runTest {
        coEvery { api.actRemoving(any(), any()) } throws httpError(500, """{"success":false,"error":"boom"}""")

        val result = repo().deleteRequest("r1")

        assertThat(result).isInstanceOf(NetworkResult.Failure::class.java)
    }

    @Test
    fun `a dismiss against a gateway without the route falls back to the legacy DELETE`() = runTest {
        coEvery { api.actRemoving(any(), any()) } throws routeNotServed()
        coEvery { api.deleteRequest("r1") } returns ApiResponse(success = true)

        val result = repo().deleteRequest("r1")

        assertThat(result).isEqualTo(NetworkResult.Success(Unit))
        coVerify(exactly = 1) { api.deleteRequest("r1") }
    }

    @Test
    fun `the legacy DELETE answering 404 is the same idempotent success`() = runTest {
        coEvery { api.actRemoving(any(), any()) } throws routeNotServed()
        coEvery { api.deleteRequest("r1") } throws requestGone()

        val result = repo().deleteRequest("r1")

        assertThat(result).isEqualTo(NetworkResult.Success(Unit))
    }

    // --- La lecture des amis : par curseur, bornee --------------------------

    private fun rows(prefix: String, count: Int) =
        List(count) { FriendRequest(id = "$prefix$it", status = "accepted") }

    private fun page(rows: List<FriendRequest>, hasMore: Boolean, nextCursor: String?) = ApiResponse(
        success = true,
        data = rows,
        pagination = Pagination(hasMore = hasMore, nextCursor = nextCursor, limit = 100),
    )

    private fun stubAccepted(cursor: String?, answer: ApiResponse<List<FriendRequest>>) {
        coEvery {
            api.friendRequests(direction = "any", status = "accepted", cursor = cursor, limit = 100)
        } returns answer
    }

    @Test
    fun `the friend list reads two pages by cursor then stops`() = runTest {
        stubAccepted(null, page(rows("a", 100), hasMore = true, nextCursor = "cur-1"))
        stubAccepted("cur-1", page(rows("b", 40), hasMore = false, nextCursor = null))

        val result = repo().acceptedFriendRequests()

        val all = (result as NetworkResult.Success).data
        assertThat(all).hasSize(140)
        assertThat(all.first().id).isEqualTo("a0")
        assertThat(all.last().id).isEqualTo("b39")
        coVerify(exactly = 2) { api.friendRequests(any(), any(), any(), any(), any()) }
    }

    @Test
    fun `the friend list read stops at five hundred rows even when more is announced`() = runTest {
        (0 until 10).forEach { index ->
            stubAccepted(
                if (index == 0) null else "cur-$index",
                page(rows("p$index-", 100), hasMore = true, nextCursor = "cur-${index + 1}"),
            )
        }

        val result = repo().acceptedFriendRequests()

        assertThat((result as NetworkResult.Success).data).hasSize(500)
        coVerify(exactly = 5) { api.friendRequests(any(), any(), any(), any(), any()) }
    }

    @Test
    fun `a page that fails mid-read fails the read - a cut list is never presented as complete`() = runTest {
        stubAccepted(null, page(rows("a", 100), hasMore = true, nextCursor = "cur-1"))
        coEvery {
            api.friendRequests(direction = "any", status = "accepted", cursor = "cur-1", limit = 100)
        } throws IOException("offline")

        val result = repo().acceptedFriendRequests()

        assertThat(result).isInstanceOf(NetworkResult.Failure::class.java)
    }

    @Test
    fun `without a cursor the read does not ask the same page again`() = runTest {
        stubAccepted(null, page(rows("a", 100), hasMore = true, nextCursor = null))

        val result = repo().acceptedFriendRequests()

        assertThat((result as NetworkResult.Success).data).hasSize(100)
        coVerify(exactly = 1) { api.friendRequests(any(), any(), any(), any(), any()) }
    }

    @Test
    fun `a cursor that does not advance ends the read instead of looping`() = runTest {
        stubAccepted(null, page(rows("a", 100), hasMore = true, nextCursor = "same"))
        stubAccepted("same", page(rows("b", 100), hasMore = true, nextCursor = "same"))

        val result = repo().acceptedFriendRequests()

        assertThat((result as NetworkResult.Success).data).hasSize(200)
        coVerify(exactly = 2) { api.friendRequests(any(), any(), any(), any(), any()) }
    }

    @Test
    fun `a response without a pagination block is a single complete page`() = runTest {
        stubAccepted(null, ApiResponse(success = true, data = rows("a", 3)))

        val result = repo().acceptedFriendRequests()

        assertThat((result as NetworkResult.Success).data).hasSize(3)
        coVerify(exactly = 1) { api.friendRequests(any(), any(), any(), any(), any()) }
    }

    @Test
    fun `an empty first page is a real empty friend list, not a failure`() = runTest {
        stubAccepted(null, page(emptyList(), hasMore = false, nextCursor = null))

        val result = repo().acceptedFriendRequests()

        assertThat((result as NetworkResult.Success).data).isEmpty()
    }

    // --- Les demandes en attente : par curseur, la plus recente en tete ----

    @Test
    fun `received pending requests are read by cursor with a page of thirty`() = runTest {
        coEvery {
            api.friendRequests(direction = "received", status = "pending", cursor = null, limit = 30)
        } returns ApiResponse(
            success = true,
            data = listOf(
                FriendRequest(id = "newest", status = "pending"),
                FriendRequest(id = "older", status = "pending"),
            ),
            pagination = Pagination(hasMore = true, nextCursor = "cur-2", limit = 30),
        )

        val result = repo().pendingRequests(FriendRequestDirection.Received)

        val page = (result as NetworkResult.Success).data
        assertThat(page.requests.map { it.id }).containsExactly("newest", "older").inOrder()
        assertThat(page.nextCursor).isEqualTo("cur-2")
        assertThat(page.hasMore).isTrue()
    }

    @Test
    fun `sent pending requests continue from the cursor the previous page returned`() = runTest {
        coEvery {
            api.friendRequests(direction = "sent", status = "pending", cursor = "cur-2", limit = 30)
        } returns page(rows("s", 2), hasMore = false, nextCursor = null)

        val result = repo().pendingRequests(FriendRequestDirection.Sent, cursor = "cur-2")

        val page = (result as NetworkResult.Success).data
        assertThat(page.requests).hasSize(2)
        assertThat(page.hasMore).isFalse()
        assertThat(page.nextCursor).isNull()
    }

    @Test
    fun `a failing pending read is a failure`() = runTest {
        coEvery { api.friendRequests(any(), any(), any(), any(), any()) } throws IOException("offline")

        val result = repo().pendingRequests(FriendRequestDirection.Received)

        assertThat(result).isInstanceOf(NetworkResult.Failure::class.java)
    }
}
