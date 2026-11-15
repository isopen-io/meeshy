package me.meeshy.sdk.outbox.senders

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import io.mockk.verify
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.NotificationPreferenceSyncBody
import me.meeshy.sdk.model.PrivacyPreferenceSyncBody
import me.meeshy.sdk.model.PrivacyPreferences
import me.meeshy.sdk.model.UpdateProfileRequest
import me.meeshy.sdk.model.UserNotificationPreferences
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.PreferencesApi
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.SendResult
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.user.UserRepository
import org.junit.Test

class ProfileSettingsSendersTest {

    private val userRepository = mockk<UserRepository>()
    private val sessionRepository = mockk<SessionRepository>(relaxed = true)
    private val preferencesApi = mockk<PreferencesApi>()

    private val edit = UpdateProfileRequest(displayName = "Nouveau nom")
    private val serverUser = MeeshyUser(id = "u1", username = "alice", displayName = "Nouveau Nom")

    private fun profileRow(payload: String = encodedPayload(edit)) =
        outboxRow(OutboxKind.UPDATE_PROFILE, targetId = "u1", payload = payload)

    @Test
    fun `update profile merges the server authoritative user once delivered`() = runTest {
        coEvery { userRepository.updateProfile(edit) } returns NetworkResult.Success(serverUser)
        val handler = UpdateProfileHandler(userRepository, sessionRepository, senderJson)

        val result = handler.send(profileRow())

        assertThat(result).isEqualTo(SendResult.Success)
        coVerify(exactly = 1) { sessionRepository.adoptMerging(serverUser, "cmid-1") }
        verify(exactly = 0) { sessionRepository.adopt(any(), any()) }
    }

    @Test
    fun `update profile refused by validation fails permanently so the edit rolls back at once`() = runTest {
        coEvery { userRepository.updateProfile(edit) } returns
            NetworkResult.Failure(ApiError("bio too long", httpStatus = 400))
        val handler = UpdateProfileHandler(userRepository, sessionRepository, senderJson)

        val result = handler.send(profileRow())

        assertThat(result).isInstanceOf(SendResult.PermanentFailure::class.java)
        coVerify(exactly = 0) { sessionRepository.adoptMerging(any(), any()) }
    }

    @Test
    fun `update profile stays retryable on a rate limit or an expired token`() = runTest {
        val handler = UpdateProfileHandler(userRepository, sessionRepository, senderJson)

        listOf(401, 408, 429, 503).forEach { status ->
            coEvery { userRepository.updateProfile(edit) } returns
                NetworkResult.Failure(ApiError("retry", httpStatus = status))
            assertThat(handler.send(profileRow())).isEqualTo(SendResult.TransientFailure)
        }
    }

    @Test
    fun `update profile already applied (410) counts as delivered`() = runTest {
        coEvery { userRepository.updateProfile(edit) } returns
            NetworkResult.Failure(ApiError("gone", httpStatus = 410))
        val handler = UpdateProfileHandler(userRepository, sessionRepository, senderJson)

        assertThat(handler.send(profileRow())).isEqualTo(SendResult.Success)
    }

    @Test
    fun `update profile stays retryable and adopts nothing when the call fails`() = runTest {
        coEvery { userRepository.updateProfile(edit) } returns NetworkResult.Failure(ApiError("offline"))
        val handler = UpdateProfileHandler(userRepository, sessionRepository, senderJson)

        val result = handler.send(profileRow())

        assertThat(result).isEqualTo(SendResult.TransientFailure)
        coVerify(exactly = 0) { sessionRepository.adoptMerging(any(), any()) }
    }

    @Test
    fun `update profile with an undecodable payload fails permanently`() = runTest {
        val handler = UpdateProfileHandler(userRepository, sessionRepository, senderJson)

        val result = handler.send(profileRow(payload = "[]"))

        assertThat(result).isInstanceOf(SendResult.PermanentFailure::class.java)
        coVerify(exactly = 0) { userRepository.updateProfile(any()) }
    }

    @Test
    fun `update settings syncs the notification block and maps the outcome`() = runTest {
        val body = NotificationPreferenceSyncBody.from(UserNotificationPreferences(pushEnabled = false))
        val handler = UpdateSettingsHandler(preferencesApi, senderJson) { mockk(relaxed = true) }
        val row = outboxRow(OutboxKind.UPDATE_SETTINGS, payload = encodedPayload(body))

        coEvery { preferencesApi.updateNotification(body) } returns accepted(Unit)
        assertThat(handler.send(row)).isEqualTo(SendResult.Success)

        coEvery { preferencesApi.updateNotification(body) } returns refused()
        assertThat(handler.send(row)).isEqualTo(SendResult.TransientFailure)
    }

    @Test
    fun `update settings with an undecodable payload fails permanently`() = runTest {
        val handler = UpdateSettingsHandler(preferencesApi, senderJson) { mockk(relaxed = true) }

        val result = handler.send(outboxRow(OutboxKind.UPDATE_SETTINGS, payload = "{}"))

        assertThat(result).isInstanceOf(SendResult.PermanentFailure::class.java)
    }

    @Test
    fun `update privacy syncs the privacy block and maps the outcome`() = runTest {
        val body = PrivacyPreferenceSyncBody.from(PrivacyPreferences(showOnlineStatus = false))
        val handler = UpdatePrivacySettingsHandler(preferencesApi, senderJson) { mockk(relaxed = true) }
        val row = outboxRow(OutboxKind.UPDATE_PRIVACY_SETTINGS, payload = encodedPayload(body))

        coEvery { preferencesApi.updatePrivacy(body) } returns accepted(Unit)
        assertThat(handler.send(row)).isEqualTo(SendResult.Success)

        coEvery { preferencesApi.updatePrivacy(body) } returns refused()
        assertThat(handler.send(row)).isEqualTo(SendResult.TransientFailure)
    }

    @Test
    fun `update privacy with an undecodable payload fails permanently`() = runTest {
        val handler = UpdatePrivacySettingsHandler(preferencesApi, senderJson) { mockk(relaxed = true) }

        val result = handler.send(outboxRow(OutboxKind.UPDATE_PRIVACY_SETTINGS, payload = "{}"))

        assertThat(result).isInstanceOf(SendResult.PermanentFailure::class.java)
    }
}
