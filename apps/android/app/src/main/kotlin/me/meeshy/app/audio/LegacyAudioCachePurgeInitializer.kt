package me.meeshy.app.audio

import android.content.Context
import androidx.media3.common.util.UnstableApi
import androidx.media3.database.StandaloneDatabaseProvider
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
import me.meeshy.sdk.playback.LegacyAudioPlaybackCache
import timber.log.Timber

/**
 * Le moteur partagé lit désormais par le cache AUDIO du compte : l'ancien dossier `audio-playback` (64 Mo, sans
 * clôture de compte) est purgé au démarrage, hors du fil principal. Absent, il n'y a rien à faire.
 */
@UnstableApi
internal class LegacyAudioCachePurgeInitializer @Inject constructor(
    @ApplicationContext private val context: Context,
) : AppInitializer {
    override fun initialize() {
        CoroutineScope(SupervisorJob() + Dispatchers.IO).launch {
            val database = StandaloneDatabaseProvider(context)
            try {
                LegacyAudioPlaybackCache.purge(context.cacheDir, database)
            } catch (failure: Exception) {
                Timber.w(failure, "ancien cache audio non purgé")
            } finally {
                database.close()
            }
        }
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal interface LegacyAudioCachePurgeModule {
    @Binds
    @IntoSet
    fun legacyAudioCachePurge(initializer: LegacyAudioCachePurgeInitializer): AppInitializer
}
