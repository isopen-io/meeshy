package me.meeshy.app.startup

import android.os.Process
import android.os.SystemClock
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
import me.meeshy.sdk.media.MediaBlobMigrator
import me.meeshy.sdk.media.OutgoingMediaBootSweep
import me.meeshy.sdk.media.PendingMediaSweeper
import timber.log.Timber

/**
 * Au démarrage, les médias en file se remettent d'aplomb (#14710) : les octets restés en BLOB passent en fichiers scellés,
 * puis un envoi dont le fichier a disparu passe en échec et un blob que plus aucun envoi ne nomme quitte le disque.
 * Sur IO, jamais sur le chemin du démarrage ; chaque étape échoue seule.
 */
class PendingMediaRecoveryInitializer @Inject constructor(
    private val migrator: MediaBlobMigrator,
    private val sweeper: PendingMediaSweeper,
) : AppInitializer {
    override fun initialize() {
        val startedAt = OutgoingMediaBootSweep.processStartedAt(
            wallNowMillis = System.currentTimeMillis(),
            uptimeNowMillis = SystemClock.uptimeMillis(),
            processStartUptimeMillis = Process.getStartUptimeMillis(),
        )
        CoroutineScope(SupervisorJob() + Dispatchers.IO).launch {
            runCatching { migrator.migrate() }.onFailure { Timber.w(it, "Media blob migration failed") }
            runCatching { sweeper.sweep(startedAt - OutgoingMediaBootSweep.CLOCK_MARGIN_MS) }
                .onFailure { Timber.w(it, "Pending media sweep failed") }
        }
    }
}

@Module
@InstallIn(SingletonComponent::class)
interface PendingMediaRecoveryModule {
    @Binds
    @IntoSet
    fun pendingMediaRecoveryInitializer(impl: PendingMediaRecoveryInitializer): AppInitializer
}
