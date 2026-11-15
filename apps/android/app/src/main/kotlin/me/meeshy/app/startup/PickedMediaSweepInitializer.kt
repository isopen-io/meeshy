package me.meeshy.app.startup

import android.content.Context
import android.os.Process
import android.os.SystemClock
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
import me.meeshy.sdk.media.OutgoingMediaBootSweep
import me.meeshy.sdk.media.PickedMedia
import timber.log.Timber

/** Au lancement, les copies du sélecteur laissées par un processus mort quittent le cache (aucune ne survit à son propriétaire). */
class PickedMediaSweepInitializer @Inject constructor(
    @ApplicationContext private val context: Context,
) : AppInitializer {
    override fun initialize() {
        val startedAt = OutgoingMediaBootSweep.processStartedAt(
            wallNowMillis = System.currentTimeMillis(),
            uptimeNowMillis = SystemClock.uptimeMillis(),
            processStartUptimeMillis = Process.getStartUptimeMillis(),
        )
        CoroutineScope(SupervisorJob() + Dispatchers.IO).launch {
            runCatching { PickedMedia.sweepOrphans(context.cacheDir, startedAt) }
                .onFailure { Timber.w(it, "Picked media sweep failed") }
        }
    }
}

@Module
@InstallIn(SingletonComponent::class)
interface PickedMediaSweepModule {
    @Binds
    @IntoSet
    fun pickedMediaSweepInitializer(impl: PickedMediaSweepInitializer): AppInitializer
}
