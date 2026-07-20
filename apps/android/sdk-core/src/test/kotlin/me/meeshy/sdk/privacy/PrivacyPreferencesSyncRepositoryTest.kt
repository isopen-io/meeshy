package me.meeshy.sdk.privacy

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import io.mockk.slot
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.decodeFromString
import me.meeshy.sdk.model.PrivacyPreferenceSyncBody
import me.meeshy.sdk.model.PrivacyPreferences
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxLanes
import me.meeshy.sdk.outbox.OutboxMutation
import me.meeshy.sdk.outbox.OutboxRepository
import me.meeshy.sdk.session.SessionRepository
import org.junit.Test

/**
 * The durable privacy-preference sync path: with an active session, a snapshot
 * `UPDATE_PRIVACY_SETTINGS` mutation joins the settings lane keyed by the signed-in user id and
 * carrying the editable-toggle wire body; no session (or a blank id) is inert with no queue write.
 * The device-local store remains the UI SSOT — this repository only propagates it to the backend,
 * so there is no optimistic session flip here.
 */
class PrivacyPreferencesSyncRepositoryTest {

    private fun repo(
        session: SessionRepository,
        outbox: OutboxRepository,
    ) = PrivacyPreferencesSyncRepository(
        sessionRepository = session,
        outboxRepository = outbox,
    )

    @Test
    fun `enqueueSync queues the snapshot on the settings lane keyed by the user id`() = runTest {
        val session = mockk<SessionRepository>(relaxed = true)
        coEvery { session.currentUserId } returns "me-42"
        val outbox = mockk<OutboxRepository>()
        val captured = slot<OutboxMutation>()
        coEvery { outbox.enqueue(capture(captured)) } returns "cmid_1"

        val prefs = PrivacyPreferences(
            showOnlineStatus = false,
            blockScreenshots = true,
            hideProfileFromSearch = true,
        )
        val cmid = repo(session, outbox).enqueueSync(prefs)

        assertThat(cmid).isEqualTo("cmid_1")
        val mutation = captured.captured
        assertThat(mutation.kind).isEqualTo(OutboxKind.UPDATE_PRIVACY_SETTINGS)
        assertThat(mutation.lane).isEqualTo(OutboxLanes.SETTINGS)
        assertThat(mutation.targetId).isEqualTo("me-42")
        val decoded = MeeshyApi.json.decodeFromString<PrivacyPreferenceSyncBody>(mutation.payload)
        assertThat(decoded).isEqualTo(PrivacyPreferenceSyncBody.from(prefs))
    }

    @Test
    fun `enqueueSync uses a distinct kind from the notification sync so the two never clobber`() = runTest {
        val session = mockk<SessionRepository>(relaxed = true)
        coEvery { session.currentUserId } returns "me-42"
        val outbox = mockk<OutboxRepository>()
        val captured = slot<OutboxMutation>()
        coEvery { outbox.enqueue(capture(captured)) } returns "cmid_1"

        repo(session, outbox).enqueueSync(PrivacyPreferences())

        // Distinct kind on the same lane: coalescing is per-kind, so a privacy sync cannot
        // supersede a pending notification (UPDATE_SETTINGS) sync for the same user.
        assertThat(captured.captured.kind).isNotEqualTo(OutboxKind.UPDATE_SETTINGS)
        assertThat(captured.captured.kind).isEqualTo(OutboxKind.UPDATE_PRIVACY_SETTINGS)
    }

    @Test
    fun `enqueueSync is inert when there is no active session`() = runTest {
        val session = mockk<SessionRepository>(relaxed = true)
        coEvery { session.currentUserId } returns null
        val outbox = mockk<OutboxRepository>(relaxed = true)

        val cmid = repo(session, outbox).enqueueSync(PrivacyPreferences())

        assertThat(cmid).isNull()
        coVerify(exactly = 0) { outbox.enqueue(any()) }
    }

    @Test
    fun `enqueueSync is inert when the session id is blank`() = runTest {
        val session = mockk<SessionRepository>(relaxed = true)
        coEvery { session.currentUserId } returns "   "
        val outbox = mockk<OutboxRepository>(relaxed = true)

        val cmid = repo(session, outbox).enqueueSync(PrivacyPreferences())

        assertThat(cmid).isNull()
        coVerify(exactly = 0) { outbox.enqueue(any()) }
    }

    @Test
    fun `enqueueSync returns null when the enqueue is superseded`() = runTest {
        val session = mockk<SessionRepository>(relaxed = true)
        coEvery { session.currentUserId } returns "me-42"
        val outbox = mockk<OutboxRepository>()
        coEvery { outbox.enqueue(any()) } returns null

        val cmid = repo(session, outbox).enqueueSync(PrivacyPreferences(blockScreenshots = true))

        assertThat(cmid).isNull()
    }
}
