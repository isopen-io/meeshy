package me.meeshy.sdk.preferences

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.PreferencesApi
import me.meeshy.sdk.net.apiCall
import me.meeshy.sdk.notification.NotificationPreferencesStore
import me.meeshy.sdk.privacy.PrivacyPreferencesStore
import me.meeshy.sdk.socket.PreferencesSocketManager
import timber.log.Timber

/**
 * Keeps the device-local user-level preference stores in step with the blocks the same
 * account edits on another device — the read side of `user:preferences-updated`
 * (**category scope**), issue #4133.
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
 * ## Why it re-reads instead of applying the payload
 *
 * `UserPreferencesCategoryUpdatedEventData` carries `{ userId, category }` — the NAME of
 * the block and nothing else. There is no snapshot to fold and no version to arbitrate
 * (unlike the conversation arm), so the only correct response is a targeted re-read of the
 * named category. Fabricating a value from the event is not an option the payload offers.
 *
 * ## Which categories are handled, and why only two
 *
 * The gateway has seven (`privacy`, `audio`, `message`, `notification`, `video`,
 * `document`, `application`). Android caches exactly two of them locally, so only those
 * two can go stale; the other five are read on demand by the screens that use them and
 * have no store to invalidate. An unknown or unhandled name is ignored, not logged as an
 * error — it is the nominal case for five of seven.
 *
 * Constructed by `SdkModule` rather than by `@Inject`, for the reason every store in
 * that module is: the graph binds no `CoroutineScope`, so each owner of a long-lived
 * collector makes its own.
 *
 * A failed re-read is dropped silently: the local block keeps the value it had, which is
 * the same degradation as being offline. The next broadcast, or the next foreground sync,
 * catches up — never a crash, and never a store reset to defaults on a network blip.
 */
class PreferencesSyncCoordinator(
    private val socketManager: PreferencesSocketManager,
    private val preferencesApi: PreferencesApi,
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
            socketManager.categoryPreferencesUpdated.collect { category -> refreshCategory(category) }
        }
    }

    /** Stops collecting (logout). Safe to call when never started. */
    @Synchronized
    fun stop() {
        job?.cancel()
        job = null
    }

    /**
     * Re-read [category] and fold it onto its store, or do nothing when this client keeps
     * no copy of that block.
     *
     * `internal` rather than private on purpose: this is the whole behaviour, and the
     * collector above is only the trigger. Driving it directly is what lets every rule —
     * which categories are handled, what a failure does, what a projection preserves — be
     * asserted without staging a flow emission through a background coroutine, where a
     * missed delivery reads exactly like a missing write.
     */
    internal suspend fun refreshCategory(category: String) {
        when (category) {
            NOTIFICATION -> refreshNotification()
            PRIVACY -> refreshPrivacy()
            else -> Unit
        }
    }

    private suspend fun refreshNotification() {
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
        when (val result = apiCall { preferencesApi.getPrivacy() }) {
            is NetworkResult.Success ->
                privacyStore.setPreferences(result.data.toPreferences(privacyStore.preferences.value))
            is NetworkResult.Failure ->
                Timber.w("Privacy preferences refresh failed: %s", result.error.message)
        }
    }

    private companion object {
        const val NOTIFICATION = "notification"
        const val PRIVACY = "privacy"
    }
}
