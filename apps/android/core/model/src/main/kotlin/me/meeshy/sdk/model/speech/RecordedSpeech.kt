package me.meeshy.sdk.model.speech

/**
 * La transcription sur l'appareil d'un son DÉJÀ enregistré (#13848) — l'équivalent d'`EdgeTranscriptionService` (iOS)
 * sur `SpeechRecognizer`, qui ne rend ni horodatage ni texte au-delà d'une pause : le son est découpé là où l'on se tait
 * (la même [UtteranceEndpointer] que l'appel), chaque tronçon est reconnu seul, et les tronçons entendus redeviennent UN
 * texte aux segments horodatés.
 */
object RecordedSpeech {
    const val FRAME_MS: Long = 20

    data class Span(val startMs: Long, val endMs: Long)

    data class Heard(val span: Span, val text: String, val confidence: Double)

    /** Le niveau de chaque trame de [FRAME_MS] d'un PCM 16 bits mono. */
    fun levels(monoPcm: ByteArray, sampleRate: Int): List<Double> {
        val frameBytes = (sampleRate * FRAME_MS / 1000).toInt() * 2
        if (frameBytes <= 0) return emptyList()
        return (0 until monoPcm.size / frameBytes).map { i ->
            RecognizerPcm.level(monoPcm.copyOfRange(i * frameBytes, (i + 1) * frameBytes))
        }
    }

    fun spans(levels: List<Double>, frameMs: Long = FRAME_MS): List<Span> {
        val out = mutableListOf<Span>()
        var endpointer = UtteranceEndpointer()
        var openedAt = 0L
        levels.forEachIndexed { i, level ->
            val (next, cut) = endpointer.feed(level, frameMs)
            endpointer = next
            when (cut) {
                UtteranceCut.Opens -> openedAt = (i * frameMs - UtteranceEndpointer.PRE_ROLL_MS).coerceAtLeast(0)
                UtteranceCut.Closes -> out += Span(openedAt, (i + 1) * frameMs)
                UtteranceCut.Idle, UtteranceCut.Continues -> Unit
            }
        }
        if (endpointer.isSpeaking) out += Span(openedAt, levels.size * frameMs)
        return out
    }

    fun slice(monoPcm: ByteArray, sampleRate: Int, span: Span): ByteArray {
        val from = (span.startMs * sampleRate / 1000).toInt() * 2
        val to = (span.endMs * sampleRate / 1000).toInt() * 2
        return monoPcm.copyOfRange(from.coerceIn(0, monoPcm.size), to.coerceIn(0, monoPcm.size))
    }

    fun assemble(language: String, heard: List<Heard>): OnDeviceTranscription {
        val spoken = heard.mapNotNull { h ->
            h.text.trim().takeIf { it.isNotEmpty() }?.let {
                OnDeviceTranscriptionSegment(it, h.span.startMs, (h.span.endMs - h.span.startMs).coerceAtLeast(0), h.confidence)
            }
        }
        return OnDeviceTranscription(
            text = spoken.joinToString(" ") { it.text },
            language = language,
            confidence = OnDeviceTranscription.averageConfidence(spoken),
            segments = spoken,
            speakingRate = OnDeviceTranscription.speakingRate(spoken),
        )
    }
}
