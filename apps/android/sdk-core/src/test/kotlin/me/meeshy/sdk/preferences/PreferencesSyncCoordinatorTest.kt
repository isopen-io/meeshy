package me.meeshy.sdk.preferences

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.UnconfinedTestDispatcher
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
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxRepository
import me.meeshy.sdk.privacy.InMemoryPrivacyPreferencesStore
import me.meeshy.sdk.socket.PreferencesSocketManager
import me.meeshy.sdk.socket.SocketConnectionState
import me.meeshy.sdk.socket.SocketManager
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
 * ## Two dispatchers, deliberately
 *
 * The direct-drive witnesses need none: they call a suspend function and read the store.
 * The four wiring witnesses run on [UnconfinedTestDispatcher], where a launched coroutine
 * starts EAGERLY — so `start()` has subscribed before it returns, and each emission is
 * delivered as it is made. Under the default `StandardTestDispatcher` the collector only
 * starts at the next `advanceUntilIdle()`, which turns "did the sync write?" into "did the
 * scheduler happen to run the collector first?" — a question the assertions do not ask and
 * should not be able to answer.
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
        pendingWrites: Set<OutboxKind> = emptySet(),
        outboxThrows: Boolean = false,
    ) {
        val events = MutableSharedFlow<String>(extraBufferCapacity = 8)
        val connection = MutableStateFlow(SocketConnectionState.DISCONNECTED)
        val notificationStore = InMemoryNotificationPreferencesStore(notification)
        val privacyStore = InMemoryPrivacyPreferencesStore(privacy)
        val socket: PreferencesSocketManager = mockk {
            every { categoryPreferencesUpdated } returns events
        }
        val connectionManager: SocketManager = mockk {
            every { connectionState } returns connection
        }
        val outbox: OutboxRepository = mockk {
            coEvery { hasDeliverable(any(), any()) } answers {
                if (outboxThrows) throw IllegalStateException("outbox unreadable")
                secondArg<OutboxKind>() in pendingWrites
            }
        }

        /**
         * Suspends until the coordinator's collector is actually subscribed. Emitting before
         * that point loses the event, which is indistinguishable from "the sync did not
         * write" — the exact ambiguity that made the first version of this suite fail on
         * every assertion that demanded a change and pass on every one that did not.
         */
        suspend fun awaitCollector() {
            events.subscriptionCount.first { it > 0 }
        }

        /** The same wait, for the connection-triggered collector. */
        suspend fun awaitConnectionCollector() {
            connection.subscriptionCount.first { it > 0 }
        }

        fun coordinator(scope: kotlinx.coroutines.CoroutineScope) = PreferencesSyncCoordinator(
            socketManager = socket,
            connectionManager = connectionManager,
            preferencesApi = api,
            outboxRepository = outbox,
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

    // ---- what a pending local write vetoes (#4197) ----

    /**
     * The outbox carries preference writes, so at a reconnection this device may hold a
     * newer value than the server has. Folding the server's block over it would paint the
     * setting the user just replaced, and the outbox delivering afterwards would leave the
     * SERVER right and the SCREEN reverted — with no broadcast left to undo it.
     */
    @Test
    fun `a pending notification write vetoes its re-read`() = runTest {
        val api = CountingApi(notification = notificationBody(pushEnabled = true))
        val harness = Harness(
            api = api,
            notification = UserNotificationPreferences(pushEnabled = false),
            pendingWrites = setOf(OutboxKind.UPDATE_SETTINGS),
        )

        harness.coordinator(this).refreshCategory("notification")

        assertThat(api.notificationReads).isEqualTo(0)
        assertThat(harness.notificationStore.preferences.value.pushEnabled).isFalse()
    }

    @Test
    fun `a pending privacy write vetoes its re-read`() = runTest {
        val api = CountingApi(privacy = privacyBody(showOnlineStatus = true))
        val harness = Harness(
            api = api,
            privacy = PrivacyPreferences(showOnlineStatus = false),
            pendingWrites = setOf(OutboxKind.UPDATE_PRIVACY_SETTINGS),
        )

        harness.coordinator(this).refreshCategory("privacy")

        assertThat(api.privacyReads).isEqualTo(0)
        assertThat(harness.privacyStore.preferences.value.showOnlineStatus).isFalse()
    }

    /**
     * The two blocks share the settings lane but not their outbox kind, so one block's
     * unpushed write must not hold the other's re-read hostage.
     */
    @Test
    fun `a pending privacy write leaves the notification re-read alone`() = runTest {
        val api = CountingApi(notification = notificationBody(pushEnabled = false))
        val harness = Harness(api = api, pendingWrites = setOf(OutboxKind.UPDATE_PRIVACY_SETTINGS))

        harness.coordinator(this).hydrateCachedCategories()

        assertThat(api.notificationReads).isEqualTo(1)
        assertThat(api.privacyReads).isEqualTo(0)
        assertThat(harness.notificationStore.preferences.value.pushEnabled).isFalse()
    }

    /**
     * An unreadable queue cannot answer "does this device hold a newer value?", and the two
     * ways of being wrong are not symmetric: a needless skip leaves a block stale until the
     * next connection, a needless read can revert a change the user made. Skip.
     */
    @Test
    fun `an unreadable outbox skips rather than overwrites`() = runTest {
        val api = CountingApi(notification = notificationBody(pushEnabled = true))
        val harness = Harness(
            api = api,
            notification = UserNotificationPreferences(pushEnabled = false),
            outboxThrows = true,
        )

        harness.coordinator(this).hydrateCachedCategories()

        assertThat(api.notificationReads).isEqualTo(0)
        assertThat(api.privacyReads).isEqualTo(0)
        assertThat(harness.notificationStore.preferences.value.pushEnabled).isFalse()
    }

    // ---- what a connection hydrates (#4197) ----

    /** Both cached blocks, and only those — five of seven categories have no store. */
    @Test
    fun `hydration re-reads both cached blocks and nothing else`() = runTest {
        val api = CountingApi(
            notification = notificationBody(pushEnabled = false),
            privacy = privacyBody(showOnlineStatus = false),
        )
        val harness = Harness(api = api)

        harness.coordinator(this).hydrateCachedCategories()

        assertThat(api.notificationReads).isEqualTo(1)
        assertThat(api.privacyReads).isEqualTo(1)
        assertThat(harness.notificationStore.preferences.value.pushEnabled).isFalse()
        assertThat(harness.privacyStore.preferences.value.showOnlineStatus).isFalse()
    }

    /**
     * Hydration goes through the same projection as the broadcast path, so the leg the wire
     * body never carries stays local on this path too — the guarantee is a property of the
     * fold, not of the trigger that reached it.
     */
    @Test
    fun `hydration leaves the encryption leg alone`() = runTest {
        val harness = Harness(
            api = CountingApi(privacy = privacyBody(showOnlineStatus = false)),
            privacy = PrivacyPreferences(encryptionPreference = EncryptionPreference.ALWAYS),
        )

        harness.coordinator(this).hydrateCachedCategories()

        val stored = harness.privacyStore.preferences.value
        assertThat(stored.encryptionPreference).isEqualTo(EncryptionPreference.ALWAYS)
        assertThat(stored.showOnlineStatus).isFalse()
    }

    // ---- the collector plumbing ----

    /** A connection is a trigger of its own: nobody has to broadcast anything. */
    @Test
    fun `a connection drives the hydration`() = runTest(UnconfinedTestDispatcher()) {
        val api = CountingApi(
            notification = notificationBody(pushEnabled = false),
            privacy = privacyBody(showOnlineStatus = false),
        )
        val harness = Harness(api = api)
        harness.coordinator(backgroundScope).start()
        harness.awaitConnectionCollector()

        harness.connection.value = SocketConnectionState.CONNECTING
        harness.connection.value = SocketConnectionState.CONNECTED
        advanceUntilIdle()

        assertThat(api.notificationReads).isEqualTo(1)
        assertThat(api.privacyReads).isEqualTo(1)
        assertThat(harness.notificationStore.preferences.value.pushEnabled).isFalse()
        assertThat(harness.privacyStore.preferences.value.showOnlineStatus).isFalse()
    }

    /**
     * The cold-start case, and the reason this collector reads the connection STATE and not
     * the connected SIGNAL: a session opens by connecting and only then attaching, so the
     * socket can land before this collector ever subscribes. A replayless signal would be
     * missed there — silently, on the one path that most needs the catch-up.
     */
    @Test
    fun `a connection that landed before the collector started still hydrates`() =
        runTest(UnconfinedTestDispatcher()) {
            val api = CountingApi(notification = notificationBody(pushEnabled = false))
            val harness = Harness(api = api)
            harness.connection.value = SocketConnectionState.CONNECTED

            harness.coordinator(backgroundScope).start()
            harness.awaitConnectionCollector()
            advanceUntilIdle()

            assertThat(api.notificationReads).isEqualTo(1)
            assertThat(harness.notificationStore.preferences.value.pushEnabled).isFalse()
        }

    /**
     * A phone that dropped and came back missed every broadcast in between — that gap is the
     * whole point of the trigger, so a reconnection must hydrate again rather than count as
     * already done.
     */
    @Test
    fun `a reconnection hydrates again`() = runTest(UnconfinedTestDispatcher()) {
        val api = CountingApi(notification = notificationBody(pushEnabled = false))
        val harness = Harness(api = api)
        harness.coordinator(backgroundScope).start()
        harness.awaitConnectionCollector()

        harness.connection.value = SocketConnectionState.CONNECTED
        advanceUntilIdle()
        harness.connection.value = SocketConnectionState.CONNECTING
        advanceUntilIdle()
        harness.connection.value = SocketConnectionState.CONNECTED
        advanceUntilIdle()

        assertThat(api.notificationReads).isEqualTo(2)
    }

    /** A state that merely repeats is not a new connection, and buys no request. */
    @Test
    fun `a repeated connected state does not re-read`() = runTest(UnconfinedTestDispatcher()) {
        val api = CountingApi(notification = notificationBody(pushEnabled = false))
        val harness = Harness(api = api)
        harness.coordinator(backgroundScope).start()
        harness.awaitConnectionCollector()

        harness.connection.value = SocketConnectionState.CONNECTED
        harness.connection.value = SocketConnectionState.CONNECTED
        advanceUntilIdle()

        assertThat(api.notificationReads).isEqualTo(1)
    }

    /** Losing the socket is not a trigger — only regaining it is. */
    @Test
    fun `a disconnection does not hydrate`() = runTest(UnconfinedTestDispatcher()) {
        val api = CountingApi(notification = notificationBody(pushEnabled = false))
        val harness = Harness(api = api)
        harness.coordinator(backgroundScope).start()
        harness.awaitConnectionCollector()

        harness.connection.value = SocketConnectionState.CONNECTING
        harness.connection.value = SocketConnectionState.DISCONNECTED
        advanceUntilIdle()

        assertThat(api.notificationReads).isEqualTo(0)
    }

    /** After logout BOTH collectors stop — a later connection reaches nothing either. */
    @Test
    fun `stop ends the connection collector too`() = runTest(UnconfinedTestDispatcher()) {
        val api = CountingApi(notification = notificationBody(pushEnabled = false))
        val harness = Harness(api = api)
        val coordinator = harness.coordinator(backgroundScope)
        coordinator.start()
        harness.awaitConnectionCollector()

        coordinator.stop()
        advanceUntilIdle()
        harness.connection.value = SocketConnectionState.CONNECTED
        advanceUntilIdle()

        assertThat(api.notificationReads).isEqualTo(0)
        assertThat(harness.notificationStore.preferences.value.pushEnabled).isTrue()
    }

    /** A broadcast on the manager's flow reaches the same behaviour. */
    @Test
    fun `a category broadcast drives the re-read`() = runTest(UnconfinedTestDispatcher()) {
        val api = CountingApi(notification = notificationBody(pushEnabled = false))
        val harness = Harness(api = api)
        harness.coordinator(backgroundScope).start()
        harness.awaitCollector()

        harness.events.emit("notification")
        advanceUntilIdle()

        assertThat(api.notificationReads).isEqualTo(1)
        assertThat(harness.notificationStore.preferences.value.pushEnabled).isFalse()
    }

    /** After logout the collector stops: a later broadcast reaches nothing. */
    @Test
    fun `stop ends the collection`() = runTest(UnconfinedTestDispatcher()) {
        val api = CountingApi(notification = notificationBody(pushEnabled = false))
        val harness = Harness(api = api)
        val coordinator = harness.coordinator(backgroundScope)
        coordinator.start()
        harness.awaitCollector()

        coordinator.stop()
        advanceUntilIdle()
        harness.events.emit("notification")
        advanceUntilIdle()

        assertThat(api.notificationReads).isEqualTo(0)
        assertThat(harness.notificationStore.preferences.value.pushEnabled).isTrue()
    }

    /** Re-attaching after a reconnection must not stack a second collector. */
    @Test
    fun `start is idempotent`() = runTest(UnconfinedTestDispatcher()) {
        val api = CountingApi(notification = notificationBody(pushEnabled = false))
        val harness = Harness(api = api)
        val coordinator = harness.coordinator(backgroundScope)
        coordinator.start()
        coordinator.start()
        coordinator.start()
        harness.awaitCollector()

        harness.events.emit("notification")
        advanceUntilIdle()

        assertThat(api.notificationReads).isEqualTo(1)
    }

    /** The coordinator is inert until started — no collector, no read. */
    @Test
    fun `an unstarted coordinator reads nothing`() = runTest(UnconfinedTestDispatcher()) {
        val api = CountingApi(notification = notificationBody(pushEnabled = false))
        val harness = Harness(api = api)
        harness.coordinator(backgroundScope)

        harness.events.emit("notification")
        advanceUntilIdle()

        assertThat(api.notificationReads).isEqualTo(0)
    }
}
