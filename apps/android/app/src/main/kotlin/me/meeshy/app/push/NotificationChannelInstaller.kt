package me.meeshy.app.push

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

        manager.createNotificationChannel(
            NotificationChannel(
                NotificationChannelIds.CHANNEL_MESSAGES,
                "Messages",
                NotificationManager.IMPORTANCE_HIGH,
            ).apply {
                description = "New messages and mentions"
            },
        )
        manager.createNotificationChannel(
            NotificationChannel(
                NotificationChannelIds.CHANNEL_SOCIAL,
                context.getString(R.string.push_channel_social_name),
                NotificationManager.IMPORTANCE_DEFAULT,
            ).apply {
                description = context.getString(R.string.push_channel_social_description)
            },
        )
        manager.createNotificationChannel(
            NotificationChannel(
                NotificationChannelIds.CHANNEL_SYSTEM,
                context.getString(R.string.push_channel_system_name),
                NotificationManager.IMPORTANCE_HIGH,
            ).apply {
                description = context.getString(R.string.push_channel_system_description)
            },
        )
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
}
