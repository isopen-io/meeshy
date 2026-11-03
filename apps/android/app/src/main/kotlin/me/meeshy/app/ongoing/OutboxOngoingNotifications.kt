package me.meeshy.app.ongoing

import android.content.Context
import android.content.Intent
import android.app.Notification
import android.app.PendingIntent
import androidx.core.app.NotificationCompat
import me.meeshy.app.R
import me.meeshy.app.push.NotificationChannelIds
import me.meeshy.sdk.model.ongoing.LiveActivityPlans
import me.meeshy.sdk.model.ongoing.OngoingActivityKind
import me.meeshy.sdk.model.ongoing.OutboxActivitySnapshot
import javax.inject.Inject
import javax.inject.Singleton

/**
 * La notification d'un envoi long : « 2 sur 5 envoyés » avec barre de progression (indéterminée tant que
 * le total est inconnu), attente du réseau, bouton « Annuler » ; l'issue (Envoyé / Échec) est une
 * notification ordinaire qui se retire seule. Le plan vient de [LiveActivityPlans.outbox], l'exécution de
 * [OngoingActivityHost] (ordre sérialisé, service de premier plan `dataSync`). L'écran verrouillé ne
 * reçoit qu'un texte neutre.
 */
@Singleton
internal class OutboxOngoingNotifications @Inject constructor(
    private val host: OngoingActivityHost,
    private val labels: OngoingLabels,
) : OngoingNotificationSink<OutboxActivitySnapshot> {

    override fun show(snapshot: OutboxActivitySnapshot) = host.start(LiveActivityPlans.outbox(snapshot, labels.current()))

    override fun conclude(snapshot: OutboxActivitySnapshot, dismissAfterMs: Long) =
        host.end(OngoingActivityKind.Outbox, LiveActivityPlans.outbox(snapshot, labels.current()), dismissAfterMs)

    override fun cancel() = host.end(OngoingActivityKind.Outbox)
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
