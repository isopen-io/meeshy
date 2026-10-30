package me.meeshy.sdk.speech

import android.os.Build
import android.os.ParcelFileDescriptor
import android.system.ErrnoException
import android.system.Os
import android.system.OsConstants
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.channelFlow
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import me.meeshy.sdk.call.CallMicrophoneSamples
import me.meeshy.sdk.call.CallPcmFrame
import me.meeshy.sdk.model.call.OwnSpeechLanguage
import me.meeshy.sdk.model.call.OwnSpeechReadiness
import me.meeshy.sdk.model.call.OwnSpeechSupport
import me.meeshy.sdk.model.speech.OnDeviceRecognitionEvent
import me.meeshy.sdk.model.speech.RecognizerPcm
import me.meeshy.sdk.model.speech.TranscriptionError
import me.meeshy.sdk.model.speech.TranscriptionException
import me.meeshy.sdk.model.speech.UtteranceCut
import me.meeshy.sdk.model.speech.UtteranceEndpointer
import java.io.FileDescriptor
import java.util.Locale
import javax.inject.Inject
import javax.inject.Singleton

/** What the capture of my words says to the call. */
public sealed interface CallSpeechEvent {
    public data class Partial(val text: String) : CallSpeechEvent

    /** The utterance is closed; blank text when it ended without words. */
    public data class Final(val text: String, val confidence: Double) : CallSpeechEvent

    /** This device cannot caption my words: the capture ends here. */
    public data class Unavailable(val support: OwnSpeechSupport) : CallSpeechEvent
}

/** One on-device recognition fed with the PCM of one utterance. */
public interface UtteranceRecognition {
    public val events: Flow<OnDeviceRecognitionEvent>

    /** Never blocks: what the recognizer cannot take right now is dropped. */
    public fun write(pcm: ByteArray)

    /** No more audio: the recognizer closes the utterance and gives its final. */
    public fun endOfAudio()
    public fun close()
}

public fun interface UtteranceRecognitions {
    public fun open(languageTag: String, sampleRate: Int): UtteranceRecognition
}

/**
 * My words, recognized on the device from the samples WebRTC already records (#13718) — iOS
 * `CallTranscriptionService`'s capture, which taps the microphone the call holds. Each utterance
 * ([UtteranceEndpointer]) opens its own recognition fed through a pipe (Android 13+
 * `EXTRA_AUDIO_SOURCE`), the way iOS rotates its request after every final; no recognizer runs
 * while nobody speaks. Never the network recognizer.
 */
