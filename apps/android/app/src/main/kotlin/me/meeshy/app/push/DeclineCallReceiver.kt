package me.meeshy.app.push

import android.app.NotificationManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import dagger.hilt.android.AndroidEntryPoint
import me.meeshy.sdk.socket.CallSignalManager
import me.meeshy.sdk.socket.SocketManager
import timber.log.Timber
import javax.inject.Inject

/**
 * Le bouton « Refuser » de la notification CallStyle. Trois devoirs :
 *
 *  1. Couper la sonnerie locale — cancel de la notification (id = hash du
 *     callId, le même que [MeeshyFcmService.showIncomingCallNotification]).
 *  2. Taire une redélivrance : le callId est mémorisé dans le
 *     [IncomingCallRingStore], donc un ring push retardataire/retenté du même
 *     appel ne re-sonne pas un appel déjà refusé.
 *  3. Prévenir le CORRESPONDANT — sans quoi il sonne 60 s dans le vide :
 *     `call:end` immédiat si la socket est vivante, sinon via le
 *     [DeclinedCallStore] que [me.meeshy.app.MeeshyApplication] draine à la
 *     prochaine connexion (le process vient d'être réveillé par FCM, la
 *     connexion suit en général de quelques secondes ; `call:end` est
 *     idempotent côté gateway, un rejeu tardif est un no-op).
 */
@AndroidEntryPoint
class DeclineCallReceiver : BroadcastReceiver() {

    @Inject
    lateinit var signalManager: CallSignalManager

    @Inject
    lateinit var socketManager: SocketManager

    @Inject
    lateinit var declinedCalls: DeclinedCallStore

    @Inject
    lateinit var ringStore: IncomingCallRingStore

    override fun onReceive(context: Context, intent: Intent) {
        val callId = intent.getStringExtra(MeeshyFcmService.EXTRA_CALL_ID)
            ?.takeIf { it.isNotBlank() } ?: return
        Timber.d("Call declined from notification: $callId")

        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.cancel(callId.hashCode())
        ringStore.remember(callId, System.currentTimeMillis())

        if (socketManager.isConnected) {
            signalManager.emitEnd(callId, reason = REASON_REJECTED)
        } else {
            declinedCalls.markDeclined(callId)
        }
    }

    private companion object {
        /** Raison wire d'un refus explicite — le journal de l'appelant dit « refusé », pas « manqué ». */
        const val REASON_REJECTED = "rejected"
    }
}
