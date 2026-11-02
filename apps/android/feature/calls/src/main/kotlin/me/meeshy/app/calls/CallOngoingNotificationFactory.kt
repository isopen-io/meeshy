package me.meeshy.app.calls

import android.app.Notification
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import androidx.core.app.Person
import dagger.hilt.android.qualifiers.ApplicationContext
import me.meeshy.feature.calls.R
import me.meeshy.sdk.model.ongoing.CallActivityPhase
import me.meeshy.sdk.model.ongoing.CallActivitySnapshot
import javax.inject.Inject

/**
 * Compose la notification « appel en cours » : style appel (interlocuteur, statut par phase),
 * chronomètre natif (tabulaire) depuis le décroché, bouton rouge Raccrocher, bouton micro,
 * tap = retour à l'app. Un sous-titre n'apparaît que dans la version complète : l'écran
 * verrouillé ne reçoit que le nom et le statut. L'état final « Appel terminé » est une
 * notification ordinaire qui se retire seule.
 */
class CallOngoingNotificationFactory @Inject constructor(
    @ApplicationContext private val context: Context,
) {

    fun build(snapshot: CallActivitySnapshot): Notification {
        CallChannels.ensureOngoing(context)
        return if (snapshot.phase == CallActivityPhase.Ended) ended(snapshot) else ongoing(snapshot)
    }

    private fun ongoing(snapshot: CallActivitySnapshot): Notification {
        val caller = Person.Builder().setName(snapshot.title).setImportant(true).build()
        val builder = base(snapshot)
            .setOngoing(true)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setStyle(NotificationCompat.CallStyle.forOngoingCall(caller, broadcast(CallHangUpReceiver.ACTION_HANG_UP)))
            .addAction(muteAction(snapshot))
            .setPublicVersion(publicVersion(snapshot))
        snapshot.caption?.let { caption ->
            builder.setContentText("${caption.speaker} · ${caption.text}")
        }
        snapshot.connectedSinceEpochMs?.takeIf { snapshot.phase.countsUp() }?.let { since ->
            builder.setUsesChronometer(true).setWhen(since).setShowWhen(true)
        }
        return builder.build()
    }

    private fun ended(snapshot: CallActivitySnapshot): Notification =
        base(snapshot)
            .setOngoing(false)
            .setAutoCancel(true)
            .setTimeoutAfter(ENDED_TIMEOUT_MS)
            .setCategory(NotificationCompat.CATEGORY_STATUS)
            .build()

    private fun publicVersion(snapshot: CallActivitySnapshot): Notification =
        base(snapshot).setCategory(NotificationCompat.CATEGORY_CALL).build()

    private fun base(snapshot: CallActivitySnapshot): NotificationCompat.Builder =
        NotificationCompat.Builder(context, CallChannels.ONGOING_ID)
            .setSmallIcon(android.R.drawable.sym_action_call)
            .setContentTitle(snapshot.title)
            .setContentText(snapshot.statusLabel)
            .setContentIntent(openApp())
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setLocalOnly(true)

    private fun muteAction(snapshot: CallActivitySnapshot): NotificationCompat.Action {
        val label = context.getString(
            if (snapshot.isMuted) R.string.call_service_unmute else R.string.call_action_mute,
        )
        return NotificationCompat.Action.Builder(0, label, broadcast(CallHangUpReceiver.ACTION_TOGGLE_MUTE)).build()
    }

    private fun CallActivityPhase.countsUp(): Boolean =
        this == CallActivityPhase.Connected || this == CallActivityPhase.OnHold || this == CallActivityPhase.Reconnecting

    private fun broadcast(action: String): PendingIntent =
        PendingIntent.getBroadcast(
            context,
            action.hashCode(),
            Intent(context, CallHangUpReceiver::class.java).setAction(action).setPackage(context.packageName),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

    private fun openApp(): PendingIntent {
        val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)
            ?: Intent().setPackage(context.packageName)
        launch.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        return PendingIntent.getActivity(
            context,
            OPEN_REQUEST_CODE,
            launch,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    companion object {
        const val NOTIFICATION_ID: Int = 7422
        const val ENDED_TIMEOUT_MS: Long = 3_000L
        private const val OPEN_REQUEST_CODE = 7423
    }
}
