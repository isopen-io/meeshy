package me.meeshy.app.ongoing

import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import me.meeshy.sdk.model.ongoing.VoiceRecordingSnapshot
import timber.log.Timber

/**
 * Tient le vocal en cours au PREMIER PLAN (#13441) : sans lui, Android coupe le micro d'une app dès qu'elle
 * quitte l'écran. Comme l'îlot iOS, la prise continue alors jusqu'à « Arrêter » ou « Annuler » dans la
 * notification, qu'il porte.
 *
 * Il se démarre à l'instant où la prise démarre — l'utilisateur vient de toucher le micro, l'app est au
 * premier plan, le seul moment où Android 14 autorise un service de type `microphone` — et s'arrête avec
 * elle ([VoiceRecordingOngoingNotifications.cancel]). Sans prise dans l'intent (redémarrage du système),
 * il se rend aussitôt : jamais un micro ouvert pour rien.
 */
internal class VoiceRecordingService : Service() {

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val snapshot = intent?.let(::snapshotOf)
        if (snapshot == null) {
            stopSelf()
            return START_NOT_STICKY
        }
        OngoingChannel.ensure(this)
        val notification = VoiceRecordingNotificationFactory.build(this, snapshot)
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(VoiceRecordingOngoingNotifications.NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
            } else {
                startForeground(VoiceRecordingOngoingNotifications.NOTIFICATION_ID, notification)
            }
        } catch (refused: RuntimeException) {
            Timber.w(refused, "premier plan du vocal refusé")
            refusal?.invoke()
            stopSelf()
        }
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        stopForeground(STOP_FOREGROUND_REMOVE)
        super.onDestroy()
    }

    private fun snapshotOf(intent: Intent): VoiceRecordingSnapshot? {
        if (!intent.hasExtra(EXTRA_STARTED_AT)) return null
        return VoiceRecordingSnapshot(
            startedAtEpochMs = intent.getLongExtra(EXTRA_STARTED_AT, 0L),
            statusLabel = intent.getStringExtra(EXTRA_LABEL).orEmpty(),
            isFinished = false,
        )
    }

    internal companion object {
        private const val EXTRA_STARTED_AT = "me.meeshy.app.voice.STARTED_AT"
        private const val EXTRA_LABEL = "me.meeshy.app.voice.LABEL"

        /** Appelé quand le système refuse le premier plan APRÈS que la demande de démarrage a été acceptée. */
        @Volatile
        var refusal: (() -> Unit)? = null

        fun startIntent(context: Context, snapshot: VoiceRecordingSnapshot): Intent =
            Intent(context, VoiceRecordingService::class.java)
                .putExtra(EXTRA_STARTED_AT, snapshot.startedAtEpochMs)
                .putExtra(EXTRA_LABEL, snapshot.statusLabel)
    }
}
