package me.meeshy.sdk.preferences

import com.google.common.truth.Truth.assertThat
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.flow.MutableSharedFlow
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
import org.junit.Test

/**
 * Behavioural spec for the read side of `user:preferences-updated` (category scope):
 * a block changed on another device reaches THIS device's store (#4133).
 *
 * The witnesses stop at the store rather than at a screen, because the store is where the
 * value has to land: `NotificationPreferencesStore` gates what this device shows and sounds
 * long after any settings screen is gone — which is exactly why the collector lives for the
 * session and not in a ViewModel.
 *
 * ## Two levels, deliberately
 *
 * The behaviour is asserted by driving [PreferencesSyncCoordinator.refreshCategory]
 * DIRECTLY, and the collector plumbing by one pair of wiring witnesses. Staging every rule
 * through a flow emission into a background coroutine made a missed delivery indistinguishable
 * from a missing write — and it showed: the three assertions that demanded a CHANGE failed
 * while every assertion that demanded NO change passed, which is what a silently undelivered
 * event looks like from the outside. A witness whose subject is "what the sync writes" should
 * not be able to fail for "the event never arrived".
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

    private class CountingApi(
        private val notification: NotificationPreferenceSyncBody? = null,
        private val privacy: PrivacyPreferenceSyncBody? = null,
    ) : StubPreferencesApi() {
        var notificationReads: Int = 0
        var privacyReads: Int = 0

        override suspend fun getNotification(): ApiResponse<NotificationPreferenceSyncBody> {
            notificationReads++
            return notification
                ?.let { ApiResponse(success = true, data = it) }
                ?: ApiResponse(success = false)
        }

        override suspend fun getPrivacy(): ApiResponse<PrivacyPreferenceSyncBody> {
            privacyReads++
            return privacy
                ?.let { ApiResponse(success = true, data = it) }
                ?: ApiResponse(success = false)
        }
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
        /** `replay = 1` so a subscriber that starts after the emission still sees it. */
        val events = MutableSharedFlow<String>(replay = 1, extraBufferCapacity = 8)
        val notificationStore = InMemoryNotificationPreferencesStore(notification)
        val privacyStore = InMemoryPrivacyPreferencesStore(privacy)
        val socket: PreferencesSocketManager = mockk {
            every { categoryPreferencesUpdated } returns events
        }

        fun coordinator(scope: kotlinx.coroutines.CoroutineScope) = PreferencesSyncCoordinator(
            socketManager = socket,
            preferencesApi = api,
            notificationStore = notificationStore,
            privacyStore = privacyStore,
            scope = scope,
        )
    }

    // ---- what the sync WRITES (driven directly) ----

    @Test
    fun `a notification category re-read lands on the store`() = runTest {
        val harness = Harness(api = CountingApi(notification = notificationBody(pushEnabled = false)))

        harness.coordinator(this).refreshCategory("notification")

        assertThat(harness.notificationStore.preferences.value.pushEnabled).isFalse()
    }

    @Test
    fun `a privacy category re-read lands on the store`() = runTest {
        val harness = Harness(api = CountingApi(privacy = privacyBody(showOnlineStatus = false)))

        harness.coordinator(this).refreshCategory("privacy")

        assertThat(harness.privacyStore.preferences.value.showOnlineStatus).isFalse()
    }

    /**
     * The read-only encryption leg is not the wire body's to carry, and so not the sync's to
     * change — the same guarantee the write side gives, held from the other end. Asserted
     * against a local value that DIFFERS from the default, so the witness cannot pass merely
     * because nothing happened.
     */
    @Test
    fun `a privacy sync leaves the encryption leg alone`() = runTest {
        val harness = Harness(
            api = CountingApi(privacy = privacyBody(showOnlineStatus = false)),
            privacy = PrivacyPreferences(encryptionPreference = EncryptionPreference.ALWAYS),
        )

        harness.coordinator(this).refreshCategory("privacy")

        val stored = harness.privacyStore.preferences.value
        assertThat(stored.encryptionPreference).isEqualTo(EncryptionPreference.ALWAYS)
        // and the sync DID run, so the guarantee above is not vacuous
        assertThat(stored.showOnlineStatus).isFalse()
    }

    /**
     * Five of the seven gateway categories have no Android store. Reaching for them would
     * spend a request on a block nothing can read.
     */
    @Test
    fun `a category with no local store is never fetched`() = runTest {
        val api = CountingApi()
        val harness = Harness(api = api)
        val coordinator = harness.coordinator(this)

        coordinator.refreshCategory("audio")
        coordinator.refreshCategory("video")
        coordinator.refreshCategory("message")
        coordinator.refreshCategory("document")
        coordinator.refreshCategory("application")

        assertThat(api.notificationReads).isEqualTo(0)
        assertThat(api.privacyReads).isEqualTo(0)
    }

    /**
     * A failed re-read must leave the block it had. Resetting a notification block to defaults
     * on a network blip would silently turn notifications back ON for someone who had just
     * turned them off elsewhere — worse than staying stale.
     */
    @Test
    fun `a failed re-read leaves the stored block untouched`() = runTest {
        val api = CountingApi(notification = null)
        val harness = Harness(
            api = api,
            notification = UserNotificationPreferences(pushEnabled = false),
        )

        harness.coordinator(this).refreshCategory("notification")

        assertThat(api.notificationReads).isEqualTo(1)
        assertThat(harness.notificationStore.preferences.value.pushEnabled).isFalse()
    }

    // ---- the collector plumbing ----

    /** A broadcast on the manager's flow reaches the same behaviour. */
    @Test
    fun `a category broadcast drives the re-read`() = runTest {
        val api = CountingApi(notification = notificationBody(pushEnabled = false))
        val harness = Harness(api = api)
        harness.coordinator(backgroundScope).start()
        harness.events.emit("notification")
        advanceUntilIdle()

        assertThat(api.notificationReads).isEqualTo(1)
        assertThat(harness.notificationStore.preferences.value.pushEnabled).isFalse()
    }

    /** After logout the collector stops: a later broadcast reaches nothing. */
    @Test
    fun `stop ends the collection`() = runTest {
        val api = CountingApi(notification = notificationBody(pushEnabled = false))
        val harness = Harness(api = api)
        val coordinator = harness.coordinator(backgroundScope)
        coordinator.start()
        advanceUntilIdle()

        coordinator.stop()
        harness.events.emit("notification")
        advanceUntilIdle()

        assertThat(api.notificationReads).isEqualTo(0)
        assertThat(harness.notificationStore.preferences.value.pushEnabled).isTrue()
    }

    /** Re-attaching after a reconnection must not stack a second collector. */
    @Test
    fun `start is idempotent`() = runTest {
        val api = CountingApi(notification = notificationBody(pushEnabled = false))
        val harness = Harness(api = api)
        val coordinator = harness.coordinator(backgroundScope)
        coordinator.start()
        coordinator.start()
        coordinator.start()
        harness.events.emit("notification")
        advanceUntilIdle()

        assertThat(api.notificationReads).isEqualTo(1)
    }

    /** The coordinator is inert until started — no collector, no read. */
    @Test
    fun `an unstarted coordinator reads nothing`() = runTest {
        val api = CountingApi(notification = notificationBody(pushEnabled = false))
        val harness = Harness(api = api)
        harness.coordinator(backgroundScope)

        harness.events.emit("notification")
        advanceUntilIdle()

        assertThat(api.notificationReads).isEqualTo(0)
    }
}
