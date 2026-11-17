package me.meeshy.app.push.pipeline

import android.app.NotificationManager
import android.content.Context
import androidx.core.app.NotificationCompat
import dagger.hilt.android.qualifiers.ApplicationContext
import me.meeshy.app.R
import me.meeshy.sdk.model.push.PushGrouping
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Posts the summary of a tray group (one per conversation / post) so several notifications
 * of the same thread fold together, like the iOS `threadIdentifier`. The summary never
 * alerts by itself ([NotificationCompat.GROUP_ALERT_CHILDREN]) and carries NO number : launchers add the
 * numbers of every active notification, the count lives on each banner ([me.meeshy.sdk.model.push.PushBadgePolicy]).
 */
@Singleton
class PushSummaryNotifier @Inject constructor(
    @ApplicationContext private val context: Context,
) {

    fun post(groupKey: String, channelId: String) {
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val summary = NotificationCompat.Builder(context, channelId)
            .setSmallIcon(R.drawable.ic_stat_meeshy)
            .setGroup(groupKey)
            .setGroupSummary(true)
            .setGroupAlertBehavior(NotificationCompat.GROUP_ALERT_CHILDREN)
            .setSilent(true)
            .setAutoCancel(true)
            .build()
        manager.notify(PushGrouping.summaryNotificationId(groupKey), summary)
    }
}
