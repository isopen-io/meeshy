package me.meeshy.sdk.user

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import io.mockk.slot
import io.mockk.verify
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.decodeFromString
import me.meeshy.sdk.model.UpdateProfileRequest
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.net.api.UserApi
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxLanes
import me.meeshy.sdk.outbox.OutboxMutation
import me.meeshy.sdk.outbox.OutboxOutcome
import me.meeshy.sdk.outbox.OutboxRepository
import me.meeshy.sdk.outbox.OutboxState
import me.meeshy.core.database.entity.OutboxEntity
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.async
import kotlinx.coroutines.CoroutineStart
import me.meeshy.sdk.session.SessionRepository
import org.junit.Test

/**
 * The durable profile-edit write path: an active session flips optimistically and
 * a full-snapshot `UPDATE_PROFILE` mutation joins the profile lane keyed by the
 * signed-in user id; no session (or a blank id) is inert with no queue write.
 */
class UserRepositoryTest {

    private fun repo(
        session: SessionRepository,
        outbox: OutboxRepository,
    ) = UserRepository(
        userApi = mockk<UserApi>(relaxed = true),
        sessionRepository = session,
        outboxRepository = outbox,
    )

    @Test
    fun `enqueueProfileEdit flips the session optimistically and queues on the profile lane`() = runTest {
        val session = mockk<SessionRepository>(relaxed = true)
        coEvery { session.currentUserId } returns "me-42"
        val outbox = mockk<OutboxRepository>()
        coEvery { outbox.deliverable(OutboxLanes.PROFILE) } returns emptyList()
        val captured = slot<OutboxMutation>()
        coEvery { outbox.enqueue(capture(captured)) } returns "cmid_1"

        val request = UpdateProfileRequest(displayName = "Alicia", systemLanguage = "de")
        val cmid = repo(session, outbox).enqueueProfileEdit(request)

        assertThat(cmid).isEqualTo("cmid_1")
        verify(exactly = 1) { session.applyProfileEdit(request) }
        val mutation = captured.captured
        assertThat(mutation.kind).isEqualTo(OutboxKind.UPDATE_PROFILE)
        assertThat(mutation.lane).isEqualTo(OutboxLanes.PROFILE)
        assertThat(mutation.targetId).isEqualTo("me-42")
        // the full PATCH body is carried as the payload so the sender can replay it
        val decoded = MeeshyApi.json.decodeFromString<UpdateProfileRequest>(mutation.payload)
        assertThat(decoded).isEqualTo(request)
    }

    @Test
    fun `enqueueProfileEdit is inert when there is no active session`() = runTest {
        val session = mockk<SessionRepository>(relaxed = true)
        coEvery { session.currentUserId } returns null
        val outbox = mockk<OutboxRepository>(relaxed = true)

        val cmid = repo(session, outbox).enqueueProfileEdit(UpdateProfileRequest(bio = "x"))

        assertThat(cmid).isNull()
        verify(exactly = 0) { session.applyProfileEdit(any()) }
        coVerify(exactly = 0) { outbox.enqueue(any()) }
    }

    @Test
    fun `enqueueProfileEdit is inert when the session id is blank`() = runTest {
        val session = mockk<SessionRepository>(relaxed = true)
        coEvery { session.currentUserId } returns "   "
        val outbox = mockk<OutboxRepository>(relaxed = true)

        val cmid = repo(session, outbox).enqueueProfileEdit(UpdateProfileRequest(bio = "x"))

        assertThat(cmid).isNull()
        coVerify(exactly = 0) { outbox.enqueue(any()) }
    }

    @Test
    fun `enqueueProfileEdit returns null when the enqueue is superseded`() = runTest {
        val session = mockk<SessionRepository>(relaxed = true)
        coEvery { session.currentUserId } returns "me-42"
        val outbox = mockk<OutboxRepository>()
        coEvery { outbox.deliverable(OutboxLanes.PROFILE) } returns emptyList()
        coEvery { outbox.enqueue(any()) } returns null

        val cmid = repo(session, outbox).enqueueProfileEdit(UpdateProfileRequest(bio = "x"))

        assertThat(cmid).isNull()
        // the optimistic flip still happened — only the queue write coalesced away
        verify(exactly = 1) { session.applyProfileEdit(any()) }
    }

