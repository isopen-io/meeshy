package me.meeshy.app.share

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
import me.meeshy.app.startup.AppInitializer
import me.meeshy.sdk.share.SharePendingShareStore
import timber.log.Timber

/** Au lancement, les dossiers de copies d'un partage abandonné depuis plus de sept jours, sans fiche, quittent le disque. */
class ShareStagingSweepInitializer @Inject constructor(
    private val store: SharePendingShareStore,
) : AppInitializer {
    override fun initialize() {
        CoroutineScope(SupervisorJob() + Dispatchers.IO).launch {
            runCatching { ShareStagingSweeper(store::mediaRoot, store::hasRecord).sweep() }
                .onFailure { Timber.w(it, "Share staging sweep failed") }
        }
    }
}

@Module
@InstallIn(SingletonComponent::class)
interface ShareStagingSweepModule {
    @Binds
    @IntoSet
    fun shareStagingSweepInitializer(impl: ShareStagingSweepInitializer): AppInitializer
}
