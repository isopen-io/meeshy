package me.meeshy.app.ongoing

import android.app.Service
import android.content.Intent
import android.os.Build
import android.os.IBinder
import dagger.hilt.EntryPoint
import dagger.hilt.InstallIn
import dagger.hilt.android.EntryPointAccessors
import dagger.hilt.components.SingletonComponent
import me.meeshy.sdk.model.ongoing.ForegroundTypeLaw
import timber.log.Timber

@EntryPoint
@InstallIn(SingletonComponent::class)
internal interface OngoingServiceEntryPoint {
    fun foreground(): OngoingForeground
}

/**
 * UN service de premier plan pour les notifications en cours qui n'ont pas le leur : il déclare
 * `phoneCall|microphone|camera|mediaPlayback|mediaProjection|dataSync` au manifeste, mais ne passe à
 * `startForeground` que le masque calculé par [ForegroundTypeLaw] — jamais un type dont la permission
 * manque. Aujourd'hui il porte l'envoi (`dataSync`) ; l'appel, le vocal et la lecture gardent leur service.
 *
 * Android exige un `startForeground` après chaque `startForegroundService` : sans activité, il pose une
 * notification neutre puis se rend aussitôt.
 */
internal class OngoingActivityService : Service() {

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val foreground = EntryPointAccessors.fromApplication(this, OngoingServiceEntryPoint::class.java).foreground()
        OngoingChannel.ensure(this)
        val spec = foreground.spec()
        val id = spec?.notificationId ?: FALLBACK_ID
        val notification = spec?.notification ?: publicVersion(this)
        val type = spec?.typeMask ?: ForegroundTypeLaw.DATA_SYNC
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(id, notification, type)
            } else {
                startForeground(id, notification)
            }
        } catch (refused: RuntimeException) {
            Timber.w(refused, "premier plan des notifications en cours refusé")
            foreground.onRefused()
            stopSelf()
            return START_NOT_STICKY
        }
        if (spec == null) stopSelf()
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        stopForeground(STOP_FOREGROUND_REMOVE)
        super.onDestroy()
    }

    private companion object {
        const val FALLBACK_ID: Int = 0x4d4e
    }
}