    @Test
    fun `searchUsersPaged forwards the query and offset, preserving the pagination block`() = runTest {
        val api = mockk<UserApi>()
        val users = listOf(
            me.meeshy.sdk.net.api.UserSearchResult(id = "u1", username = "alice", displayName = "Alice"),
        )
        coEvery { api.search("ali", 20, 20) } returns me.meeshy.sdk.model.ApiResponse(
            success = true,
            data = users,
            pagination = me.meeshy.sdk.model.Pagination(total = 45, offset = 20, limit = 20, hasMore = true),
        )
        val repository = UserRepository(
            userApi = api,
            sessionRepository = mockk(relaxed = true),
            outboxRepository = mockk(relaxed = true),
        )

        val result = repository.searchUsersPaged("ali", offset = 20)

        val success = result as me.meeshy.sdk.net.NetworkResult.Success
        assertThat(success.data.data).isEqualTo(users)
        assertThat(success.data.pagination?.hasMore).isTrue()
        assertThat(success.data.pagination?.offset).isEqualTo(20)
    }

    @Test
    fun `searchUsersPaged folds a failed envelope into a Failure`() = runTest {
        val api = mockk<UserApi>()
        coEvery { api.search(any(), any(), any()) } returns me.meeshy.sdk.model.ApiResponse(
            success = false,
            error = "down",
        )
        val repository = UserRepository(
            userApi = api,
            sessionRepository = mockk(relaxed = true),
            outboxRepository = mockk(relaxed = true),
        )

        val result = repository.searchUsersPaged("ali")

        assertThat(result).isInstanceOf(me.meeshy.sdk.net.NetworkResult.Failure::class.java)
    }

    private fun profileRow(
        cmid: String,
        request: UpdateProfileRequest,
        state: OutboxState = OutboxState.PENDING,
        targetId: String = "me-42",
        createdAt: Long = 1L,
    ) = OutboxEntity(
        cmid = cmid,
        lane = OutboxLanes.PROFILE,
        kind = OutboxKind.UPDATE_PROFILE.name,
        targetId = targetId,
        payload = MeeshyApi.json.encodeToString(UpdateProfileRequest.serializer(), request),
        dependsOn = null,
        attempts = 0,
        state = state.name,
        createdAt = createdAt,
        updatedAt = createdAt,
    )

    @Test
    fun `enqueueProfileEdit folds a still pending edit so replacing it drops no field`() = runTest {
        val session = mockk<SessionRepository>(relaxed = true)
        coEvery { session.currentUserId } returns "me-42"
        val outbox = mockk<OutboxRepository>()
        coEvery { outbox.deliverable(OutboxLanes.PROFILE) } returns listOf(
            profileRow("cmid_old", UpdateProfileRequest(bio = "", displayName = "Old")),
            profileRow("cmid_inflight", UpdateProfileRequest(firstName = "Sent"), state = OutboxState.INFLIGHT),
            profileRow("cmid_other", UpdateProfileRequest(lastName = "Other"), targetId = "someone-else"),
        )
        val captured = slot<OutboxMutation>()
        coEvery { outbox.enqueue(capture(captured)) } returns "cmid_new"

        val request = UpdateProfileRequest(displayName = "New")
        repo(session, outbox).enqueueProfileEdit(request)

        // only the NEW edit is painted (the older one already was) …
        verify(exactly = 1) { session.applyProfileEdit(request) }
        // … but the queued body carries the older pending clear too, never the in-flight nor another account's
        val decoded = MeeshyApi.json.decodeFromString<UpdateProfileRequest>(captured.captured.payload)
        assertThat(decoded).isEqualTo(UpdateProfileRequest(bio = "", displayName = "New"))
    }

    @Test
    fun `awaitProfileEditAbandoned is true only when the outbox exhausts that edit`() = runTest {
        val outcomes = MutableSharedFlow<OutboxOutcome>(extraBufferCapacity = 8)
        val outbox = mockk<OutboxRepository>()
        every { outbox.outcomes } returns outcomes
        val repository = repo(mockk(relaxed = true), outbox)

        val abandoned = async(start = CoroutineStart.UNDISPATCHED) { repository.awaitProfileEditAbandoned("cmid_1") }
        outcomes.emit(OutboxOutcome.Exhausted("cmid_other", "x"))
        outcomes.emit(OutboxOutcome.Exhausted("cmid_1", "refused"))
        assertThat(abandoned.await()).isTrue()

        val delivered = async(start = CoroutineStart.UNDISPATCHED) { repository.awaitProfileEditAbandoned("cmid_2") }
        outcomes.emit(OutboxOutcome.Succeeded("cmid_2"))
        assertThat(delivered.await()).isFalse()
    }
}
