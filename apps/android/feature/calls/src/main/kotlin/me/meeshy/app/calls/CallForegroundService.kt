package me.meeshy.app.calls

import android.Manifest
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import dagger.hilt.android.EntryPointAccessors
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.ongoing.CallActivityPhase
import me.meeshy.sdk.model.ongoing.CallActivitySnapshot
import timber.log.Timber

/** Les types de service de premier plan d'un appel, selon ce que l'appareil accorde. */
internal object CallForegroundTypes {
    /** Le type `phoneCall` toujours ; micro si accordé ; caméra seulement en vidéo et accordée. */
    fun resolve(isVideo: Boolean, micGranted: Boolean, cameraGranted: Boolean): Int {
        var types = ServiceInfo.FOREGROUND_SERVICE_TYPE_PHONE_CALL
        if (micGranted) types = types or ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
        if (isVideo && cameraGranted) types = types or ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA
        return types
    }
}

/**
 * Tient l'appel en vie quand l'app passe en arrière-plan : sans service de premier plan,
 * Android 14+ coupe micro et caméra. Rend la notification [CallOngoingNotificationFactory]
 * à chaque instantané publié ; sur « Appel terminé », affiche l'état final puis se retire.
 * Un démarrage refusé par le système n'interrompt jamais l'appel (journal Timber).
 * Après la mort du processus l'appel n'existe plus : aucun redémarrage collant.
 */
class CallForegroundService : Service() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private var collecting: Job? = null
    private var lingering: Job? = null
    private var foreground = false

    private val entryPoint: CallNotificationEntryPoint by lazy {
        EntryPointAccessors.fromApplication(applicationContext, CallNotificationEntryPoint::class.java)
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val snapshot = entryPoint.snapshotHolder().snapshot.value
        if (snapshot == null || snapshot.phase == CallActivityPhase.Ended) {
            stopSelf()
            return START_NOT_STICKY
        }
        if (!enterForeground(snapshot)) {
            stopSelf()
            return START_NOT_STICKY
        }
        if (collecting == null) {
            collecting = scope.launch { entryPoint.snapshotHolder().snapshot.collect(::render) }
        }
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        scope.cancel()
        super.onDestroy()
    }

    private fun render(snapshot: CallActivitySnapshot?) {
        if (snapshot == null) {
            ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
            stopSelf()
            return
        }
        if (snapshot.phase == CallActivityPhase.Ended) {
            retire(snapshot)
            return
        }
        lingering?.cancel()
        if (foreground) notify(snapshot) else if (!enterForeground(snapshot)) stopSelf()
    }

    private fun retire(snapshot: CallActivitySnapshot) {
        notify(snapshot)
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_DETACH)
        foreground = false
        lingering?.cancel()
        lingering = scope.launch {
            delay(CallOngoingNotificationFactory.ENDED_TIMEOUT_MS)
            getSystemService(NotificationManager::class.java)?.cancel(CallOngoingNotificationFactory.NOTIFICATION_ID)
            stopSelf()
        }
    }

    private fun notify(snapshot: CallActivitySnapshot) {
        getSystemService(NotificationManager::class.java)
            ?.notify(CallOngoingNotificationFactory.NOTIFICATION_ID, entryPoint.notificationFactory().build(snapshot))
    }

    /** `false` si le système refuse : l'appel continue alors au premier plan, sans service. */
    private fun enterForeground(snapshot: CallActivitySnapshot): Boolean = try {
        val notification = entryPoint.notificationFactory().build(snapshot)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val types = CallForegroundTypes.resolve(
                isVideo = snapshot.isVideo,
                micGranted = granted(Manifest.permission.RECORD_AUDIO),
                cameraGranted = granted(Manifest.permission.CAMERA),
            )
            startForeground(CallOngoingNotificationFactory.NOTIFICATION_ID, notification, types)
        } else {
            startForeground(CallOngoingNotificationFactory.NOTIFICATION_ID, notification)
        }
        foreground = true
        true
    } catch (failure: Exception) {
        Timber.w(failure, "Foreground call service refused by the system; the call continues in the foreground")
        false
    }

    private fun granted(permission: String): Boolean =
        ContextCompat.checkSelfPermission(this, permission) == PackageManager.PERMISSION_GRANTED
}
