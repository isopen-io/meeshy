package me.meeshy.app.ongoing

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import androidx.core.content.getSystemService
import me.meeshy.app.R
import me.meeshy.app.push.NotificationChannelIds

/**
 * Le canal des notifications en cours (envoi, enregistrement) : discret — ni son, ni vibration, ni
 * pastille —, contenu masqué sur l'écran verrouillé. Créé au démarrage par
 * `NotificationChannelInstaller` ; [ensure] le recrée si un présentateur passe avant (idempotent).
 */
internal object OngoingChannel {

    fun ensure(context: Context) {
        val manager = context.getSystemService<NotificationManager>() ?: return
        if (manager.getNotificationChannel(NotificationChannelIds.CHANNEL_ONGOING) != null) return
        manager.createNotificationChannel(
            NotificationChannel(
                NotificationChannelIds.CHANNEL_ONGOING,
                context.getString(R.string.ongoing_channel_name),
                NotificationManager.IMPORTANCE_LOW,
            ).apply {
                description = context.getString(R.string.ongoing_channel_description)
                setSound(null, null)
                enableVibration(false)
                setShowBadge(false)
                lockscreenVisibility = Notification.VISIBILITY_PRIVATE
            },
        )
    }
}
