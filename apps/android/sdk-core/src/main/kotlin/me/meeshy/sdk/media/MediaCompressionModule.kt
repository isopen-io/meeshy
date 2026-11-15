package me.meeshy.sdk.media

import android.content.Context
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

/** Lie le transcodeur vidéo : sonde, capacités matérielles et moteur Media3. */
@Module
@InstallIn(SingletonComponent::class)
public object MediaCompressionModule {

    @Provides
    @Singleton
    public fun videoTranscoder(
        @ApplicationContext context: Context,
        @IoDispatcher io: CoroutineDispatcher,
        @MainDispatcher main: CoroutineDispatcher,
    ): VideoTranscoder = VideoTranscoder(
        probe = MediaExtractorVideoProbe(),
        capabilities = MediaCodecVideoCapabilities(),
        runner = Media3VideoTransformRunner(context, main),
        workDirectory = File(context.cacheDir, "media-compression"),
        ioDispatcher = io,
    )
}
