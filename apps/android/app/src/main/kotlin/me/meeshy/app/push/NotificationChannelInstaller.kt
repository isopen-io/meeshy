package me.meeshy.app.push

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import androidx.core.content.getSystemService
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Eagerly creates the app's notification channels at process start
 * ([me.meeshy.app.MeeshyApplication.onCreate]) — NOT lazily inside
 * [MeeshyFcmService.onMessageReceived], which never runs for a push the OS
 * auto-renders while the app is backgrounded or killed (see [NotificationChannelIds]
 * for why that path exists and why the id must match the gateway's).
 *
 * Only [NotificationChannelIds.CHANNEL_MESSAGES] is installed here: the calls
 * channel is always reached through a data-only push, so `onMessageReceived`
 * always runs for it (already handled, unaffected by this drift) — installing it
 * here too would duplicate, not fix, existing behaviour.
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
        // Renamed away from — delete the orphaned pre-drift channel so a returning
        // install doesn't carry a dead, possibly user-muted duplicate around forever.
        manager.deleteNotificationChannel(NotificationChannelIds.LEGACY_CHANNEL_MESSAGES)
    }
}
