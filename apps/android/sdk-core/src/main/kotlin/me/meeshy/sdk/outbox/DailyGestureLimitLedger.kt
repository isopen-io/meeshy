package me.meeshy.sdk.outbox

import me.meeshy.sdk.model.feedback.DailyGestureLimit
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Les limites du jour qui ont fait RENONCER la file durable, par identifiant de mutation (miroir de
 * `DailyGestureLimitLedger`, iOS) : la file ne rejoue pas le geste, et l'écran qui l'a posé dit pourquoi — l'heure de
 * remise à zéro plutôt qu'un « impossible » muet. Borné à [CAPACITY] entrées : la plus ancienne cède la place.
 */
@Singleton
public class DailyGestureLimitLedger @Inject constructor() {

    private val lock = Any()
    private val byMutation = LinkedHashMap<String, DailyGestureLimit>()

    public fun record(limit: DailyGestureLimit, clientMutationId: String) {
        synchronized(lock) {
            byMutation.remove(clientMutationId)
            while (byMutation.size >= CAPACITY) byMutation.remove(byMutation.keys.first())
            byMutation[clientMutationId] = limit
        }
    }

    /** La limite qui a fait renoncer cette mutation, une seule fois. */
    public fun take(clientMutationId: String): DailyGestureLimit? =
        synchronized(lock) { byMutation.remove(clientMutationId) }

    public companion object {
        public const val CAPACITY: Int = 64
    }
}
