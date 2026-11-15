package me.meeshy.sdk.audioedit

import java.io.File
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import me.meeshy.core.common.IoDispatcher
import me.meeshy.sdk.speech.SoundFileTranscriber

/** Fabrique le [AudioEditorController] d'une ouverture de l'éditeur avec le moteur, la lecture de durée et l'E/S de l'application. */
@Singleton
public class AudioEditorControllerFactory @Inject constructor(
    private val engine: AudioEditEngine,
    private val durations: AudioDurationReader,
    @IoDispatcher private val ioDispatcher: CoroutineDispatcher,
    private val transcriber: SoundFileTranscriber,
) {
    public fun create(
        source: File,
        sessionsRoot: File,
        scope: CoroutineScope,
        defaultLanguage: String = "fr",
    ): AudioEditorController = AudioEditorController(
        source, sessionsRoot, engine, durations, ioDispatcher, scope, transcriber.asAudioTranscriber(), defaultLanguage,
    )
}
