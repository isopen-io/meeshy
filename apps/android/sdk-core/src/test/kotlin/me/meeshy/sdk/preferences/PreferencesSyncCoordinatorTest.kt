package me.meeshy.sdk.preferences

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.ApiCategory
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.CreateCategoryBody
import me.meeshy.sdk.model.EncryptionPreference
import me.meeshy.sdk.model.NotificationPreferenceSyncBody
import me.meeshy.sdk.model.PrivacyPreferenceSyncBody
import me.meeshy.sdk.model.PrivacyPreferences
import me.meeshy.sdk.model.UserNotificationPreferences
import me.meeshy.sdk.net.api.PreferencesApi
import me.meeshy.sdk.notification.InMemoryNotificationPreferencesStore
import me.meeshy.sdk.privacy.InMemoryPrivacyPreferencesStore
import me.meeshy.sdk.socket.PreferencesSocketManager
import io.mockk.every
import io.mockk.mockk
import org.junit.Test

/**
 * Behavioural spec for the read side of `user:preferences-updated` (category scope):
 * a block changed on another device reaches THIS device's store (#4133).
 *
 * The witnesses stop at the store rather than at a screen, because the store is where the
 * value has to land: `NotificationPreferencesStore` gates what this device shows and sounds
 * long after any settings screen is gone, which is exactly why the collector lives for the
 * session and not in a ViewModel.
 */
class PreferencesSyncCoordinatorTest {

    /**
     * Every route answers "not wired" by default, so a test that reaches an endpoint it did
     * not intend to exercise fails loudly instead of quietly succeeding.
     */
    private open class StubPreferencesApi : PreferencesApi {
        override suspend fun getCategories(limit: Int?) =
            ApiResponse<List<ApiCategory>>(success = false)

        override suspend fun createCategory(body: CreateCategoryBody) =
            ApiResponse<ApiCategory>(success = false)

        override suspend fun updateNotification(body: NotificationPreferenceSyncBody) =
            ApiResponse<Unit>(success = false)

        override suspend fun updatePrivacy(body: PrivacyPreferenceSyncBody) =
            ApiResponse<Unit>(success = false)

        override suspend fun getNotification() =
            ApiResponse<NotificationPreferenceSyncBody>(success = false)

        override suspend fun getPrivacy() =
            ApiResponse<PrivacyPreferenceSyncBody>(success = false)
    }

    private fun notificationBody(pushEnabled: Boolean) = NotificationPreferenceSyncBody.from(
        UserNotificationPreferences(pushEnabled = pushEnabled),
    )

    private fun privacyBody(showOnlineStatus: Boolean) = PrivacyPreferenceSyncBody.from(
        PrivacyPreferences(showOnlineStatus = showOnlineStatus),
    )

    private class Harness(
        val api: PreferencesApi,
        notification: UserNotificationPreferences = UserNotificationPreferences(),
        privacy: PrivacyPreferences = PrivacyPreferences(),
    ) {
        val events = MutableSharedFlow<String>(extraBufferCapacity = 8)
        val notificationStore = InMemoryNotificationPreferencesStore(notification)
        val privacyStore = InMemoryPrivacyPreferencesStore(privacy)
        val socket: PreferencesSocketManager = mockk {
            every { categoryPreferencesUpdated } returns events
        }
    }

    /**
     * The collector never completes — that is the point of it — so it must run in
     * [TestScope.backgroundScope], which `runTest` cancels when the body ends. Handing it
     * the TestScope itself makes `runTest` wait for a job that will never finish, and the
     * whole suite dies on `UncompletedCoroutinesError` rather than on any assertion.
     */
    private fun TestScope.coordinatorFor(harness: Harness): PreferencesSyncCoordinator =
        PreferencesSyncCoordinator(
            socketManager = harness.socket,
            preferencesApi = harness.api,
            notificationStore = harness.notificationStore,
            privacyStore = harness.privacyStore,
            scope = backgroundScope,
        ).also { it.start() }

    @Test
    fun `a notification broadcast re-reads the block and writes it to the store`() = runTest(
        StandardTestDispatcher(),
    ) {
        val harness = Harness(
            api = object : StubPreferencesApi() {
                override suspend fun getNotification() =
                    ApiResponse(success = true, data = notificationBody(pushEnabled = false))
            },
        )
        coordinatorFor(harness)
        advanceUntilIdle()

        harness.events.emit("notification")
        advanceUntilIdle()

        assertThat(harness.notificationStore.preferences.value.pushEnabled).isFalse()
    }

