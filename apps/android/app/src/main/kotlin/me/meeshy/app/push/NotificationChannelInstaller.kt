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
 * Installs the historic [NotificationChannelIds.CHANNEL_MESSAGES] (kept : it is the id the
 * gateway targets and the one a returning user may have tuned), one channel per category
 * ([NotificationChannelIds.CHANNEL_SOCIAL], [NotificationChannelIds.CHANNEL_SYSTEM]) and the
 * quiet [NotificationChannelIds.CHANNEL_SILENT] the push pipeline posts to when the
 * preferences refuse an alert. The calls channel is always reached through a data-only push,
 * so `onMessageReceived` always runs for it — it is left to the call presenter.
 */
@Singleton
class NotificationChannelInstaller @Inject constructor(
    @ApplicationContext private val context: Context,
) {

    fun install() {
        val manager = context.getSystemService<NotificationManager>() ?: return

        listOf(
            NotificationChannelIds.CHANNEL_MESSAGES to NotificationManager.IMPORTANCE_HIGH,
            NotificationChannelIds.CHANNEL_MESSAGES_V2 to NotificationManager.IMPORTANCE_HIGH,
        ).forEach { (id, importance) ->
            manager.createNotificationChannel(
                alerting(id, R.string.push_channel_messages_name, R.string.push_channel_messages_description, importance),
            )
        }
        manager.createNotificationChannel(
            alerting(
                NotificationChannelIds.CHANNEL_SOCIAL_V2,
                R.string.push_channel_social_name,
                R.string.push_channel_social_description,
                NotificationManager.IMPORTANCE_DEFAULT,
            ),
        )
        manager.createNotificationChannel(
            alerting(
                NotificationChannelIds.CHANNEL_SYSTEM_V2,
                R.string.push_channel_system_name,
                R.string.push_channel_system_description,
                NotificationManager.IMPORTANCE_HIGH,
            ),
        )
        // Sans vibration à leur création, immuables : remplacés par les canaux v2 (personne ne les cible).
        manager.deleteNotificationChannel(NotificationChannelIds.CHANNEL_SOCIAL)
        manager.deleteNotificationChannel(NotificationChannelIds.CHANNEL_SYSTEM)
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
        // Renamed away from — delete the orphaned pre-drift channel so a returning
        // install doesn't carry a dead, possibly user-muted duplicate around forever.
        manager.deleteNotificationChannel(NotificationChannelIds.LEGACY_CHANNEL_MESSAGES)
    }

    /** Un canal qui sonne : nom et description dans la langue de l'appareil, vibration, contenu masqué sur l'écran verrouillé. */
    private fun alerting(id: String, name: Int, description: Int, importance: Int): NotificationChannel =
        NotificationChannel(id, context.getString(name), importance).apply {
            this.description = context.getString(description)
            enableVibration(true)
            lockscreenVisibility = Notification.VISIBILITY_PRIVATE
        }
}
