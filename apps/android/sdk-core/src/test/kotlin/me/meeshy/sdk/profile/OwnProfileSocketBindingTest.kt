package me.meeshy.sdk.profile

import com.google.common.truth.Truth.assertThat
import io.mockk.mockk
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.UpdateProfileRequest
import me.meeshy.sdk.model.UserUpdatedEvent
import me.meeshy.sdk.model.UserUpdatedEvent.OptionalMediaChange
import me.meeshy.sdk.model.profile.OwnProfileSnapshot
import me.meeshy.sdk.model.profile.ProfileUpdatedEvent
import me.meeshy.sdk.net.InMemoryTokenStore
import me.meeshy.sdk.net.SessionTransitionFlags
import me.meeshy.sdk.net.api.AuthApi
import me.meeshy.sdk.session.PendingProfileEdits
import me.meeshy.sdk.session.SessionRepository
import org.junit.Test

/**
 * #18924 — `profile:updated` on `user:<me>`: my languages, name and pictures changed on another device reach this one at
 * once — the session first (the Prisme reads its languages from it), then the caches that show me. A snapshot older than
 * the identity held changes nothing, the caches included.
 */
class OwnProfileSocketBindingTest {

    private val events = MutableSharedFlow<ProfileUpdatedEvent>(extraBufferCapacity = 4)
    private val repainted = mutableListOf<UserUpdatedEvent>()

    private fun session(pending: PendingProfileEdits = PendingProfileEdits.NONE) =
        SessionRepository(mockk<AuthApi>(relaxed = true), InMemoryTokenStore(), SessionTransitionFlags(), pending).apply {
            adopt(MeeshyUser(id = "me", username = "ada", displayName = "Ada", systemLanguage = "fr", avatar = "a.jpg", updatedAt = T1))
        }

    private fun TestScope.attached(session: SessionRepository) =
        OwnProfileSocketBinding(events, session, OwnIdentityRepaint { repainted += it }, UnconfinedTestDispatcher(testScheduler))
            .also { it.attach() }

    private fun snapshot(at: String, systemLanguage: String = "en", userId: String = "me") = ProfileUpdatedEvent(
        userId = userId,
        updatedAt = at,
        profile = OwnProfileSnapshot(
            systemLanguage = systemLanguage,
            regionalLanguage = null,
            customDestinationLanguage = null,
            displayName = null,
            firstName = "Ada",
            lastName = "Lovelace",
            username = "ada",
            avatar = null,
            banner = null,
        ),
    )

    @Test
    fun `my profile changed on another device reaches the session, then the caches that show me`() = runTest {
        val session = session()
        val binding = attached(session)

        events.emit(snapshot(at = T2))

        val me = session.currentUser.value!!
        assertThat(me.systemLanguage).isEqualTo("en")
        assertThat(me.displayName).isNull()
        assertThat(me.avatar).isNull()
        assertThat(me.updatedAt).isEqualTo(T2)
        assertThat(repainted.single().userId).isEqualTo("me")
        assertThat(repainted.single().avatar).isEqualTo(OptionalMediaChange.Replaced(null))
        binding.detach()
    }

    @Test
    fun `a snapshot older than the identity held changes nothing, the caches included`() = runTest {
        val session = session()
        val binding = attached(session)

        events.emit(snapshot(at = T0))

        assertThat(session.currentUser.value!!.systemLanguage).isEqualTo("fr")
        assertThat(repainted).isEmpty()
        binding.detach()
    }

    @Test
    fun `another account's snapshot never touches the session`() = runTest {
        val session = session()
        val binding = attached(session)

        events.emit(snapshot(at = T2, userId = "someone"))

        assertThat(session.currentUser.value!!.systemLanguage).isEqualTo("fr")
        assertThat(repainted).isEmpty()
        binding.detach()
    }

    /** The snapshot is a server answer like any other: an edit still queued on THIS device stays on top of it. */
    @Test
    fun `an edit still queued on this device stays over the snapshot`() = runTest {
        val session = session { _, _ -> listOf(UpdateProfileRequest(systemLanguage = "de")) }
        val binding = attached(session)

        events.emit(snapshot(at = T2, systemLanguage = "en"))

        assertThat(session.currentUser.value!!.systemLanguage).isEqualTo("de")
        binding.detach()
    }

    private companion object {
        const val T0 = "2026-11-17T09:00:00.000Z"
        const val T1 = "2026-11-17T10:00:00.000Z"
        const val T2 = "2026-11-17T11:00:00.000Z"
    }
}
