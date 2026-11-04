package me.meeshy.app.share

import android.content.Context
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import javax.inject.Inject
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import me.meeshy.app.startup.AppInitializer
import me.meeshy.sdk.media.MediaIntake
import timber.log.Timber

/** Au lancement, les copies d'un partage qu'aucune activité n'a plus ouvert (processus tué) quittent le disque. */
class ShareStagingSweepInitializer @Inject constructor(
    @ApplicationContext private val context: Context,
) : AppInitializer {
    override fun initialize() {
        CoroutineScope(SupervisorJob() + Dispatchers.IO).launch {
            runCatching { ShareStagingSweeper({ MediaIntake.directory(context.cacheDir) }, ShareStagingRegistry::isOpen).sweep() }
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
