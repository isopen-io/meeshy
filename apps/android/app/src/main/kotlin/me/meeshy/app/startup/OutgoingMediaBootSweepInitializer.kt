package me.meeshy.app.startup

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import javax.inject.Inject
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import me.meeshy.sdk.media.OutgoingMediaBootSweep
import timber.log.Timber

/**
 * Au démarrage, les blobs orphelins et les copies nettoyées en clair laissés par un processus tué en plein envoi quittent
 * le disque (#13555). L'heure de démarrage est relevée ICI, sur le fil principal : tout fichier plus récent appartient au
 * processus courant et reste. Le balayage part sur IO et ne bloque jamais le démarrage.
 */
class OutgoingMediaBootSweepInitializer @Inject constructor(
    private val sweep: OutgoingMediaBootSweep,
) : AppInitializer {
    override fun initialize() {
        val startedAt = System.currentTimeMillis()
        CoroutineScope(SupervisorJob() + Dispatchers.IO).launch {
            runCatching { sweep.sweep(startedAt) }.onFailure { Timber.w(it, "Outgoing media boot sweep failed") }
        }
    }
}

@Module
@InstallIn(SingletonComponent::class)
interface OutgoingMediaBootSweepModule {
    @Binds
    @IntoSet
    fun outgoingMediaBootSweepInitializer(impl: OutgoingMediaBootSweepInitializer): AppInitializer
}
