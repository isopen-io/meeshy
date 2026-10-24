package me.meeshy.app.push.pipeline

import android.app.NotificationManager
import android.content.Context
import androidx.core.app.NotificationCompat
import dagger.hilt.android.qualifiers.ApplicationContext
import me.meeshy.sdk.model.push.PushGrouping
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Posts the summary of a tray group (one per conversation / post) so several notifications
 * of the same thread fold together, like the iOS `threadIdentifier`. The summary never
 * alerts by itself ([NotificationCompat.GROUP_ALERT_CHILDREN]) and carries the badge.
 */
@Singleton
class PushSummaryNotifier @Inject constructor(
    @ApplicationContext private val context: Context,
) {

    fun post(groupKey: String, channelId: String, badge: Int?) {
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val summary = NotificationCompat.Builder(context, channelId)
            .setSmallIcon(android.R.drawable.ic_dialog_email)
            .setGroup(groupKey)
            .setGroupSummary(true)
            .setGroupAlertBehavior(NotificationCompat.GROUP_ALERT_CHILDREN)
            .setSilent(true)
            .setAutoCancel(true)
            .apply { badge?.let { setNumber(it) } }
            .build()
        manager.notify(PushGrouping.summaryNotificationId(groupKey), summary)
    }
}
