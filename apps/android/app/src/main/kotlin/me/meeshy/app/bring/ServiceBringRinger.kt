package me.meeshy.app.bring

import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.Looper
import androidx.core.content.ContextCompat
import dagger.hilt.android.qualifiers.ApplicationContext
import me.meeshy.sdk.model.relation.BringRingPush
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Fait sonner par le service au premier plan [BringRingService] (flux ALARME). Un push FCM haute priorité autorise le
 * démarrage depuis l'arrière-plan ; si le système le refuse quand même, la notification est posée seule — on voit le
 * Bring, sans son, plutôt que rien.
 */
@Singleton
class ServiceBringRinger @Inject constructor(
    @ApplicationContext private val context: Context,
    private val state: BringRingState,
    private val stopper: BringStopper,
) : BringRinger {

    private val expiry = Handler(Looper.getMainLooper())

    override fun ring(push: BringRingPush) {
        state.ring(push)
        runCatching {
            ContextCompat.startForegroundService(context, Intent(context, BringRingService::class.java))
        }.onFailure { failure ->
            Timber.w("Bring service refused (%s): notification only", failure.javaClass.simpleName)
            val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            val now = System.currentTimeMillis()
            manager.notify(BringRingNotification.NOTIFICATION_ID, BringRingNotification.build(context, push, now))
            // Sans service, personne d'autre ne tient l'échéance : l'état se libère à l'expiration.
            expiry.postDelayed({ stopper.expire(push.bringId) }, (push.expiresAtMillis - now).coerceAtLeast(0L))
        }
    }

    override fun stop(bringId: String) {
        if (!state.stop(bringId)) return
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.cancel(BringRingNotification.NOTIFICATION_ID)
    }
}
