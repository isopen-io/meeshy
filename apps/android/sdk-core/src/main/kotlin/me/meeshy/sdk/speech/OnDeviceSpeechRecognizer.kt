package me.meeshy.sdk.speech

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.AudioFormat
import android.os.Build
import android.os.Bundle
import android.os.ParcelFileDescriptor
import android.os.SystemClock
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import androidx.core.content.ContextCompat
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.flowOn
import me.meeshy.sdk.model.speech.AudioInputFormatReadiness
import me.meeshy.sdk.model.speech.OnDeviceRecognitionEvent
import me.meeshy.sdk.model.speech.OnDeviceTranscription
import me.meeshy.sdk.model.speech.TranscriptionError
import me.meeshy.sdk.model.speech.TranscriptionException

/** D'où vient l'audio à reconnaître. */
public sealed interface SpeechAudioInput {
    /** Le micro, en direct. */
    public data object Microphone : SpeechAudioInput

    /** Un fichier PCM 16 bits déjà enregistré (API 33+). La propriété du descripteur reste à l'appelant. */
    public class PcmFile(
        public val descriptor: ParcelFileDescriptor,
        public val sampleRateHz: Int,
        public val channelCount: Int,
        public val durationMs: Long?,
    ) : SpeechAudioInput
}

public class OnDeviceTranscriptionRequest(
    public val languageTag: String,
    public val input: SpeechAudioInput = SpeechAudioInput.Microphone,
    public val reportPartialResults: Boolean = true,
)

/**
 * Le moteur de reconnaissance vocale sur appareil. Jamais le service réseau : seul
 * `createOnDeviceSpeechRecognizer` (API 31+) est utilisé. Le flux émet des hypothèses
 * partielles puis un résultat final, et échoue avec une `TranscriptionException`. Annuler la
 * collecte libère le reconnaisseur et le micro.
 */
public interface OnDeviceSpeechRecognizer {
    public fun transcribe(request: OnDeviceTranscriptionRequest): Flow<OnDeviceRecognitionEvent>
}

/** Le moteur d'appel (WebRTC) garde la priorité sur le micro : tant qu'il le tient, on ne le prend pas. */
public fun interface MicrophoneClaim {
    public fun isHeldByCall(): Boolean

    public companion object {
        public val Free: MicrophoneClaim = MicrophoneClaim { false }
    }
}

/** Une session de reconnaissance ouverte, pilotée depuis le thread principal. */
internal interface RecognizerSession {
    fun startListening(intent: Intent)
    fun cancel()
    fun destroy()
}

internal interface RecognizerSessionFactory {
    fun isOnDeviceAvailable(): Boolean
    fun create(listener: RecognitionListener): RecognizerSession
}

internal class AndroidRecognizerSessionFactory(private val context: Context) : RecognizerSessionFactory {
    override fun isOnDeviceAvailable(): Boolean =
        when {
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU -> SpeechRecognizer.isOnDeviceRecognitionAvailable(context)
            // API 31-32 : pas de sonde de disponibilité, `createOnDeviceSpeechRecognizer` échoue si absent.
            else -> Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
        }

    override fun create(listener: RecognitionListener): RecognizerSession {
        val recognizer = SpeechRecognizer.createOnDeviceSpeechRecognizer(context)
        recognizer.setRecognitionListener(listener)
        return object : RecognizerSession {
            override fun startListening(intent: Intent) = recognizer.startListening(intent)
            override fun cancel() = recognizer.cancel()
            override fun destroy() = recognizer.destroy()
        }
    }
}

