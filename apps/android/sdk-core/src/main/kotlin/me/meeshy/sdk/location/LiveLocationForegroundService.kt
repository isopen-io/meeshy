package me.meeshy.sdk.location

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import dagger.hilt.android.AndroidEntryPoint
import me.meeshy.sdk.R
import javax.inject.Inject

/**
 * Service de premier plan de type `location` : tient le partage actif écran éteint, avec une
 * notification persistante portant le bouton « Arrêter ». Il s'arrête seul quand le contrôleur
 * repasse au repos (échéance comprise).
 */
@AndroidEntryPoint
class LiveLocationForegroundService : Service() {

    @Inject lateinit var controller: LiveLocationSharingController

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            controller.stop()
            stopForegroundCompat()
            stopSelf()
            return START_NOT_STICKY
        }
        val notification = buildNotification()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION)
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
        return START_NOT_STICKY
    }

    private fun stopForegroundCompat() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) stopForeground(STOP_FOREGROUND_REMOVE)
        else @Suppress("DEPRECATION") stopForeground(true)
    }

    private fun buildNotification(): Notification {
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            manager.createNotificationChannel(
                NotificationChannel(CHANNEL_ID, getString(R.string.live_location_channel_name), NotificationManager.IMPORTANCE_LOW),
            )
        }
        val stop = PendingIntent.getService(
            this, 0,
            Intent(this, LiveLocationForegroundService::class.java).setAction(ACTION_STOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setContentTitle(getString(R.string.live_location_notification_title))
            .setOngoing(true)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .addAction(0, getString(R.string.live_location_notification_stop), stop)
            .build()
    }

    companion object {
        const val ACTION_STOP = "me.meeshy.sdk.location.action.STOP_LIVE_LOCATION"
        private const val CHANNEL_ID = "live_location_sharing"
        private const val NOTIFICATION_ID = 41_021
    }
}

/** Branche le contrôleur sur le service de premier plan. */
class ForegroundServiceLiveLocationHost @Inject constructor(
    @dagger.hilt.android.qualifiers.ApplicationContext private val context: Context,
) : LiveLocationServiceHost {
    override fun onSharingStarted(conversationId: String, expiresAtMillis: Long) {
        val intent = Intent(context, LiveLocationForegroundService::class.java)
        androidx.core.content.ContextCompat.startForegroundService(context, intent)
    }

    override fun onSharingStopped() {
        context.stopService(Intent(context, LiveLocationForegroundService::class.java))
    }
}
