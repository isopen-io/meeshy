package me.meeshy.sdk.audioedit

import java.io.File
import me.meeshy.sdk.speech.SoundFileTranscriber
import me.meeshy.sdk.speech.SoundTranscriptionOutcome

/** Ce que l'éditeur demande à la reconnaissance vocale : transcrire un fichier dans une langue. Absent = pas d'outil. */
public fun interface AudioTranscriber {
    public suspend fun transcribe(file: File, language: String): SoundTranscriptionOutcome
}

/** La voie de production : la reconnaissance sur appareil de `SoundFileTranscriber`. */
public fun SoundFileTranscriber.asAudioTranscriber(): AudioTranscriber =
    AudioTranscriber { file, language -> transcribe(file.absolutePath, language) }
