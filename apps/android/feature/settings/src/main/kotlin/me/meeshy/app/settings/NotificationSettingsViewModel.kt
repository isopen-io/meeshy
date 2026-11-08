package me.meeshy.app.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.work.WorkManager
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.DndDay
import me.meeshy.sdk.model.DndWindow
import me.meeshy.sdk.model.NotificationType
import me.meeshy.sdk.model.NotificationTypeCatalog
import me.meeshy.sdk.model.UserNotificationPreferences
import me.meeshy.sdk.model.relation.CircleNotify
import me.meeshy.sdk.model.relation.RelationAudienceChoice
import me.meeshy.sdk.notification.NotificationPreferencesStore
import me.meeshy.sdk.notification.NotificationPreferencesSyncRepository
import me.meeshy.sdk.outbox.OutboxFlushWorker
import java.time.OffsetDateTime
import javax.inject.Inject

private const val SECONDS_PER_MINUTE = 60

data class NotificationSettingsUiState(
    val notifications: UserNotificationPreferences = UserNotificationPreferences(),
    val notificationTypeQuery: String = "",
)

/**
 * Les réglages de notifications (iOS `NotificationSettingsView` et les trois interrupteurs de tête de
 * `SettingsView`) : push, e-mail, sons, vibrations, aperçu, plage Ne pas déranger, « Qui est prévenu »
 * et types d'événements. Chaque bascule peint aussitôt le magasin local (source de l'écran) puis
 * enfile une synchronisation durable, le worker n'étant réveillé que si une ligne a vraiment été
 * enfilée.
 */
@HiltViewModel
class NotificationSettingsViewModel @Inject constructor(
    private val notificationPreferencesStore: NotificationPreferencesStore,
    private val notificationPreferencesSyncRepository: NotificationPreferencesSyncRepository,
    private val workManager: WorkManager,
) : ViewModel() {

    private val _state = MutableStateFlow(
        NotificationSettingsUiState(notifications = notificationPreferencesStore.preferences.value),
    )
    val state: StateFlow<NotificationSettingsUiState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            notificationPreferencesStore.preferences.collect { prefs ->
                _state.update { it.copy(notifications = prefs) }
            }
        }
    }

    /** Toggles push notifications, persisting the whole block (other toggles preserved). */
    fun setPushEnabled(enabled: Boolean) {
        updateNotifications { it.copy(pushEnabled = enabled) }
    }

    /** Email is an independent delivery channel from push, never gated on [setPushEnabled]. */
    fun setEmailEnabled(enabled: Boolean) {
        updateNotifications { it.copy(emailEnabled = enabled) }
    }

    /** Toggles the notification sound. */
    fun setSoundEnabled(enabled: Boolean) {
        updateNotifications { it.copy(soundEnabled = enabled) }
    }

    /** Toggles notification vibration. */
    fun setVibrationEnabled(enabled: Boolean) {
        updateNotifications { it.copy(vibrationEnabled = enabled) }
    }

    /** Toggles new-message notifications. */
    fun setNewMessageEnabled(enabled: Boolean) {
        updateNotifications { it.copy(newMessageEnabled = enabled) }
    }

    /** Toggles the message-content preview shown in the lock-screen push and the in-app banner. */
    fun setShowPreview(enabled: Boolean) {
        updateNotifications { it.copy(showPreview = enabled) }
    }

    /** Toggles the sender's name shown on a notification (independent of [setShowPreview]). */
    fun setShowSenderName(enabled: Boolean) {
        updateNotifications { it.copy(showSenderName = enabled) }
    }

    /** Toggles grouping multiple notifications from the same conversation into one thread. */
    fun setGroupNotifications(enabled: Boolean) {
        updateNotifications { it.copy(groupNotifications = enabled) }
    }

    /** Toggles the app icon's unread badge count. */
    fun setNotificationBadgeEnabled(enabled: Boolean) {
        updateNotifications { it.copy(notificationBadgeEnabled = enabled) }
    }

    /** Toggles the Do-Not-Disturb (quiet-hours) schedule on/off. */
    fun setDndEnabled(enabled: Boolean) {
        updateDnd { it.copy(dndEnabled = enabled) }
    }

    /** Sets the quiet-hours start, formatting the picked time into the stored `HH:mm`. */
    fun setDndStart(hour: Int, minute: Int) {
        updateDnd { it.copy(dndStartTime = DndWindow.formatTimeOfDay(hour, minute)) }
    }

    /** Sets the quiet-hours end, formatting the picked time into the stored `HH:mm`. */
    fun setDndEnd(hour: Int, minute: Int) {
        updateDnd { it.copy(dndEndTime = DndWindow.formatTimeOfDay(hour, minute)) }
    }

    /** Adds/removes a day from the quiet-hours schedule (empty ⇒ every day). */
    fun toggleDndDay(day: DndDay) {
        updateDnd { it.copy(dndDays = DndWindow.toggleDay(it.dndDays, day)) }
    }

    /** Sets a single per-event notification type on/off, preserving every other toggle. */
    fun setNotificationTypeEnabled(type: NotificationType, enabled: Boolean) {
        updateNotifications { NotificationTypeCatalog.toggle(it, type, enabled) }
    }

    /** « Qui est prévenu » (#14064) : règle le cran d'entourage d'UNE action ; une clé inconnue est ignorée. */
    fun setCircleAudience(key: String, choice: RelationAudienceChoice) {
        if (key !in CircleNotify.KEYS) return
        updateNotifications { it.copy(circleAudience = it.circleAudience + (key to choice)) }
    }

    /** Updates the search query that filters the per-event notification-type list (UI only, never synced). */
    fun setNotificationTypeQuery(query: String) {
        _state.update { it.copy(notificationTypeQuery = query) }
    }

    /**
     * A quiet-hours edit also records the device's current UTC offset, so the gateway judges
     * the 22:00-08:00 window in the user's LOCAL time, never in UTC (GW7).
     */
    private fun updateDnd(edit: (UserNotificationPreferences) -> UserNotificationPreferences) {
        updateNotifications { DndWindow.withRecordedOffset(edit(it), deviceUtcOffsetMinutes()) }
    }

    private fun deviceUtcOffsetMinutes(): Int = OffsetDateTime.now().offset.totalSeconds / SECONDS_PER_MINUTE

    private fun updateNotifications(edit: (UserNotificationPreferences) -> UserNotificationPreferences) {
        viewModelScope.launch {
            val updated = edit(notificationPreferencesStore.preferences.value)
            notificationPreferencesStore.setPreferences(updated)
            val cmid = notificationPreferencesSyncRepository.enqueueSync(updated)
            if (cmid != null) workManager.enqueue(OutboxFlushWorker.buildRequest())
        }
    }
}
