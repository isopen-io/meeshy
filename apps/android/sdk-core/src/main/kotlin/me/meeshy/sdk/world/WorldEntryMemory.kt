package me.meeshy.sdk.world

import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import me.meeshy.sdk.model.world.WorldEntry
import me.meeshy.sdk.net.NetworkResult

/**
 * L'entrée World Wide lue UNE fois par lancement (miroir de `WorldEntryMemory`, iOS) : le bouton
 * « Partager » se peint depuis elle sans réinterroger le réseau à chaque ouverture du fil.
 * Un échec ne mémorise rien : la prochaine ouverture réessaie.
 */
@Singleton
class WorldEntryMemory @Inject constructor(
    private val repository: WorldEntryRepository,
) {
    @Volatile
    var entry: WorldEntry? = null
        private set

    private val lock = Mutex()

    suspend fun load(): WorldEntry? {
        entry?.let { return it }
        return lock.withLock {
            entry ?: (repository.entry() as? NetworkResult.Success)?.data?.also { entry = it }
        }
    }
}