internal class AndroidOnDeviceSpeechRecognizer(
    private val sessions: RecognizerSessionFactory,
    private val main: CoroutineDispatcher,
    private val microphonePermitted: () -> Boolean,
    private val microphoneClaim: MicrophoneClaim = MicrophoneClaim.Free,
    private val sdkInt: Int = Build.VERSION.SDK_INT,
    private val clock: () -> Long = { SystemClock.elapsedRealtime() },
) : OnDeviceSpeechRecognizer {

    override fun transcribe(request: OnDeviceTranscriptionRequest): Flow<OnDeviceRecognitionEvent> = callbackFlow {
        val language = request.languageTag
        preflight(request)?.let { failure ->
            close(TranscriptionException(failure))
            return@callbackFlow
        }
        val startedAt = clock()
        val pcmDuration = (request.input as? SpeechAudioInput.PcmFile)?.durationMs
        val listener = object : RecognitionListener {
            override fun onReadyForSpeech(params: Bundle?) = Unit
            override fun onBeginningOfSpeech() = Unit
            override fun onRmsChanged(rmsdB: Float) = Unit
            override fun onBufferReceived(buffer: ByteArray?) = Unit
            override fun onEndOfSpeech() = Unit
            override fun onEvent(eventType: Int, params: Bundle?) = Unit

            override fun onPartialResults(partialResults: Bundle?) {
                val text = partialResults?.firstHypothesis()?.first ?: return
                if (text.isNotBlank()) trySend(OnDeviceRecognitionEvent.Partial(text))
            }

            override fun onResults(results: Bundle?) {
                val (text, confidence) = results?.firstHypothesis() ?: ("" to 0.0)
                val duration = pcmDuration ?: (clock() - startedAt)
                trySend(
                    OnDeviceRecognitionEvent.Final(
                        OnDeviceTranscription.fromRecognition(text, language, confidence, duration),
                    ),
                )
                close()
            }

            override fun onError(error: Int) {
                val failure = TranscriptionError.fromRecognizerErrorCode(error, language)
                if (failure == null) {
                    trySend(OnDeviceRecognitionEvent.Final(OnDeviceTranscription.fromRecognition("", language, 0.0, null)))
                    close()
                } else {
                    close(TranscriptionException(failure))
                }
            }
        }
        val session = try {
            sessions.create(listener).also { it.startListening(buildRecognizerIntent(request)) }
        } catch (error: Exception) {
            close(TranscriptionException(TranscriptionError.RecognitionFailed(error)))
            return@callbackFlow
        }
        awaitClose {
            runCatching { session.cancel() }
            runCatching { session.destroy() }
        }
    }.flowOn(main)

    private fun preflight(request: OnDeviceTranscriptionRequest): TranscriptionError? {
        val language = request.languageTag
        if (sdkInt < Build.VERSION_CODES.S || !sessions.isOnDeviceAvailable()) {
            return TranscriptionError.OnDeviceNotSupported(language)
        }
        return when (val input = request.input) {
            SpeechAudioInput.Microphone -> when {
                !microphonePermitted() -> TranscriptionError.PermissionDenied
                microphoneClaim.isHeldByCall() ->
                    TranscriptionError.AudioEngineFailed(IllegalStateException("microphone held by an active call"))
                else -> null
            }
            is SpeechAudioInput.PcmFile -> when {
                sdkInt < Build.VERSION_CODES.TIRAMISU -> TranscriptionError.OnDeviceNotSupported(language)
                !AudioInputFormatReadiness.mayStart(input.sampleRateHz.toDouble(), input.channelCount) ->
                    TranscriptionError.TapFormatUnavailable(input.sampleRateHz.toDouble(), input.channelCount)
                else -> null
            }
        }
    }

    private fun Bundle.firstHypothesis(): Pair<String, Double>? {
        val texts = getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
        val text = texts?.firstOrNull() ?: return null
        val confidence = getFloatArray(SpeechRecognizer.CONFIDENCE_SCORES)?.firstOrNull()?.toDouble() ?: 0.0
        return text to confidence.coerceIn(0.0, 1.0)
    }
}

internal fun buildRecognizerIntent(request: OnDeviceTranscriptionRequest): Intent =
    Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
        putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
        putExtra(RecognizerIntent.EXTRA_LANGUAGE, request.languageTag)
        putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true)
        putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, request.reportPartialResults)
        val input = request.input
        if (input is SpeechAudioInput.PcmFile && Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE, input.descriptor)
            putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE_CHANNEL_COUNT, input.channelCount)
            putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE_ENCODING, AudioFormat.ENCODING_PCM_16BIT)
            putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE_SAMPLING_RATE, input.sampleRateHz)
        }
    }

internal fun Context.hasRecordAudioPermission(): Boolean =
    ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
