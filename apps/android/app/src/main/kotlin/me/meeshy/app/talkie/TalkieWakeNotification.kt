package me.meeshy.app.talkie

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import me.meeshy.app.MainActivity
import me.meeshy.app.R
import me.meeshy.app.push.NotificationChannelIds
import me.meeshy.sdk.model.relation.TalkieWakePush

/**
 * La notification du réveil du talkie (#17144) — celle que porte le service au premier plan : « X vous parle »,
 * visible sur l'écran verrouillé. Le canal est MUET : le seul son est la voix, jouée par le service.
 *
 * C'est la SEULE notification de Meeshy dont on fait jouer la voix sans ouvrir l'app (directive porteur 2026-11-08) :
 * « Lire » ([ACTION_PLAY]) parle au service, jamais à l'activité. Aucune autre notification ne porte cette action — le
 * témoin `TalkieWakePlayActionGuardTest` y veille.
 */
internal object TalkieWakeNotification {

    const val NOTIFICATION_ID = 0x0B21_7000
    const val ACTION_PLAY = "me.meeshy.app.talkie.PLAY"

    fun ensureChannel(context: Context) {
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.createNotificationChannel(
            NotificationChannel(
                NotificationChannelIds.CHANNEL_TALKIE,
                context.getString(R.string.talkie_wake_channel_name),
                NotificationManager.IMPORTANCE_HIGH,
            ).apply {
                description = context.getString(R.string.talkie_wake_channel_description)
                setSound(null, null)
                enableVibration(false)
                setShowBadge(false)
                lockscreenVisibility = Notification.VISIBILITY_PUBLIC
            },
        )
    }

    fun title(context: Context, push: TalkieWakePush): String = push.displayTitle(
        fallback = { name -> context.getString(R.string.talkie_incoming_title, name) },
        someone = context.getString(R.string.talkie_incoming_someone),
    )

    fun build(context: Context, push: TalkieWakePush): Notification {
        ensureChannel(context)
        val open = PendingIntent.getActivity(
            context,
            ("talkie-open:" + push.talkieId).hashCode(),
            Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val play = PendingIntent.getForegroundService(
            context,
            ("talkie-play:" + push.talkieId).hashCode(),
            Intent(context, TalkieWakeService::class.java).setAction(ACTION_PLAY),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val playLabel = context.getString(R.string.talkie_wake_play)
        return NotificationCompat.Builder(context, NotificationChannelIds.CHANNEL_TALKIE)
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setContentTitle(title(context, push))
            .apply { push.body?.let { setContentText(it) } }
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOngoing(true)
            .setContentIntent(open)
            .addAction(NotificationCompat.Action.Builder(0, playLabel, play).build())
            .build()
    }
}
