package me.meeshy.app.bring

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject

/** Le bouton « Arrêter » de la notification du Bring. */
@AndroidEntryPoint
class BringStopReceiver : BroadcastReceiver() {

    @Inject
    lateinit var stopper: BringStopper

    override fun onReceive(context: Context, intent: Intent) {
        val bringId = intent.getStringExtra(BringRingNotification.EXTRA_BRING_ID)?.takeIf { it.isNotBlank() } ?: return
        stopper.stopByUser(bringId)
    }
}
