package me.meeshy.app.bring

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import me.meeshy.sdk.model.relation.BringPushRoute
import me.meeshy.sdk.model.relation.BringPushRouter
import me.meeshy.sdk.model.relation.BringRingLedger
import me.meeshy.sdk.model.relation.BringRingPush
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

/** Ce qui fait sonner ou taire l'appareil : le service au premier plan en production, un enregistreur en test. */
interface BringRinger {
    fun ring(push: BringRingPush)
    fun stop(bringId: String)
}

/**
 * Le Bring qui sonne MAINTENANT sur cet appareil — la seule source que lisent le service de sonnerie, l'écran plein et
 * la notification. `null` = rien ne sonne. Un nouveau Bring remplace celui qui sonnait.
 */
@Singleton
class BringRingState @Inject constructor() {
    private val ringing = MutableStateFlow<BringRingPush?>(null)
    val current: StateFlow<BringRingPush?> = ringing.asStateFlow()

    /**
     * Le dernier Bring qui a sonné, même arrêté depuis : un service démarré au premier plan DOIT se promouvoir avant de
     * s'arrêter, y compris quand l'arrêt l'a devancé de quelques millisecondes.
     */
    @Volatile
    var last: BringRingPush? = null
        private set

    fun ring(push: BringRingPush) {
        last = push
        ringing.value = push
    }

    /** Arrête [bringId] s'il est celui qui sonne ; `false` sinon (un autre sonne, ou rien). */
    fun stop(bringId: String): Boolean {
        val playing = ringing.value ?: return false
        if (playing.bringId != bringId) return false
        return ringing.compareAndSet(playing, null)
    }
}

/**
 * Le push du Bring (#13936, `proche-bring@android`) — `bring` sonne, `bring_stopped` coupe. La loi est
 * [BringPushRouter] (pure) ; ce gardien tient son registre (redélivrance FCM, arrêt arrivé avant sa sonnerie) et passe
 * AVANT le chemin des messages, qui en ferait une bannière ordinaire.
 */
@Singleton
class BringPushHandler @Inject constructor(
    private val ringer: BringRinger,
) {
    private var ledger: BringRingLedger = BringRingLedger.EMPTY

    /** `true` quand [data] était un push du Bring (traité ou écarté) ; `false` laisse passer le chemin suivant. */
    fun handle(data: Map<String, String>, nowMillis: Long): Boolean {
        val route = synchronized(this) {
            val decision = BringPushRouter.route(data, nowMillis, ledger)
            ledger = decision.ledger
            decision.route
        }
        when (route) {
            BringPushRoute.NotABringPush -> return false
            is BringPushRoute.Ring -> ringer.ring(route.push)
            is BringPushRoute.Stop -> ringer.stop(route.bringId)
            is BringPushRoute.Ignore -> Timber.d("Bring push ignored: %s", route.reason)
        }
        return true
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal abstract class BringModule {
    @Binds
    abstract fun bindsBringRinger(ringer: ServiceBringRinger): BringRinger
}
