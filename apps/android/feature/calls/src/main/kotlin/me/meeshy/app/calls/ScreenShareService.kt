package me.meeshy.app.calls

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import me.meeshy.feature.calls.R

/**
 * Tient la projection d'écran (MediaProjection) d'un partage pendant l'appel. Android 14+
 * exige un service de premier plan de type `mediaProjection` AVANT d'obtenir la projection.
 * Arrêter le partage ou finir l'appel (`stopService` / [stop]) libère la projection.
 */
class ScreenShareService : Service() {

    private var projection: MediaProjection? = null
    private val onProjectionStopped = object : MediaProjection.Callback() {
        override fun onStop() {
            stopSelf()
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val resultCode = intent?.getIntExtra(EXTRA_RESULT_CODE, 0) ?: 0
        val grant = intent?.getParcelableExtraCompat()
        if (intent == null || grant == null) {
            stopSelf()
            return START_NOT_STICKY
        }
        enterForeground()
        release()
        projection = projectionFactory(this, resultCode, grant)?.also { it.registerCallback(onProjectionStopped, null) }
        if (projection == null) stopSelf()
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        release()
        super.onDestroy()
    }

    private fun release() {
        projection?.let {
            runCatching { it.unregisterCallback(onProjectionStopped) }
            it.stop()
        }
        projection = null
    }

    private fun enterForeground() {
        val manager = getSystemService(NotificationManager::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            manager.createNotificationChannel(
                NotificationChannel(CHANNEL_ID, getString(R.string.call_screen_share_channel), NotificationManager.IMPORTANCE_LOW),
            )
        }
        val notification: Notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(applicationInfo.icon)
            .setContentTitle(getString(R.string.call_screen_share_notification_title))
            .setContentText(getString(R.string.call_screen_share_notification_text))
            .setOngoing(true)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .build()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION)
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    @Suppress("DEPRECATION")
    private fun Intent.getParcelableExtraCompat(): Intent? =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            getParcelableExtra(EXTRA_GRANT, Intent::class.java)
        } else {
            getParcelableExtra(EXTRA_GRANT)
        }

    companion object {
        private const val CHANNEL_ID = "call_screen_share"
        private const val NOTIFICATION_ID = 7421
        private const val EXTRA_RESULT_CODE = "resultCode"
        private const val EXTRA_GRANT = "grant"

        /** Obtient la projection depuis l'accord de l'utilisateur ; remplaçable en test. */
        internal var projectionFactory: (Context, Int, Intent) -> MediaProjection? = { context, resultCode, grant ->
            context.getSystemService(MediaProjectionManager::class.java).getMediaProjection(resultCode, grant)
        }

        /** Démarre le partage avec l'accord (`resultCode`, `data`) rendu par la demande de capture. */
        fun start(context: Context, resultCode: Int, grant: Intent) {
            val intent = Intent(context, ScreenShareService::class.java)
                .putExtra(EXTRA_RESULT_CODE, resultCode)
                .putExtra(EXTRA_GRANT, grant)
            androidx.core.content.ContextCompat.startForegroundService(context, intent)
        }

        /** Arrête le partage (ou fin d'appel) : la projection est libérée par `onDestroy`. */
        fun stop(context: Context) {
            context.stopService(Intent(context, ScreenShareService::class.java))
        }
    }
}
