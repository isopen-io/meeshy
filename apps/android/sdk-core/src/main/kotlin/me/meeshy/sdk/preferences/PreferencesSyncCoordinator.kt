package me.meeshy.sdk.preferences

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.launch
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.PreferencesApi
import me.meeshy.sdk.net.apiCall
import me.meeshy.sdk.notification.NotificationPreferencesStore
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxLanes
import me.meeshy.sdk.outbox.OutboxRepository
import me.meeshy.sdk.privacy.PrivacyPreferencesStore
import me.meeshy.sdk.socket.PreferencesSocketManager
import me.meeshy.sdk.socket.SocketConnectionState
import me.meeshy.sdk.socket.SocketManager
import timber.log.Timber

/**
 * Keeps the device-local user-level preference stores in step with the blocks the same
 * account edits on another device — the read side of `user:preferences-updated`
 * (**category scope**), issue #4133, hydrated on every (re)connection for issue #4197.
 *
 * ## Why a coordinator and not a collector in a ViewModel
 *
 * `NotificationPreferencesStore` and `PrivacyPreferencesStore` are the UI source of truth
 * AND the behavioural one: the notification block gates what this device shows and sounds,
 * long after any settings screen is gone. Collecting in `SettingsViewModel` would sync the
 * stores only while the user happens to be *looking* at them — precisely the window in
 * which they least need it. This owner lives for the session instead, started by
 * `RealtimeSessionCoordinator` alongside the socket managers.
 *
 * ## Two triggers, because a broadcast only reaches a device that is there to hear it
 *
 * - **A broadcast** (`categoryPreferencesUpdated`) names one category that just changed.
 * - **A connection** re-reads both cached blocks. A phone is normally backgrounded or
 *   offline when its owner changes a setting on the web or on their iPhone, so the
 *   broadcast for that change is simply never delivered — and nothing replays it: the
 *   socket manager registers a listener, it does not fetch a backlog. Without this second
 *   trigger the block stayed stale *indefinitely*, which is the very symptom #4133 closed,
 *   one window further out.
 *
 * The connection trigger reads [SocketManager.connectionState] rather than the
 * [SocketManager.connected] signal, and the difference is the whole reliability of it: the
 * state is a `StateFlow`, so a collector that subscribes *after* the socket has already
 * landed still sees `CONNECTED` and still hydrates. The signal is a replayless
 * `SharedFlow` — the session opens by calling `connect()` and *then* `attach()`, so a
 * connection that completes before this collector starts would be missed, silently, on the
 * one path (cold start) that needs it most. Conflation also gives the rule its shape for
 * free: one hydration per genuine connection, none for a state that merely repeats.
 *
 * ## Why it re-reads instead of applying the payload
 *
 * `UserPreferencesCategoryUpdatedEventData` carries `{ userId, category }` — the NAME of
 * the block and nothing else. There is no snapshot to fold and no version to arbitrate
 * (unlike the conversation arm), so the only correct response is a targeted re-read of the
 * named category. Fabricating a value from the event is not an option the payload offers.
 *
 * ## Why a pending local write vetoes the re-read
 *
 * Preference writes are durable, not online-first: a toggle lands in the local store and an
 * outbox row carries it to the gateway whenever the network allows. So at the exact moment
 * this coordinator hydrates — a reconnection — the outbox is draining the very same lane,
 * and the two race. Fold the server's block first and the device paints the value the user
 * just replaced; the outbox then delivers the right one, leaving the SERVER correct and the
 * SCREEN reverted, with no further broadcast to undo it. A store that silently reverts a
 * setting is worse than one that is briefly stale, so a category with a still-deliverable
 * row of its kind is skipped: this device holds the newer value, and the outbox is already
 * on its way to say so.
 *
 * This veto guards the broadcast path too, and always did need to — the gateway echoes a
 * PATCH back to the account that sent it, so a toggle flipped twice in quick succession
 * could already race its own echo. The connection trigger only turns a narrow race into the
 * nominal one.
 *
 * ## Which categories are handled, and why only two
 *
 * The gateway has seven (`privacy`, `audio`, `message`, `notification`, `video`,
 * `document`, `application`). Android caches exactly two of them locally, so only those
 * two can go stale — and only those two are worth a request. The other five are read on
 * demand by the screens that use them: they have no store to invalidate and no store to
 * hydrate, and giving them one now would cache blocks nothing reads between screens
 * (decided for #4197, criterion 5). An unknown or unhandled name is ignored, not logged as
 * an error — it is the nominal case for five of seven.
 *
 * Constructed by `SdkModule` rather than by `@Inject`, for the reason every store in
 * that module is: the graph binds no `CoroutineScope`, so each owner of a long-lived
 * collector makes its own.
 *
 * A failed re-read is dropped silently: the local block keeps the value it had, which is
 * the same degradation as being offline. The next broadcast, or the next connection,
 * catches up — never a crash, and never a store reset to defaults on a network blip. This
 * is also what makes the hydration cache-first: the store paints from DataStore the instant
 * a screen asks, and this correction lands behind it or not at all.
 */
