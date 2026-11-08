package me.meeshy.app.push

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject

/**
 * Balayer une bannière (`setDeleteIntent`) : l'événement [PushInteraction.Dismissed] part sur le
 * bus, la notification serveur n'est PAS marquée lue (iOS `didDismiss` n'y touche pas). Non exportée.
 */
@AndroidEntryPoint
class PushDismissReceiver : BroadcastReceiver() {

    @Inject
    lateinit var bus: PushInteractionBus

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != ACTION_DISMISSED) return
        bus.emit(PushInteraction.Dismissed(intent.getStringExtra(EXTRA_SERVER_NOTIFICATION_ID)))
    }

    companion object {
        const val ACTION_DISMISSED = "me.meeshy.app.push.action.DISMISSED"
        const val EXTRA_SERVER_NOTIFICATION_ID = "notificationId"
    }
}
