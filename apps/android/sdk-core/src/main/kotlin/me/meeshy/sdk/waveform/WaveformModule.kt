package me.meeshy.sdk.waveform

import android.content.Context
import dagger.Binds
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import kotlinx.coroutines.CoroutineDispatcher
import me.meeshy.core.common.IoDispatcher
import me.meeshy.sdk.session.PerAccountCache
import java.io.File
import javax.inject.Singleton

/**
 * Câble la mesure des formes d'onde : l'extracteur derrière [WaveformMeasuring], et le cache dans
 * `cacheDir` (le système le vide au besoin : une mesure perdue se recalcule). Le cache rejoint l'effacement de
 * fin de session par le point d'extension `PerAccountCache`.
 */
@Module
@InstallIn(SingletonComponent::class)
abstract class WaveformModule {

    @Binds
    abstract fun bindMeasuring(extractor: WaveformExtractor): WaveformMeasuring

    companion object {
        private const val DIRECTORY = "com.meeshy.waveforms.v2"

        @Provides
        @Singleton
        fun provideWaveformCache(
            @ApplicationContext context: Context,
            measuring: WaveformMeasuring,
            @IoDispatcher ioDispatcher: CoroutineDispatcher,
        ): WaveformCache = WaveformCache(File(context.cacheDir, DIRECTORY), measuring, ioDispatcher)

        /** Fin de session (ADR-027) : les relevés dérivent du contenu du compte quitté, mémoire et disque. */
        @Provides
        @IntoSet
        fun waveformsOnLogout(cache: WaveformCache): PerAccountCache = WaveformAccountWipe(cache)
    }
}

/** La contribution des formes d'onde à l'effacement de fin de session. */
internal class WaveformAccountWipe(private val cache: WaveformCache) : PerAccountCache {
    override suspend fun clear() = cache.clearAll()
}
