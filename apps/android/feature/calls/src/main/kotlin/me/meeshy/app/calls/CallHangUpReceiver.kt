package me.meeshy.app.calls

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import dagger.hilt.EntryPoint
import dagger.hilt.InstallIn
import dagger.hilt.android.EntryPointAccessors
import dagger.hilt.components.SingletonComponent

@EntryPoint
@InstallIn(SingletonComponent::class)
interface CallNotificationEntryPoint {
    fun snapshotHolder(): ActiveCallSnapshotHolder
    fun notificationFactory(): CallOngoingNotificationFactory
}

/**
 * Les boutons « Raccrocher » et « Couper/Réactiver le micro » de la notification d'appel :
 * ils agissent sur l'appel en cours sans ouvrir l'app. Sans appel actif, c'est un no-op.
 */
class CallHangUpReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val holder = holderProvider(context)
        when (intent.action) {
            ACTION_HANG_UP -> holder.hangUp()
            ACTION_TOGGLE_MUTE -> holder.toggleMute()
        }
    }

    companion object {
        const val ACTION_HANG_UP = "me.meeshy.app.calls.action.HANG_UP"
        const val ACTION_TOGGLE_MUTE = "me.meeshy.app.calls.action.TOGGLE_MUTE"

        /** Résout le pont depuis le graphe Hilt ; remplaçable en test. */
        internal var holderProvider: (Context) -> ActiveCallSnapshotHolder = { context ->
            EntryPointAccessors.fromApplication(
                context.applicationContext,
                CallNotificationEntryPoint::class.java,
            ).snapshotHolder()
        }
    }
}
