package me.meeshy.app.push

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import me.meeshy.app.MainActivity

/**
 * Les deux PendingIntent d'une bannière de push : le toucher ouvre [MainActivity] directement
 * (aucun trampoline) en portant toute la charge utile ([PushTapExtras]) ; le balayage prévient
 * [PushDismissReceiver]. Immuables, un code de requête par notification.
 */
class PushTapIntentFactory(private val context: Context) {

    fun contentIntent(data: Map<String, String>, requestCode: Int): PendingIntent {
        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            PushTapExtras.put(this, data)
        }
        return PendingIntent.getActivity(context, requestCode, intent, FLAGS)
    }

    fun deleteIntent(notificationId: String?, requestCode: Int): PendingIntent {
        val intent = Intent(context, PushDismissReceiver::class.java).apply {
            action = PushDismissReceiver.ACTION_DISMISSED
            notificationId?.let { putExtra(PushDismissReceiver.EXTRA_SERVER_NOTIFICATION_ID, it) }
        }
        return PendingIntent.getBroadcast(context, requestCode, intent, FLAGS)
    }

    private companion object {
        const val FLAGS = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    }
}