@Singleton
public class CallSpeechCapture internal constructor(
    private val frames: Flow<CallPcmFrame>,
    private val recognitions: UtteranceRecognitions,
    private val installedLanguages: suspend () -> Set<String>,
    private val sdkInt: Int,
    private val region: () -> String?,
    private val io: CoroutineDispatcher,
) {
    @Inject
    public constructor(
        samples: CallMicrophoneSamples,
        recognizer: OnDeviceSpeechRecognizer,
        languages: SpeechLanguageAvailability,
    ) : this(
        frames = samples.frames,
        recognitions = PipedUtteranceRecognitions(recognizer),
        installedLanguages = languages::installedLanguages,
        sdkInt = Build.VERSION.SDK_INT,
        region = { Locale.getDefault().country.ifBlank { null } },
        io = Dispatchers.IO,
    )

    /** Whether my [language] can be captioned here, and the recognizer tag to ask for. */
    public suspend fun readiness(language: String): OwnSpeechReadiness {
        if (sdkInt < OwnSpeechLanguage.MIN_SDK_AUDIO_SOURCE) return OwnSpeechReadiness(OwnSpeechSupport.DeviceUnsupported, null)
        val installed = try {
            installedLanguages()
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (failure: Exception) {
            emptySet()
        }
        return OwnSpeechLanguage.readiness(sdkInt, installed, language, region())
    }

    public fun capture(languageTag: String): Flow<CallSpeechEvent> = channelFlow {
        val audio = Channel<CallPcmFrame>(BACKLOG_FRAMES, BufferOverflow.DROP_OLDEST)
        val microphone = launch { frames.collect { audio.trySend(it) } }
        val preRoll = ArrayDeque<ByteArray>()
        var endpointer = UtteranceEndpointer()
        var failures = 0
        while (isActive) {
            var rate = 0
            var opening: ByteArray? = null
            while (opening == null) {
                val frame = audio.receive()
                rate = RecognizerPcm.outputSampleRate(frame.sampleRate)
                val mono = RecognizerPcm.toRecognizer(frame.pcm, frame.sampleRate, frame.channelCount)
                val (next, cut) = endpointer.feed(RecognizerPcm.level(mono), RecognizerPcm.durationMs(mono, rate))
                endpointer = next
                if (cut == UtteranceCut.Opens) opening = mono else preRoll.keepingLast(mono, rate)
            }
            val recognition = recognitions.open(languageTag, rate)
            try {
                preRoll.forEach(recognition::write)
                preRoll.clear()
                recognition.write(opening)
                val heard = withTimeoutOrNull(UtteranceEndpointer.MAX_UTTERANCE_MS + FINAL_GRACE_MS) {
                    coroutineScope {
                        val feeding = launch {
                            while (isActive) {
                                val frame = audio.receive()
                                if (RecognizerPcm.outputSampleRate(frame.sampleRate) != rate) continue
                                val mono = RecognizerPcm.toRecognizer(frame.pcm, frame.sampleRate, frame.channelCount)
                                val (next, cut) = endpointer.feed(RecognizerPcm.level(mono), RecognizerPcm.durationMs(mono, rate))
                                endpointer = next
                                recognition.write(mono)
                                if (cut == UtteranceCut.Closes) {
                                    recognition.endOfAudio()
                                    break
                                }
                            }
                        }
                        recognition.events.collect { event ->
                            when (event) {
                                is OnDeviceRecognitionEvent.Partial -> send(CallSpeechEvent.Partial(event.text))
                                is OnDeviceRecognitionEvent.Final ->
                                    send(CallSpeechEvent.Final(event.transcription.text, event.transcription.confidence))
                            }
                        }
                        feeding.cancelAndJoin()
                    }
                }
                if (heard == null) send(CallSpeechEvent.Final("", 0.0))
                failures = 0
            } catch (failure: TranscriptionException) {
                val unavailable = unavailableFor(failure.error)
                if (unavailable != null || ++failures >= MAX_CONSECUTIVE_FAILURES) {
                    send(CallSpeechEvent.Unavailable(unavailable ?: OwnSpeechSupport.DeviceUnsupported))
                    microphone.cancel()
                    return@channelFlow
                }
                send(CallSpeechEvent.Final("", 0.0))
            } finally {
                recognition.close()
            }
            endpointer = UtteranceEndpointer()
        }
    }.flowOn(io)

    private fun ArrayDeque<ByteArray>.keepingLast(mono: ByteArray, rate: Int) {
        addLast(mono)
        while (sumOf { RecognizerPcm.durationMs(it, rate) } > UtteranceEndpointer.PRE_ROLL_MS) removeFirst()
    }

    private fun unavailableFor(error: TranscriptionError): OwnSpeechSupport? = when (error) {
        is TranscriptionError.OnDeviceNotSupported, TranscriptionError.PermissionDenied -> OwnSpeechSupport.DeviceUnsupported
        is TranscriptionError.RecognizerUnavailable -> OwnSpeechSupport.LanguageMissing
        else -> null
    }

    private companion object {
        const val BACKLOG_FRAMES = 200
        const val FINAL_GRACE_MS = 5_000L
        const val MAX_CONSECUTIVE_FAILURES = 3
    }
}

/**
 * The production recognition: a pipe whose read end goes to the on-device recognizer
 * (`SpeechAudioInput.PcmFile`, API 33+) and whose write end is NON-BLOCKING — a recognizer that
 * stalls loses audio, it never holds the capture.
 */
internal class PipedUtteranceRecognitions(private val recognizer: OnDeviceSpeechRecognizer) : UtteranceRecognitions {
    override fun open(languageTag: String, sampleRate: Int): UtteranceRecognition {
        val (read, write) = ParcelFileDescriptor.createPipe()
        Os.fcntlInt(write.fileDescriptor, OsConstants.F_SETFL, OsConstants.O_NONBLOCK)
        val request = OnDeviceTranscriptionRequest(
            languageTag = languageTag,
            input = SpeechAudioInput.PcmFile(read, sampleRate, channelCount = 1, durationMs = null),
            reportPartialResults = true,
        )
        return PipedRecognition(recognizer.transcribe(request), read, write)
    }
}

private class PipedRecognition(
    override val events: Flow<OnDeviceRecognitionEvent>,
    private val read: ParcelFileDescriptor,
    private val write: ParcelFileDescriptor,
) : UtteranceRecognition {
    @Volatile private var open = true

    override fun write(pcm: ByteArray) {
        if (!open) return
        writeAll(write.fileDescriptor, pcm)
    }

    override fun endOfAudio() {
        if (!open) return
        open = false
        runCatching { write.close() }
    }

    override fun close() {
        open = false
        runCatching { write.close() }
        runCatching { read.close() }
    }

    private fun writeAll(fd: FileDescriptor, pcm: ByteArray) {
        var offset = 0
        try {
            while (offset < pcm.size) offset += Os.write(fd, pcm, offset, pcm.size - offset)
        } catch (full: ErrnoException) {
            if (full.errno != OsConstants.EAGAIN) open = false
        }
    }
}
