package me.meeshy.sdk.playback

import android.content.Context
import androidx.media3.common.util.UnstableApi
import me.meeshy.sdk.model.playback.MediaThermalPolicy
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.SupervisorJob
import me.meeshy.core.common.MainDispatcher
import javax.inject.Singleton

/**
 * Câble le gestionnaire vidéo partagé : UN lecteur (donc une seule vidéo qui joue), enregistré auprès du
 * [PlaybackCoordinator] pour que démarrer une vidéo éteigne l'audio, et inversement.
 */
@Module
@InstallIn(SingletonComponent::class)
public object VideoPlaybackModule {

    @OptIn(UnstableApi::class)
    @Provides
    @Singleton
    public fun sharedVideoPlayerManager(
        @ApplicationContext context: Context,
        coordinator: PlaybackCoordinator,
        thermal: ThermalStatusObserver,
        @MainDispatcher dispatcher: CoroutineDispatcher,
    ): SharedVideoPlayerManager = SharedVideoPlayerManager(
        portFactory = VideoPlayerPortFactory { ExoVideoPlayerPort(context) },
        coordinator = coordinator,
        scope = CoroutineScope(SupervisorJob() + dispatcher),
        tickIntervalMs = { MediaThermalPolicy.tickIntervalMs(thermal.state.value) },
    ).also {
        thermal.start()
        coordinator.register(it)
    }
}
