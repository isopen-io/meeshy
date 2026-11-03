package me.meeshy.sdk.playback

import android.content.Context
import android.media.AudioManager
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.CoroutineDispatcher
import me.meeshy.core.common.MainDispatcher
import me.meeshy.sdk.call.CallActivityGate
import javax.inject.Singleton

/**
 * Câble la coordination des lecteurs : le registre, le focus audio, la session d'enregistrement et
 * le passage de relais avec les appels. Un seul exemplaire de chacun pour tout le processus.
 */
@Module
@InstallIn(SingletonComponent::class)
public object PlaybackCoordinationModule {

    @Provides
    @Singleton
    public fun playbackCoordinator(): PlaybackCoordinator = PlaybackCoordinator()

    @Provides
    @Singleton
    public fun playbackInterruptionState(): PlaybackInterruptionState = PlaybackInterruptionState()

    @Provides
    @Singleton
    public fun recorderCallGuard(): RecorderCallGuard = RecorderCallGuard()

    @Provides
    @Singleton
    public fun audioFocusSystem(@ApplicationContext context: Context): AudioFocusSystem =
        AndroidAudioFocusSystem(context.getSystemService(Context.AUDIO_SERVICE) as AudioManager)

    @Provides
    @Singleton
    public fun audioFocusCoordinator(
        system: AudioFocusSystem,
        @ApplicationContext context: Context,
        interruption: PlaybackInterruptionState,
        callGate: CallActivityGate,
        @MainDispatcher dispatcher: CoroutineDispatcher,
    ): AudioFocusCoordinator = AudioFocusCoordinator(
        system = system,
        noisy = AndroidNoisyRouteSource(context),
        interruption = interruption,
        isCallActive = { callGate.isActive },
        dispatcher = dispatcher,
    )

    @Provides
    @Singleton
    public fun recordingSessionController(
        system: AudioFocusSystem,
        focus: AudioFocusCoordinator,
        playback: PlaybackCoordinator,
        recorders: RecorderCallGuard,
        callGate: CallActivityGate,
    ): RecordingSessionController = RecordingSessionController(
        system = system,
        focus = focus,
        playback = playback,
        recorders = recorders,
        isCallActive = { callGate.isActive },
    )

    @Provides
    @Singleton
    public fun callHandoff(
        playback: PlaybackCoordinator,
        focus: AudioFocusCoordinator,
        interruption: PlaybackInterruptionState,
        recorders: RecorderCallGuard,
        callGate: CallActivityGate,
    ): CallHandoff = CallHandoff(playback, focus, interruption, recorders, callGate)
}
