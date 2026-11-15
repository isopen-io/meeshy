package me.meeshy.sdk.recording

import android.content.Context
import dagger.hilt.EntryPoint
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import java.io.File
import javax.inject.Inject
import javax.inject.Singleton
import me.meeshy.sdk.audio.MediaRecorderEngine
import me.meeshy.sdk.model.waveform.AudioRecordingSettings
import me.meeshy.sdk.playback.RecorderCallGuard
import me.meeshy.sdk.playback.RecordingSessionController

/** Fabrique des enregistreurs : un par composeur, tous branchés sur la même session et le même garde d'appel. */
@Singleton
public class AudioRecorderFactory @Inject constructor(
    @ApplicationContext private val context: Context,
    private val recordingSession: RecordingSessionController,
    private val callGuard: RecorderCallGuard,
) {
    public fun create(settings: AudioRecordingSettings = AudioRecordingSettings.standard): AudioRecordingProviding =
        DefaultAudioRecorder(
            settings = settings,
            directory = File(context.cacheDir, "voice"),
            engineFactory = { MediaRecorderEngine(context, it.profile) },
            recordingSession = recordingSession,
            callGuard = callGuard,
        )
}

/** Point d'entrée pour les composables, qui n'ont pas d'injection. */
@EntryPoint
@InstallIn(SingletonComponent::class)
public interface AudioRecorderEntryPoint {
    public fun audioRecorderFactory(): AudioRecorderFactory
}
