package me.meeshy.sdk.speech

import android.content.Context
import android.os.ParcelFileDescriptor
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.flow.filterIsInstance
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withContext
import me.meeshy.sdk.model.speech.OnDeviceRecognitionEvent
import me.meeshy.sdk.model.speech.OnDeviceTranscription
import me.meeshy.sdk.model.speech.RecognizerPcm
import me.meeshy.sdk.model.speech.RecordedSpeech
import me.meeshy.sdk.model.speech.TranscriptionError
import me.meeshy.sdk.model.speech.TranscriptionException
import me.meeshy.sdk.model.waveform.PcmEncoding
import me.meeshy.sdk.model.waveform.WaveformLocation
import me.meeshy.sdk.waveform.MediaCodecPcmSource
import me.meeshy.sdk.waveform.PcmChunk
import me.meeshy.sdk.waveform.WavPcmSource
import java.io.ByteArrayOutputStream
import java.io.File
import kotlin.coroutines.coroutineContext

/** Ce que la transcription d'un son enregistré a donné. */
public sealed interface SoundTranscriptionOutcome {
    public data class Heard(val transcription: OnDeviceTranscription) : SoundTranscriptionOutcome

    /** L'appareil ne sait pas transcrire cette langue sur place : la passerelle le fera à la publication (même route qu'iOS). */
    public data object ServerWillTranscribe : SoundTranscriptionOutcome

    public data object Failed : SoundTranscriptionOutcome
}

/** Le son décodé, en PCM 16 bits mono, à la fréquence que le reconnaisseur reçoit. */
public class DecodedSpeech(public val monoPcm: ByteArray, public val sampleRate: Int)

public data class HeardText(val text: String, val confidence: Double)

/**
 * **Transcrire sur l'appareil un son de story déjà enregistré** (#13848) — iOS `EdgeTranscriptionService.transcribe(audioURL:)`.
 * Le reconnaisseur Android ne lit un fichier qu'en PCM (API 33+, jamais le service réseau) et s'arrête à la première
 * pause : le son est décodé une fois, découpé là où l'on se tait ([RecordedSpeech]), et chaque tronçon parlé est reconnu
 * seul. Sans reconnaissance locale pour la langue (API < 33, modèle absent), rien n'échoue : la passerelle transcrit.
 */
