package me.meeshy.sdk.audioedit

import android.content.Context
import android.media.MediaMetadataRetriever
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import java.io.File
import javax.inject.Singleton
import kotlinx.coroutines.CoroutineDispatcher
import me.meeshy.core.common.IoDispatcher
import me.meeshy.core.common.MainDispatcher

/** Branche le moteur d'édition audio (Media3 Transformer) et l'export de segment. */
@Module
@InstallIn(SingletonComponent::class)
public object AudioEditModule {

    @Provides
    @Singleton
    public fun audioEditEngine(
        @ApplicationContext context: Context,
        @IoDispatcher io: CoroutineDispatcher,
        @MainDispatcher main: CoroutineDispatcher,
    ): AudioEditEngine = AudioEditEngine(
        probe = MediaExtractorAudioSourceProbe(),
        runner = Media3AudioTransformRunner(context, main),
        ioDispatcher = io,
    )

    @Provides
    @Singleton
    public fun audioSegmentExporter(
        @ApplicationContext context: Context,
        engine: AudioEditEngine,
    ): AudioSegmentExporter = AudioSegmentExporter(engine, File(context.cacheDir, "audio-segments"))

    @Provides
    @Singleton
    public fun audioDurationReader(): AudioDurationReader = AudioDurationReader { file ->
        val retriever = MediaMetadataRetriever()
        try {
            retriever.setDataSource(file.absolutePath)
            retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull()?.let { it / 1000.0 }
        } catch (failure: Exception) {
            null
        } finally {
            retriever.release()
        }
    }
}
