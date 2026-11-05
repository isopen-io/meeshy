package me.meeshy.sdk.playback

import androidx.media3.common.util.UnstableApi
import dagger.BindsOptionalOf
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent

/**
 * Déclare la couture [AudioPlaybackSources] OPTIONNELLE : `:app` la lie au cache AUDIO du compte,
 * et le moteur retombe sur une lecture directe quand rien n'est lié.
 */
@Module
@InstallIn(SingletonComponent::class)
@OptIn(UnstableApi::class)
public abstract class AudioPlaybackSourcesModule {
    @BindsOptionalOf
    public abstract fun audioPlaybackSources(): AudioPlaybackSources
}
