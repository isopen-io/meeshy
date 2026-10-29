package me.meeshy.sdk.user

import java.util.concurrent.ConcurrentHashMap
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive

/**
 * Une seule exécution à la fois par clé : un second appelant attend le résultat du premier au lieu de relancer le
 * travail (une carte de visite vue deux fois ne part qu'une fois au serveur). Si le premier appelant est annulé
 * (une bulle qui sort de l'écran), le suivant reprend le travail à son compte.
 */
internal class SingleFlight<K : Any, V> {
    private val inFlight = ConcurrentHashMap<K, CompletableDeferred<V>>()

    suspend fun run(key: K, work: suspend () -> V): V {
        while (true) {
            val mine = CompletableDeferred<V>()
            val other = inFlight.putIfAbsent(key, mine)
            if (other == null) {
                try {
                    return work().also { mine.complete(it) }
                } catch (failure: Throwable) {
                    mine.cancel()
                    throw failure
                } finally {
                    inFlight.remove(key, mine)
                }
            }
            try {
                return other.await()
            } catch (cancelled: CancellationException) {
                currentCoroutineContext().ensureActive()
            }
        }
    }
}
