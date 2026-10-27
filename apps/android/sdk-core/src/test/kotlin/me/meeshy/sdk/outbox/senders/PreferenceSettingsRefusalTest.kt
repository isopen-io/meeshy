package me.meeshy.sdk.outbox.senders

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.NotificationPreferenceSyncBody
import me.meeshy.sdk.model.PrivacyPreferenceSyncBody
import me.meeshy.sdk.model.PrivacyPreferences
import me.meeshy.sdk.model.UserNotificationPreferences
import me.meeshy.sdk.net.api.PreferencesApi
import me.meeshy.sdk.notification.InMemoryNotificationPreferencesStore
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxRepository
import me.meeshy.sdk.outbox.SendResult
import me.meeshy.sdk.preferences.PreferencesSyncCoordinator
import me.meeshy.sdk.privacy.InMemoryPrivacyPreferencesStore
import me.meeshy.sdk.socket.PreferencesSocketManager
import me.meeshy.sdk.socket.SocketConnectionState
import me.meeshy.sdk.socket.SocketManager
import org.junit.Test
import retrofit2.HttpException
import retrofit2.Response
import okhttp3.ResponseBody.Companion.toResponseBody

/**
 * A preference toggle paints the local store first and lets the outbox carry it. When the
 * gateway can never accept it (a 4xx refusal) or the retries are spent, the device must not
 * keep showing a setting the server does not hold: the block returns to the server's truth,
 * the same reconciliation iOS `UserPreferencesManager` gets from its next backend read.
 */
class PreferenceSettingsRefusalTest {

    private val serverNotification = UserNotificationPreferences(pushEnabled = true, soundEnabled = true)
    private val localNotification = UserNotificationPreferences(pushEnabled = false, soundEnabled = true)
    private val serverPrivacy = PrivacyPreferences(showOnlineStatus = true)
    private val localPrivacy = PrivacyPreferences(showOnlineStatus = false)

    private class Fixture(
        val api: PreferencesApi,
        val notificationStore: InMemoryNotificationPreferencesStore,
        val privacyStore: InMemoryPrivacyPreferencesStore,
        val coordinator: PreferencesSyncCoordinator,
    )

    private fun TestScope.fixture(newerWritePending: Boolean = false): Fixture {
        val api = mockk<PreferencesApi>()
        coEvery { api.getNotification() } returns
            ApiResponse(success = true, data = NotificationPreferenceSyncBody.from(serverNotification))
        coEvery { api.getPrivacy() } returns
            ApiResponse(success = true, data = PrivacyPreferenceSyncBody.from(serverPrivacy))
        val outbox = mockk<OutboxRepository> {
            coEvery { hasDeliverable(any(), any()) } returns newerWritePending
        }
        val socket = mockk<PreferencesSocketManager> {
            every { categoryPreferencesUpdated } returns MutableSharedFlow()
        }
        val connection = mockk<SocketManager> {
            every { connectionState } returns MutableStateFlow(SocketConnectionState.DISCONNECTED)
        }
        val notificationStore = InMemoryNotificationPreferencesStore(localNotification)
        val privacyStore = InMemoryPrivacyPreferencesStore(localPrivacy)
        val coordinator = PreferencesSyncCoordinator(
            socketManager = socket,
            connectionManager = connection,
            preferencesApi = api,
            outboxRepository = outbox,
            notificationStore = notificationStore,
            privacyStore = privacyStore,
            scope = this,
        )
        return Fixture(api, notificationStore, privacyStore, coordinator)
    }

    private fun httpRefusal(status: Int): HttpException =
        HttpException(Response.error<Unit>(status, "{}".toResponseBody()))

    private fun notificationRow() = outboxRow(
        OutboxKind.UPDATE_SETTINGS,
        payload = encodedPayload(NotificationPreferenceSyncBody.from(localNotification)),
    )

    private fun privacyRow() = outboxRow(
        OutboxKind.UPDATE_PRIVACY_SETTINGS,
        payload = encodedPayload(PrivacyPreferenceSyncBody.from(localPrivacy)),
    )

    @Test
    fun `a notification block refused by validation fails permanently instead of blocking the lane`() = runTest {
        val f = fixture()
        coEvery { f.api.updateNotification(any()) } throws httpRefusal(400)
        val handler = UpdateSettingsHandler(f.api, senderJson) { f.coordinator }

        assertThat(handler.send(notificationRow())).isInstanceOf(SendResult.PermanentFailure::class.java)
    }

    @Test
    fun `a notification block stays retryable on an expired token, a timeout, a rate limit or a server error`() = runTest {
        val f = fixture()
        val handler = UpdateSettingsHandler(f.api, senderJson) { f.coordinator }

        listOf(401, 408, 429, 503).forEach { status ->
            coEvery { f.api.updateNotification(any()) } throws httpRefusal(status)
            assertThat(handler.send(notificationRow())).isEqualTo(SendResult.TransientFailure)
        }
    }

    @Test
    fun `an exhausted notification sync returns the toggles to what the server holds`() = runTest {
        val f = fixture()
        val handler = UpdateSettingsHandler(f.api, senderJson) { f.coordinator }

        handler.onExhausted(notificationRow())

        assertThat(f.notificationStore.preferences.value.pushEnabled).isTrue()
    }

    @Test
    fun `an exhausted notification sync keeps a newer toggle that is still on its way`() = runTest {
        val f = fixture(newerWritePending = true)
        val handler = UpdateSettingsHandler(f.api, senderJson) { f.coordinator }

        handler.onExhausted(notificationRow())

        assertThat(f.notificationStore.preferences.value).isEqualTo(localNotification)
    }

    @Test
    fun `a privacy block refused by validation fails permanently`() = runTest {
        val f = fixture()
        coEvery { f.api.updatePrivacy(any()) } throws httpRefusal(422)
        val handler = UpdatePrivacySettingsHandler(f.api, senderJson) { f.coordinator }

        assertThat(handler.send(privacyRow())).isInstanceOf(SendResult.PermanentFailure::class.java)
    }

    @Test
    fun `an exhausted privacy sync returns the block to what the server holds`() = runTest {
        val f = fixture()
        val handler = UpdatePrivacySettingsHandler(f.api, senderJson) { f.coordinator }

        handler.onExhausted(privacyRow())

        assertThat(f.privacyStore.preferences.value.showOnlineStatus).isTrue()
    }
}
