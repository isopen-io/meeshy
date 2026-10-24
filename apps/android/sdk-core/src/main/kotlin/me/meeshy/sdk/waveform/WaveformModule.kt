package me.meeshy.sdk.waveform

import android.content.Context
import dagger.Binds
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.CoroutineDispatcher
import me.meeshy.core.common.IoDispatcher
import java.io.File
import javax.inject.Singleton

/**
 * Câble la mesure des formes d'onde : l'extracteur derrière [WaveformMeasuring], et le cache dans
 * `cacheDir` (le système le vide au besoin : une mesure perdue se recalcule).
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
    }
}