    @Test
    fun `a privacy broadcast re-reads the block and writes it to the store`() = runTest(
        StandardTestDispatcher(),
    ) {
        val harness = Harness(
            api = object : StubPreferencesApi() {
                override suspend fun getPrivacy() =
                    ApiResponse(success = true, data = privacyBody(showOnlineStatus = false))
            },
        )
        coordinatorFor(harness)
        advanceUntilIdle()

        harness.events.emit("privacy")
        advanceUntilIdle()

        assertThat(harness.privacyStore.preferences.value.showOnlineStatus).isFalse()
    }

    /**
     * The read-only encryption leg is not the wire body's to carry, and so not the sync's
     * to change. This is the same guarantee the write side gives, held from the other end.
     */
    @Test
    fun `a privacy sync leaves the encryption leg alone`() = runTest(StandardTestDispatcher()) {
        val harness = Harness(
            api = object : StubPreferencesApi() {
                override suspend fun getPrivacy() =
                    ApiResponse(success = true, data = privacyBody(showOnlineStatus = false))
            },
            privacy = PrivacyPreferences(encryptionPreference = EncryptionPreference.ALWAYS),
        )
        coordinatorFor(harness)
        advanceUntilIdle()

        harness.events.emit("privacy")
        advanceUntilIdle()

        assertThat(harness.privacyStore.preferences.value.encryptionPreference)
            .isEqualTo(EncryptionPreference.ALWAYS)
    }

    /**
     * Five of the seven gateway categories have no Android store. Reaching for them would
     * spend a request on a block nothing can read — the stub's "not wired" default is what
     * makes this witness able to fail.
     */
    @Test
    fun `a category with no local store is ignored rather than fetched`() = runTest(
        StandardTestDispatcher(),
    ) {
        val harness = Harness(api = StubPreferencesApi())
        coordinatorFor(harness)
        advanceUntilIdle()

        harness.events.emit("audio")
        harness.events.emit("video")
        harness.events.emit("application")
        advanceUntilIdle()

        assertThat(harness.notificationStore.preferences.value)
            .isEqualTo(UserNotificationPreferences())
        assertThat(harness.privacyStore.preferences.value).isEqualTo(PrivacyPreferences())
    }

    /**
     * A failed re-read must leave the block it had. Resetting a notification block to
     * defaults on a network blip would silently turn notifications back ON for someone who
     * had just turned them off elsewhere — a worse outcome than staying stale.
     */
    @Test
    fun `a failed re-read leaves the stored block untouched`() = runTest(StandardTestDispatcher()) {
        val harness = Harness(
            api = StubPreferencesApi(),
            notification = UserNotificationPreferences(pushEnabled = false),
        )
        coordinatorFor(harness)
        advanceUntilIdle()

        harness.events.emit("notification")
        advanceUntilIdle()

        assertThat(harness.notificationStore.preferences.value.pushEnabled).isFalse()
    }

    /** Re-attaching after a reconnection must not stack a second collector. */
    @Test
    fun `start is idempotent`() = runTest(StandardTestDispatcher()) {
        var calls = 0
        val harness = Harness(
            api = object : StubPreferencesApi() {
                override suspend fun getNotification(): ApiResponse<NotificationPreferenceSyncBody> {
                    calls += 1
                    return ApiResponse(success = true, data = notificationBody(pushEnabled = false))
                }
            },
        )
        val coordinator = coordinatorFor(harness)
        coordinator.start()
        coordinator.start()
        advanceUntilIdle()

        harness.events.emit("notification")
        advanceUntilIdle()

        assertThat(calls).isEqualTo(1)
    }

    /** After logout the collector stops: a late broadcast writes nothing. */
    @Test
    fun `stop ends the collection`() = runTest(StandardTestDispatcher()) {
        val harness = Harness(
            api = object : StubPreferencesApi() {
                override suspend fun getNotification() =
                    ApiResponse(success = true, data = notificationBody(pushEnabled = false))
            },
        )
        val coordinator = coordinatorFor(harness)
        advanceUntilIdle()

        coordinator.stop()
        harness.events.emit("notification")
        advanceUntilIdle()

        assertThat(harness.notificationStore.preferences.value.pushEnabled).isTrue()
    }
}