public class SoundFileTranscriber internal constructor(
    private val decode: suspend (String) -> DecodedSpeech?,
    private val resolveLanguage: suspend (String) -> SpeechLanguageResolution,
    private val recognize: suspend (pcm: ByteArray, sampleRate: Int, tag: String) -> HeardText,
) {
    public suspend fun transcribe(path: String, language: String): SoundTranscriptionOutcome {
        val tag = when (val resolved = resolveOrServer(language)) {
            is SpeechLanguageResolution.Available -> resolved.tag
            else -> return SoundTranscriptionOutcome.ServerWillTranscribe
        }
        val decoded = decode(path) ?: return SoundTranscriptionOutcome.Failed
        val spans = RecordedSpeech.spans(RecordedSpeech.levels(decoded.monoPcm, decoded.sampleRate))
        val heard = mutableListOf<RecordedSpeech.Heard>()
        for (span in spans) {
            coroutineContext.ensureActive()
            val text = try {
                recognize(RecordedSpeech.slice(decoded.monoPcm, decoded.sampleRate, span), decoded.sampleRate, tag)
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (refused: TranscriptionException) {
                if (refused.error.leavesItToTheServer()) return SoundTranscriptionOutcome.ServerWillTranscribe
                return SoundTranscriptionOutcome.Failed
            }
            heard += RecordedSpeech.Heard(span, text.text, text.confidence)
        }
        return SoundTranscriptionOutcome.Heard(RecordedSpeech.assemble(language, heard))
    }

    private suspend fun resolveOrServer(language: String): SpeechLanguageResolution = try {
        resolveLanguage(language)
    } catch (cancelled: CancellationException) {
        throw cancelled
    } catch (failure: Exception) {
        SpeechLanguageResolution.ServerFallback
    }

    private fun TranscriptionError.leavesItToTheServer(): Boolean =
        this is TranscriptionError.OnDeviceNotSupported || this is TranscriptionError.RecognizerUnavailable

    public companion object {
        /** Au-delà, le son se transcrit sur le serveur : dix minutes de PCM 16 kHz tiennent en ~19 Mo. */
        public const val MAX_SECONDS: Int = 600

        /** La voie de production : `MediaCodec` pour décoder, le reconnaisseur sur appareil sur un fichier PCM par tronçon. */
        public fun onDevice(
            context: Context,
            recognizer: OnDeviceSpeechRecognizer,
            languages: SpeechLanguageAvailability,
            io: CoroutineDispatcher,
        ): SoundFileTranscriber = SoundFileTranscriber(
            decode = { path -> withContext(io) { decodeMono(context, path) } },
            resolveLanguage = languages::resolve,
            recognize = { pcm, rate, tag -> recognizeFile(context, recognizer, pcm, rate, tag, io) },
        )

        private suspend fun recognizeFile(
            context: Context,
            recognizer: OnDeviceSpeechRecognizer,
            pcm: ByteArray,
            rate: Int,
            tag: String,
            io: CoroutineDispatcher,
        ): HeardText {
            val file = withContext(io) { File.createTempFile("sound-span", ".pcm", context.cacheDir).apply { writeBytes(pcm) } }
            val descriptor = ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
            return try {
                val request = OnDeviceTranscriptionRequest(
                    languageTag = tag,
                    input = SpeechAudioInput.PcmFile(descriptor, rate, channelCount = 1, durationMs = RecognizerPcm.durationMs(pcm, rate)),
                    reportPartialResults = false,
                )
                val final = recognizer.transcribe(request).filterIsInstance<OnDeviceRecognitionEvent.Final>().first()
                HeardText(final.transcription.text, final.transcription.confidence)
            } finally {
                runCatching { descriptor.close() }
                file.delete()
            }
        }

        private fun decodeMono(context: Context, path: String): DecodedSpeech? = runCatching {
            val file = File(path)
            if (!file.isFile) return@runCatching null
            val source = WavPcmSource.open(file) ?: MediaCodecPcmSource.open(context, WaveformLocation.Local(path)) {} ?: return@runCatching null
            source.use {
                val out = ByteArrayOutputStream()
                var rate = 0
                while (true) {
                    val chunk = it.nextChunk() ?: break
                    rate = RecognizerPcm.outputSampleRate(chunk.sampleRate)
                    out.write(RecognizerPcm.toRecognizer(chunk.sixteenBit(), chunk.sampleRate, chunk.channelCount))
                    if (rate > 0 && out.size() / 2 / rate > MAX_SECONDS) return@runCatching null
                }
                if (rate == 0) null else DecodedSpeech(out.toByteArray(), rate)
            }
        }.getOrNull()

        /** Le PCM 16 bits du bloc ; un décodeur qui rend des flottants est ramené à l'entier. */
        private fun PcmChunk.sixteenBit(): ByteArray {
            if (encoding == PcmEncoding.PCM_16BIT) return bytes.copyOf(byteCount)
            val samples = byteCount / 4
            val out = ByteArray(samples * 2)
            val buffer = java.nio.ByteBuffer.wrap(bytes, 0, byteCount).order(java.nio.ByteOrder.LITTLE_ENDIAN)
            for (i in 0 until samples) {
                val value = (buffer.getFloat(i * 4).coerceIn(-1f, 1f) * Short.MAX_VALUE).toInt()
                out[2 * i] = (value and 0xFF).toByte()
                out[2 * i + 1] = ((value shr 8) and 0xFF).toByte()
            }
            return out
        }
    }
}
