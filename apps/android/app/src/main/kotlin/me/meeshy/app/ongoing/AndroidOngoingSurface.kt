package me.meeshy.app.ongoing

import android.annotation.SuppressLint
import android.app.Notification
import android.content.Context
import android.app.NotificationManager
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.getSystemService
import dagger.hilt.android.qualifiers.ApplicationContext
import me.meeshy.sdk.model.ongoing.LiveActivityPlan
import me.meeshy.sdk.model.ongoing.OngoingActivityKind
import javax.inject.Inject
import javax.inject.Singleton

/** Pose les plans de l'hôte en notifications, sous l'identifiant stable de leur type. */
@Singleton
internal class AndroidOngoingSurface @Inject constructor(
    @ApplicationContext private val context: Context,
    private val notifier: LiveActivityNotifier,
    private val foreground: OngoingForeground,
) : OngoingSurface {

    override fun show(plan: LiveActivityPlan) {
        post(plan.kind.notificationId, notifier.build(plan))
        foreground.track(plan)
    }

    override fun conclude(plan: LiveActivityPlan, dismissAfterMs: Long) {
        foreground.release(plan.kind)
        NotificationManagerCompat.from(context).cancel(plan.kind.notificationId)
        post(outcomeId(plan.kind), notifier.build(plan, timeoutMs = dismissAfterMs))
    }

    override fun cancel(kind: OngoingActivityKind) {
        foreground.release(kind)
        val manager = NotificationManagerCompat.from(context)
        manager.cancel(kind.notificationId)
        manager.cancel(outcomeId(kind))
    }

    override fun cancelUnknown(keep: Set<OngoingActivityKind>) {
        val manager = context.getSystemService<NotificationManager>() ?: return
        val known = OngoingActivityKind.entries.filter { it !in keep }.flatMap { listOf(it.notificationId, outcomeId(it)) }.toSet()
        manager.activeNotifications.filter { it.id in known }.forEach { manager.cancel(it.id) }
    }

    @SuppressLint("MissingPermission")
    private fun post(id: Int, notification: Notification) {
        val manager = NotificationManagerCompat.from(context)
        if (!manager.areNotificationsEnabled()) return
        runCatching { manager.notify(id, notification) }
    }
}

/** L'issue (Envoyé, Échec) vit sous un identifiant à part : elle survit à l'arrêt du service qui portait l'envoi. */
internal fun outcomeId(kind: OngoingActivityKind): Int = kind.notificationId + OUTCOME_OFFSET

private const val OUTCOME_OFFSET: Int = 0x100
