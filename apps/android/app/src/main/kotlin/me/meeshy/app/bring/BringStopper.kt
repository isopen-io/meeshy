package me.meeshy.app.bring

import android.app.NotificationManager
import android.content.Context
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import me.meeshy.sdk.net.api.BringApi
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Arrêter d'un geste (#13936) : la sonnerie se tait TOUT DE SUITE (optimiste, aucune attente du réseau), puis
 * `DELETE /bring/:bringId` prévient la passerelle, qui l'arrête sur les autres appareils et chez l'expéditeur. Un échec
 * réseau ne fait pas resonner : le Bring expire de lui-même côté serveur.
 */
@Singleton
class BringStopper @Inject constructor(
    @ApplicationContext private val context: Context,
    private val state: BringRingState,
    private val api: BringApi,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    fun stopByUser(bringId: String) {
        silence(bringId)
        scope.launch {
            runCatching { api.stop(bringId) }
                .onFailure { Timber.w("Bring stop not delivered: %s", it.javaClass.simpleName) }
        }
    }

    /** L'expiration locale : le serveur n'émet rien à l'échéance, chaque appareil cesse de lui-même. */
    fun expire(bringId: String) {
        silence(bringId)
    }

    private fun silence(bringId: String) {
        if (!state.stop(bringId)) return
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.cancel(BringRingNotification.NOTIFICATION_ID)
    }
}
