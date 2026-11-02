package me.meeshy.app.calls

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build
import me.meeshy.feature.calls.R

/** Le canal dédié de la notification « appel en cours » : discret, jamais de son ni de vibration. */
internal object CallChannels {
    const val ONGOING_ID: String = "call_ongoing"

    fun ensureOngoing(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = context.getSystemService(NotificationManager::class.java) ?: return
        val channel = NotificationChannel(
            ONGOING_ID,
            context.getString(R.string.call_service_channel_name),
            NotificationManager.IMPORTANCE_LOW,
        ).apply {
            setSound(null, null)
            enableVibration(false)
            setShowBadge(false)
        }
        manager.createNotificationChannel(channel)
    }
}
