package me.meeshy.app.talkie

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import me.meeshy.sdk.model.relation.TalkieWakePush
import me.meeshy.sdk.model.relation.TalkieWakePushRouter
import me.meeshy.sdk.model.relation.TalkieWakeRoute
import timber.log.Timber

/** Ce qui réveille l'appareil pour un talkie : le service au premier plan en production, un enregistreur en test. */
interface TalkieWaker {
    fun wake(push: TalkieWakePush)
}

/**
 * Le talkie qui a réveillé cet appareil (#17144) — la seule source que lisent le service de réveil et sa notification.
 * `null` = rien à réveiller. Un nouveau réveil remplace le précédent.
 */
@Singleton
class TalkieWakeState @Inject constructor() {
    private val waking = MutableStateFlow<TalkieWakePush?>(null)
    val current: StateFlow<TalkieWakePush?> = waking.asStateFlow()

    /** Le dernier réveil, même fini : un service démarré au premier plan DOIT se promouvoir avant de s'arrêter. */
    @Volatile
    var last: TalkieWakePush? = null
        private set

    fun wake(push: TalkieWakePush) {
        last = push
        waking.value = push
    }

    /** Termine [talkieId] s'il est celui qui réveille ; `false` sinon. */
    fun finish(talkieId: String): Boolean {
        val active = waking.value ?: return false
        if (active.talkieId != talkieId) return false
        return waking.compareAndSet(active, null)
    }
}

/**
 * Le push de réveil du talkie (#17141, #17144) — `talkie_incoming`, FCM data haute priorité. La loi est
 * [TalkieWakePushRouter] (pure) ; ce gardien retient les réveils déjà vus (redélivrance FCM, bornée) et passe AVANT le
 * chemin des messages, qui en ferait une bannière ordinaire.
 */
@Singleton
class TalkieWakeHandler @Inject constructor(
    private val waker: TalkieWaker,
) {
    private val woken = ArrayDeque<String>()

    /** `true` quand [data] était un push de réveil du talkie (traité ou écarté) ; `false` laisse passer le chemin suivant. */
    fun handle(data: Map<String, String>): Boolean {
        val route = synchronized(this) {
            val decision = TalkieWakePushRouter.route(data) { it in woken }
            if (decision is TalkieWakeRoute.Wake) remember(decision.push.talkieId)
            decision
        }
        when (route) {
            TalkieWakeRoute.NotATalkieWake -> return false
            is TalkieWakeRoute.Wake -> waker.wake(route.push)
            is TalkieWakeRoute.Ignore -> Timber.d("Talkie wake push ignored: %s", route.reason)
        }
        return true
    }

    private fun remember(talkieId: String) {
        woken.addLast(talkieId)
        while (woken.size > REMEMBERED) woken.removeFirst()
    }

    private companion object {
        const val REMEMBERED = 32
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal abstract class TalkieWakeModule {
    @Binds
    abstract fun bindsTalkieWaker(waker: ServiceTalkieWaker): TalkieWaker
}
