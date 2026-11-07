package me.meeshy.app.bring

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import me.meeshy.app.R
import me.meeshy.app.push.NotificationChannelIds
import me.meeshy.sdk.model.relation.BringRingFallbackTexts
import me.meeshy.sdk.model.relation.BringRingPush
import me.meeshy.sdk.model.relation.BringRingTexts

/**
 * La notification du Bring (#13936) — celle que porte le service au premier plan. Catégorie ALARME (Ne pas déranger la
 * laisse passer quand les alarmes sont permises, le défaut), écran plein vers [BringRingActivity], « Arrêter » d'un
 * geste ([BringStopReceiver]), retirée à l'expiration. Le canal est MUET : le son est joué par le service, sur le flux
 * alarme, pour sonner même en silencieux et au volume d'alarme que le destinataire a réglé.
 */
internal object BringRingNotification {

    const val NOTIFICATION_ID = 0x0B21_6000
    const val EXTRA_BRING_ID = "bringId"

    fun texts(context: Context, push: BringRingPush): BringRingTexts = push.texts(
        BringRingFallbackTexts(
            title = { name -> context.getString(R.string.bring_incoming_title, name) },
            someone = context.getString(R.string.bring_incoming_someone),
            body = context.getString(R.string.bring_incoming_body),
            stop = context.getString(R.string.bring_incoming_stop),
        ),
    )

    fun ensureChannel(context: Context) {
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.createNotificationChannel(
            NotificationChannel(
                NotificationChannelIds.CHANNEL_BRING,
                context.getString(R.string.bring_channel_name),
                NotificationManager.IMPORTANCE_HIGH,
            ).apply {
                description = context.getString(R.string.bring_channel_description)
                setSound(null, null)
                enableVibration(false)
                setBypassDnd(true)
                setShowBadge(false)
                lockscreenVisibility = Notification.VISIBILITY_PUBLIC
            },
        )
    }

    fun build(context: Context, push: BringRingPush, nowMillis: Long): Notification {
        ensureChannel(context)
        val texts = texts(context, push)
        val fullScreen = PendingIntent.getActivity(
            context,
            push.bringId.hashCode(),
            Intent(context, BringRingActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val stop = PendingIntent.getBroadcast(
            context,
            ("bring-stop:" + push.bringId).hashCode(),
            Intent(context, BringStopReceiver::class.java).putExtra(EXTRA_BRING_ID, push.bringId),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        return NotificationCompat.Builder(context, NotificationChannelIds.CHANNEL_BRING)
            .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            .setContentTitle(texts.title)
            .setContentText(texts.body)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOngoing(true)
            .setContentIntent(fullScreen)
            .setFullScreenIntent(fullScreen, true)
            .addAction(0, texts.stopLabel, stop)
            .setTimeoutAfter((push.expiresAtMillis - nowMillis).coerceAtLeast(1L))
            .build()
    }
}
