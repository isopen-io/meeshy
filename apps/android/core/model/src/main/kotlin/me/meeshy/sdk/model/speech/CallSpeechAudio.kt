package me.meeshy.sdk.model.speech

import kotlin.math.sqrt

/**
 * The microphone samples WebRTC records (16-bit little-endian PCM) made fit for the on-device
 * recognizer (#13718): mixed down to mono, and brought to 16 kHz when the capture rate is a whole
 * multiple of it (48 kHz on most devices) — a rate that does not divide is passed as it is, the
 * recognizer being told the rate it gets.
 */
object RecognizerPcm {
    const val TARGET_SAMPLE_RATE: Int = 16_000
    private const val FULL_SCALE: Double = 32_768.0

    fun outputSampleRate(sampleRate: Int): Int =
        if (sampleRate > TARGET_SAMPLE_RATE && sampleRate % TARGET_SAMPLE_RATE == 0) TARGET_SAMPLE_RATE else sampleRate

    fun toRecognizer(pcm: ByteArray, sampleRate: Int, channelCount: Int): ByteArray {
        val channels = channelCount.coerceAtLeast(1)
        val factor = (sampleRate / outputSampleRate(sampleRate)).coerceAtLeast(1)
        val group = channels * factor
        val frames = pcm.size / 2 / group
        val out = ByteArray(frames * 2)
        for (frame in 0 until frames) {
            var sum = 0L
            for (k in 0 until group) sum += sampleAt(pcm, frame * group + k)
            val mean = (sum / group).toInt()
            out[2 * frame] = (mean and 0xFF).toByte()
            out[2 * frame + 1] = ((mean shr 8) and 0xFF).toByte()
        }
        return out
    }

    /** The RMS of a mono frame, 0 (silence) to 1 (full scale). */
    fun level(monoPcm: ByteArray): Double {
        val count = monoPcm.size / 2
        if (count == 0) return 0.0
        var squares = 0.0
        for (i in 0 until count) {
            val s = sampleAt(monoPcm, i) / FULL_SCALE
            squares += s * s
        }
        return sqrt(squares / count)
    }

    fun durationMs(monoPcm: ByteArray, sampleRate: Int): Long =
        if (sampleRate <= 0) 0 else (monoPcm.size / 2) * 1_000L / sampleRate

    private fun sampleAt(pcm: ByteArray, index: Int): Int =
        ((pcm[2 * index + 1].toInt() shl 8) or (pcm[2 * index].toInt() and 0xFF)).toShort().toInt()
}

/** What one frame does to the utterance being cut. */
enum class UtteranceCut {
    /** No one speaks: nothing is sent to the recognizer. */
    Idle,

    /** Speech begins: a recognition opens, the pre-roll then this frame go to it. */
    Opens,
    Continues,

    /** The utterance ends with this frame: the recognizer gets the end of the audio. */
    Closes,
}

/**
 * Cuts my microphone into utterances, one recognition each (iOS rotates its request after every
 * final): a frame louder than [SPEECH_LEVEL] opens one, [END_SILENCE_MS] of silence closes it, and
 * none outlives [MAX_UTTERANCE_MS] — the recognizer's own end-pointing may close it sooner. No
 * recognizer runs while nobody speaks.
 */
data class UtteranceEndpointer(
    val isSpeaking: Boolean = false,
    val spokenMs: Long = 0,
    val silentMs: Long = 0,
) {
    fun feed(level: Double, durationMs: Long): Pair<UtteranceEndpointer, UtteranceCut> {
        val loud = level >= SPEECH_LEVEL
        if (!isSpeaking) {
            return if (loud) UtteranceEndpointer(isSpeaking = true, spokenMs = durationMs) to UtteranceCut.Opens else this to UtteranceCut.Idle
        }
        val spoken = spokenMs + durationMs
        val silent = if (loud) 0 else silentMs + durationMs
        if (silent >= END_SILENCE_MS || spoken >= MAX_UTTERANCE_MS) return UtteranceEndpointer() to UtteranceCut.Closes
        return UtteranceEndpointer(isSpeaking = true, spokenMs = spoken, silentMs = silent) to UtteranceCut.Continues
    }

    companion object {
        /** About −34 dBFS: above the room, below a voice close to the phone. */
        const val SPEECH_LEVEL: Double = 0.02
        const val END_SILENCE_MS: Long = 900
        const val MAX_UTTERANCE_MS: Long = 20_000

        /** The audio kept while idle and handed to a new recognition, so its first syllable is not lost. */
        const val PRE_ROLL_MS: Long = 300
    }
}