class PreferencesSyncCoordinator(
    private val socketManager: PreferencesSocketManager,
    private val connectionManager: SocketManager,
    private val preferencesApi: PreferencesApi,
    private val outboxRepository: OutboxRepository,
    private val notificationStore: NotificationPreferencesStore,
    private val privacyStore: PrivacyPreferencesStore,
    private val scope: CoroutineScope,
) {
    private var job: Job? = null

    /** Idempotent: a second call while already collecting is a no-op, not a second collector. */
    @Synchronized
    fun start() {
        if (job?.isActive == true) return
        job = scope.launch {
            launch {
                socketManager.categoryPreferencesUpdated.collect { category -> refreshCategory(category) }
            }
            launch {
                connectionManager.connectionState
                    .filter { it == SocketConnectionState.CONNECTED }
                    .collect { hydrateCachedCategories() }
            }
        }
    }

    /** Stops collecting (logout). Safe to call when never started. */
    @Synchronized
    fun stop() {
        job?.cancel()
        job = null
    }

    /**
     * Re-reads every block this device keeps a copy of — the catch-up a connection owes to
     * whatever changed while it was gone.
     *
     * Sequential rather than concurrent: two small reads whose results are independent, on
     * a path that fires at every reconnection. Spending one round trip at a time here costs
     * nothing a user can perceive (no screen is waiting on it) and keeps a flapping
     * connection from doubling its own burst.
     */
    internal suspend fun hydrateCachedCategories() {
        CACHED_CATEGORIES.forEach { refreshCategory(it) }
    }

    /**
     * Re-read [category] and fold it onto its store, or do nothing when this client keeps
     * no copy of that block or still owes the server a write for it.
     *
     * `internal` rather than private on purpose: this is the whole behaviour, and the
     * collectors above are only triggers. Driving it directly is what lets every rule —
     * which categories are handled, what a failure does, what a projection preserves, what
     * a pending write vetoes — be asserted without staging a flow emission through a
     * background coroutine, where a missed delivery reads exactly like a missing write.
     */
    internal suspend fun refreshCategory(category: String) {
        when (category) {
            NOTIFICATION -> refreshNotification()
            PRIVACY -> refreshPrivacy()
            else -> Unit
        }
    }

    private suspend fun refreshNotification() {
        if (owesServerAWrite(OutboxKind.UPDATE_SETTINGS)) return
        when (val result = apiCall { preferencesApi.getNotification() }) {
            is NetworkResult.Success ->
                notificationStore.setPreferences(
                    result.data.toPreferences(notificationStore.preferences.value),
                )
            is NetworkResult.Failure ->
                Timber.w("Notification preferences refresh failed: %s", result.error.message)
        }
    }

    private suspend fun refreshPrivacy() {
        if (owesServerAWrite(OutboxKind.UPDATE_PRIVACY_SETTINGS)) return
        when (val result = apiCall { preferencesApi.getPrivacy() }) {
            is NetworkResult.Success ->
                privacyStore.setPreferences(result.data.toPreferences(privacyStore.preferences.value))
            is NetworkResult.Failure ->
                Timber.w("Privacy preferences refresh failed: %s", result.error.message)
        }
    }

    /**
     * An unreadable queue answers `true` — skip. The two outcomes are not symmetric: a
     * needless skip leaves a block stale until the next connection, while a needless read
     * can overwrite a change the user made and this device has not pushed yet. Fail towards
     * the one the user can still recover from.
     *
     * `CancellationException` is re-thrown rather than answered: a cancelled collector is
     * not a queue that failed to answer, and swallowing it here would let a stopped
     * coordinator run one more fold on its way out.
     */
    private suspend fun owesServerAWrite(kind: OutboxKind): Boolean =
        try {
            outboxRepository.hasDeliverable(OutboxLanes.SETTINGS, kind)
        } catch (cancellation: CancellationException) {
            throw cancellation
        } catch (error: Exception) {
            Timber.w(error, "Outbox unreadable; skipping %s preferences refresh", kind)
            true
        }

    private companion object {
        const val NOTIFICATION = "notification"
        const val PRIVACY = "privacy"

        /** The blocks this device caches, and therefore the only ones a connection re-reads. */
        val CACHED_CATEGORIES = listOf(NOTIFICATION, PRIVACY)
    }
}
