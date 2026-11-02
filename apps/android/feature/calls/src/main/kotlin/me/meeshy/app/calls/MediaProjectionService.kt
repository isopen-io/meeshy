package me.meeshy.app.calls

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import dagger.Binds
import dagger.Module
import dagger.hilt.EntryPoint
import dagger.hilt.InstallIn
import dagger.hilt.android.EntryPointAccessors
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import me.meeshy.feature.calls.R
import me.meeshy.sdk.model.ongoing.CallActivityPhase
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

@EntryPoint
@InstallIn(SingletonComponent::class)
interface MediaProjectionEntryPoint {
    fun session(): MediaProjectionSession
    fun snapshotHolder(): ActiveCallSnapshotHolder
}

/**
 * Tient la projection d'écran : service de premier plan de type `mediaProjection`, démarré
 * seulement APRÈS l'accord du système. La projection s'obtient une fois le service au premier
 * plan, avec un rappel d'arrêt posé avant toute capture (obligatoire dès Android 14, où le jeton
 * est à usage unique). La notification persistante propose « Arrêter » ; la fin de l'appel
 * arrête la projection et retire la notification.
 */
class MediaProjectionService : Service() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private var watchingCall: Job? = null
    private var projection: MediaProjection? = null

    private val entryPoint: MediaProjectionEntryPoint by lazy {
        entryPointResolver(applicationContext)
    }

    private val onProjectionStopped = object : MediaProjection.Callback() {
        override fun onStop() {
            entryPoint.session().onSystemStop()
            stopSelf()
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            entryPoint.session().stop()
            stopSelf()
            return START_NOT_STICKY
        }
        val grant = intent?.grant()
        if (intent == null || grant == null) {
            fail()
            return START_NOT_STICKY
        }
        val purpose = purposeOf(intent)
        if (!enterForeground(purpose)) {
            fail()
            return START_NOT_STICKY
        }
        acquire(intent.getIntExtra(EXTRA_RESULT_CODE, 0), grant)
        watchCall()
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        scope.cancel()
        release()
        entryPoint.session().onServiceDestroyed()
        super.onDestroy()
    }

    private fun acquire(resultCode: Int, grant: Intent) {
        release()
        val acquired = try {
            projectionFactory(this, resultCode, grant)
        } catch (failure: SecurityException) {
            Timber.w(failure, "Media projection token refused (already consumed or revoked)")
            null
        }
        if (acquired == null) {
            fail()
            return
        }
        acquired.registerCallback(onProjectionStopped, null)
        projection = acquired
        entryPoint.session().onProjectionAcquired(acquired)
    }

    private fun watchCall() {
        if (watchingCall != null) return
        watchingCall = scope.launch {
            entryPoint.snapshotHolder().snapshot.collect { snapshot ->
                if (snapshot == null || snapshot.phase == CallActivityPhase.Ended) {
                    entryPoint.session().onCallEnded()
                    stopSelf()
                }
            }
        }
    }

    private fun fail() {
        entryPoint.session().onProjectionFailed()
        stopSelf()
    }

    private fun release() {
        projection?.let {
            runCatching { it.unregisterCallback(onProjectionStopped) }
            runCatching { it.stop() }
        }
        projection = null
    }

    private fun enterForeground(purpose: MediaProjectionPurpose): Boolean = try {
        val notification = buildNotification(this, purpose)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION)
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
        true
    } catch (failure: Exception) {
        Timber.w(failure, "Media projection foreground service refused by the system")
        false
    }

    @Suppress("DEPRECATION")
    private fun Intent.grant(): Intent? =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            getParcelableExtra(EXTRA_GRANT, Intent::class.java)
        } else {
            getParcelableExtra(EXTRA_GRANT)
        }

    companion object {
        const val CHANNEL_ID = "call_media_projection"
        const val NOTIFICATION_ID = 7422
        const val ACTION_STOP = "me.meeshy.app.calls.action.STOP_MEDIA_PROJECTION"
        private const val EXTRA_RESULT_CODE = "resultCode"
        private const val EXTRA_GRANT = "grant"
        private const val EXTRA_PURPOSE = "purpose"

        /** Résout le graphe Hilt ; remplaçable en test. */
        internal var entryPointResolver: (Context) -> MediaProjectionEntryPoint = { context ->
            EntryPointAccessors.fromApplication(context, MediaProjectionEntryPoint::class.java)
        }

        /** Obtient la projection depuis l'accord ; remplaçable en test. */
        internal var projectionFactory: (Context, Int, Intent) -> MediaProjection? = { context, resultCode, grant ->
            context.getSystemService(MediaProjectionManager::class.java).getMediaProjection(resultCode, grant)
        }

        internal fun startIntent(
            context: Context,
            purpose: MediaProjectionPurpose,
            consent: MediaProjectionConsent.Granted,
        ): Intent = Intent(context, MediaProjectionService::class.java)
            .putExtra(EXTRA_RESULT_CODE, consent.resultCode)
            .putExtra(EXTRA_GRANT, consent.data)
            .putExtra(EXTRA_PURPOSE, purpose.name)

        private fun purposeOf(intent: Intent): MediaProjectionPurpose =
            MediaProjectionPurpose.values().firstOrNull { it.name == intent.getStringExtra(EXTRA_PURPOSE) }
                ?: MediaProjectionPurpose.ScreenShare

        internal fun buildNotification(context: Context, purpose: MediaProjectionPurpose): Notification {
            ensureChannel(context)
            val recording = purpose == MediaProjectionPurpose.Recording
            val stop = PendingIntent.getService(
                context,
                0,
                Intent(context, MediaProjectionService::class.java).setAction(ACTION_STOP),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
            return NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(context.applicationInfo.icon)
                .setContentTitle(
                    context.getString(
                        if (recording) R.string.call_projection_recording_title else R.string.call_projection_share_title,
                    ),
                )
                .setContentText(
                    context.getString(
                        if (recording) R.string.call_projection_recording_text else R.string.call_projection_share_text,
                    ),
                )
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setCategory(NotificationCompat.CATEGORY_SERVICE)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .addAction(0, context.getString(R.string.call_projection_stop), stop)
                .build()
        }

        private fun ensureChannel(context: Context) {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
            val manager = context.getSystemService(NotificationManager::class.java) ?: return
            manager.createNotificationChannel(
                NotificationChannel(
                    CHANNEL_ID,
                    context.getString(R.string.call_projection_channel_name),
                    NotificationManager.IMPORTANCE_LOW,
                ),
            )
        }
    }
}

@Singleton
class AndroidMediaProjectionServiceLauncher @Inject constructor(
    @ApplicationContext private val context: Context,
) : MediaProjectionServiceLauncher {

    override fun start(purpose: MediaProjectionPurpose, consent: MediaProjectionConsent.Granted) {
        try {
            ContextCompat.startForegroundService(context, MediaProjectionService.startIntent(context, purpose, consent))
        } catch (failure: Exception) {
            Timber.w(failure, "Media projection service start refused")
        }
    }

    override fun stop() {
        try {
            context.stopService(Intent(context, MediaProjectionService::class.java))
        } catch (failure: Exception) {
            Timber.w(failure, "Media projection service stop failed")
        }
    }
}

@Module
@InstallIn(SingletonComponent::class)
interface MediaProjectionModule {
    @Binds
    fun bindMediaProjectionServiceLauncher(impl: AndroidMediaProjectionServiceLauncher): MediaProjectionServiceLauncher
}
