package me.meeshy.sdk.user

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
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
import me.meeshy.sdk.outbox.OutboxRepository
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
        coEvery { outbox.enqueue(any()) } returns null

        val cmid = repo(session, outbox).enqueueProfileEdit(UpdateProfileRequest(bio = "x"))

        assertThat(cmid).isNull()
        // the optimistic flip still happened — only the queue write coalesced away
        verify(exactly = 1) { session.applyProfileEdit(any()) }
    }
}
