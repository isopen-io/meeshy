package me.meeshy.sdk.playback

import android.content.Context
import androidx.media3.common.util.UnstableApi
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import kotlinx.coroutines.CoroutineDispatcher
import me.meeshy.core.common.MainDispatcher
import me.meeshy.sdk.call.CallActivityGate
import me.meeshy.sdk.model.media.PlaybackReportSink
import me.meeshy.sdk.session.PerAccountCache
import java.util.Optional
import javax.inject.Singleton

/**
 * Câble le moteur de lecture audio : UN moteur (donc un seul vocal qui sonne), UN coordinateur, UN
 * magasin de positions. Les contributions de déconnexion passent par le point d'extension
 * [PerAccountCache] — `SessionTeardown` n'est pas édité.
 */
@Module
@InstallIn(SingletonComponent::class)
public object PlaybackModule {

    @Provides
    @Singleton
    public fun playbackPositionStore(@ApplicationContext context: Context): SharedPreferencesPlaybackPositionStore =
        SharedPreferencesPlaybackPositionStore(context)

    @OptIn(UnstableApi::class)
    @Provides
    @Singleton
    public fun audioPlaybackEngine(
        @ApplicationContext context: Context,
        positions: SharedPreferencesPlaybackPositionStore,
        reportSink: PlaybackReportSink,
        callGate: CallActivityGate,
        coordinator: PlaybackCoordinator,
        @MainDispatcher dispatcher: CoroutineDispatcher,
        sources: Optional<@JvmSuppressWildcards AudioPlaybackSources>,
    ): AudioPlaybackEngine = Media3AudioPlaybackEngine(
        portFactory = exoPortFactory(context, sources.orElse(null)),
        positions = positions,
        reportSink = reportSink,
        callActive = { callGate.isActive },
        dispatcher = dispatcher,
        coordinator = coordinator,
    ).also(coordinator::register)

    @Provides
    @Singleton
    public fun conversationAudioCoordinator(
        engine: AudioPlaybackEngine,
        @MainDispatcher dispatcher: CoroutineDispatcher,
    ): ConversationAudioCoordinator = ConversationAudioCoordinator(engine, dispatcher)

    @Provides
    @IntoSet
    public fun positionsOnLogout(positions: SharedPreferencesPlaybackPositionStore): PerAccountCache = positions

    @Provides
    @IntoSet
    public fun coordinatorOnLogout(coordinator: ConversationAudioCoordinator): PerAccountCache = coordinator

    @OptIn(UnstableApi::class)
    private fun exoPortFactory(context: Context, sources: AudioPlaybackSources?): AudioPlayerPortFactory =
        AudioPlayerPortFactory {
            if (sources == null) ExoAudioPlayerPort(context) else ExoAudioPlayerPort(context, sources)
        }
}
