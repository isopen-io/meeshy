package me.meeshy.app.ongoing

import android.annotation.SuppressLint
import android.app.Notification
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import dagger.hilt.android.qualifiers.ApplicationContext
import me.meeshy.app.R
import me.meeshy.app.push.NotificationChannelIds
import me.meeshy.sdk.model.ongoing.OutboxActivityPhase
import me.meeshy.sdk.model.ongoing.OutboxActivitySnapshot
import javax.inject.Inject
import javax.inject.Singleton

/**
 * La notification d'un envoi long : progression indéterminée (la file ne publie pas d'octets),
 * nombre d'envois restants, attente du réseau ; l'issue (Envoyé / Échec) est une notification
 * ordinaire qui se retire seule. Silencieuse, locale à l'appareil, sans service de premier plan.
 * L'écran verrouillé ne reçoit qu'un texte neutre.
 */
@Singleton
internal class OutboxOngoingNotifications @Inject constructor(
    @ApplicationContext private val context: Context,
) : OngoingNotificationSink<OutboxActivitySnapshot> {

    override fun show(snapshot: OutboxActivitySnapshot) = post(ongoing(snapshot))

    override fun conclude(snapshot: OutboxActivitySnapshot, dismissAfterMs: Long) =
        post(
            base(snapshot.label)
                .setOngoing(false)
                .setAutoCancel(true)
                .setTimeoutAfter(dismissAfterMs)
                .setCategory(NotificationCompat.CATEGORY_STATUS)
                .setSmallIcon(
                    if (snapshot.phase == OutboxActivityPhase.Failed) android.R.drawable.stat_notify_error else android.R.drawable.stat_sys_upload_done,
                )
                .build(),
        )

    override fun cancel() {
        NotificationManagerCompat.from(context).cancel(NOTIFICATION_ID)
    }

    private fun ongoing(snapshot: OutboxActivitySnapshot): Notification {
        val waiting = snapshot.phase == OutboxActivityPhase.WaitingForNetwork
        return base(snapshot.label)
            .setOngoing(true)
            .setCategory(NotificationCompat.CATEGORY_PROGRESS)
            .setSmallIcon(if (waiting) android.R.drawable.stat_sys_warning else android.R.drawable.stat_sys_upload)
            .setContentText(detail(snapshot))
            .setProgress(0, 0, !waiting)
            .build()
    }

    private fun detail(snapshot: OutboxActivitySnapshot): String? = when {
        snapshot.phase == OutboxActivityPhase.WaitingForNetwork -> context.getString(R.string.outbox_activity_waiting_network)
        snapshot.remaining > 1 -> context.getString(R.string.outbox_activity_remaining, snapshot.remaining)
        else -> null
    }

    private fun base(title: String): NotificationCompat.Builder {
        OngoingChannel.ensure(context)
        return NotificationCompat.Builder(context, NotificationChannelIds.CHANNEL_ONGOING)
            .setContentTitle(title)
            .setContentIntent(openApp(context))
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setLocalOnly(true)
            .setShowWhen(false)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setPublicVersion(publicVersion(context))
    }

    @SuppressLint("MissingPermission")
    private fun post(notification: Notification) {
        val manager = NotificationManagerCompat.from(context)
        if (!manager.areNotificationsEnabled()) return
        runCatching { manager.notify(NOTIFICATION_ID, notification) }
    }

    internal companion object {
        const val NOTIFICATION_ID: Int = 0x4d4f
    }
}

internal fun openApp(context: Context): PendingIntent {
    val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)
        ?: Intent().setPackage(context.packageName)
    launch.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    return PendingIntent.getActivity(context, 0, launch, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
}

/** Ce que l'écran verrouillé montre : le nom de l'app et « activité en cours », rien d'autre. */
internal fun publicVersion(context: Context): Notification =
    NotificationCompat.Builder(context, NotificationChannelIds.CHANNEL_ONGOING)
        .setSmallIcon(android.R.drawable.stat_notify_sync)
        .setContentTitle(context.getString(R.string.app_name))
        .setContentText(context.getString(R.string.ongoing_activity_public))
        .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
        .setSilent(true)
        .build()
