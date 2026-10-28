package me.meeshy.app.push

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import androidx.core.content.getSystemService
import dagger.hilt.android.qualifiers.ApplicationContext
import me.meeshy.app.R
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Eagerly creates the app's notification channels at process start
 * ([me.meeshy.app.MeeshyApplication.onCreate]) — NOT lazily inside
 * [MeeshyFcmService.onMessageReceived], which never runs for a push the OS
 * auto-renders while the app is backgrounded or killed (see [NotificationChannelIds]
 * for why that path exists and why the id must match the gateway's).
 *
 * Installs one channel per category — [NotificationChannelIds.CHANNEL_MESSAGES_V2],
 * [NotificationChannelIds.CHANNEL_SOCIAL_V2], [NotificationChannelIds.CHANNEL_SYSTEM_V2] — and the
 * quiet [NotificationChannelIds.CHANNEL_SILENT] the push pipeline posts to when the preferences
 * refuse an alert. Each v1 predecessor is deleted (one « Messages » entry in the system settings,
 * never two) after its user-set mute is carried over. The calls channel is always reached through a data-only push,
 * so `onMessageReceived` always runs for it — it is left to the call presenter.
 */
@Singleton
class NotificationChannelInstaller @Inject constructor(
    @ApplicationContext private val context: Context,
) {

    fun install() {
        val manager = context.getSystemService<NotificationManager>() ?: return

        listOf(
            Triple(NotificationChannelIds.CHANNEL_MESSAGES_V2, R.string.push_channel_messages_name, R.string.push_channel_messages_description) to
                (NotificationChannelIds.CHANNEL_MESSAGES to NotificationManager.IMPORTANCE_HIGH),
            Triple(NotificationChannelIds.CHANNEL_SOCIAL_V2, R.string.push_channel_social_name, R.string.push_channel_social_description) to
                (NotificationChannelIds.CHANNEL_SOCIAL to NotificationManager.IMPORTANCE_DEFAULT),
            Triple(NotificationChannelIds.CHANNEL_SYSTEM_V2, R.string.push_channel_system_name, R.string.push_channel_system_description) to
                (NotificationChannelIds.CHANNEL_SYSTEM to NotificationManager.IMPORTANCE_HIGH),
        ).forEach { (channel, legacy) ->
            val (id, name, description) = channel
            val (legacyId, importance) = legacy
            manager.createNotificationChannel(alerting(id, name, description, carriedImportance(manager, id, legacyId, importance)))
            manager.deleteNotificationChannel(legacyId)
        }
        manager.createNotificationChannel(
            NotificationChannel(
                NotificationChannelIds.CHANNEL_SILENT,
                context.getString(R.string.push_channel_silent_name),
                NotificationManager.IMPORTANCE_LOW,
            ).apply {
                description = context.getString(R.string.push_channel_silent_description)
                setSound(null, null)
                enableVibration(false)
                setShowBadge(true)
            },
        )
        me.meeshy.app.ongoing.OngoingChannel.ensure(context)
        // Renamed away from — delete the orphaned pre-drift channel so a returning
        // install doesn't carry a dead, possibly user-muted duplicate around forever.
        manager.deleteNotificationChannel(NotificationChannelIds.LEGACY_CHANNEL_MESSAGES)
    }

    /**
     * Un canal v2 créé pour la première fois reprend la COUPURE que l'utilisateur avait posée sur
     * son prédécesseur (bloqué, ou baissé) : la migration rend la vibration, jamais un bruit qu'on
     * avait fait taire. Le son ou la vibration personnalisés du v1 ne se lisent pas de façon fiable
     * et ne sont pas repris.
     */
    private fun carriedImportance(manager: NotificationManager, id: String, legacyId: String, importance: Int): Int {
        if (manager.getNotificationChannel(id) != null) return importance
        val legacy = manager.getNotificationChannel(legacyId)?.importance ?: return importance
        return minOf(legacy, importance)
    }

    /** Un canal qui sonne : nom et description dans la langue de l'appareil, vibration, contenu masqué sur l'écran verrouillé. */
    private fun alerting(id: String, name: Int, description: Int, importance: Int): NotificationChannel =
        NotificationChannel(id, context.getString(name), importance).apply {
            this.description = context.getString(description)
            enableVibration(true)
            lockscreenVisibility = Notification.VISIBILITY_PRIVATE
        }
}
