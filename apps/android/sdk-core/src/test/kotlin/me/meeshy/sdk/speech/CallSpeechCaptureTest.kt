package me.meeshy.sdk.speech

import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.call.CallPcmFrame
import me.meeshy.sdk.model.call.OwnSpeechReadiness
import me.meeshy.sdk.model.call.OwnSpeechSupport
import me.meeshy.sdk.model.speech.OnDeviceRecognitionEvent
import me.meeshy.sdk.model.speech.OnDeviceTranscription
import me.meeshy.sdk.model.speech.TranscriptionError
import me.meeshy.sdk.model.speech.TranscriptionException
import me.meeshy.sdk.model.speech.UtteranceEndpointer
import org.junit.Test

/**
 * #13718 — my microphone, as WebRTC already records it, fed to the on-device recognizer one
 * utterance at a time: no second capture fights the call for the microphone.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class CallSpeechCaptureTest {

    private class FakeRecognition : UtteranceRecognition {
        val results = Channel<OnDeviceRecognitionEvent>(Channel.UNLIMITED)
        val written = mutableListOf<ByteArray>()
        var ended = false
        var closed = false
        override val events: Flow<OnDeviceRecognitionEvent> = results.receiveAsFlow()
        override fun write(pcm: ByteArray) { written += pcm }
        override fun endOfAudio() { ended = true }
        override fun close() { closed = true }
    }

    private class FakeRecognitions : UtteranceRecognitions {
        val opened = mutableListOf<Pair<String, Int>>()
        val sessions = mutableListOf<FakeRecognition>()
        override fun open(languageTag: String, sampleRate: Int): UtteranceRecognition {
            opened += languageTag to sampleRate
            return FakeRecognition().also { sessions += it }
        }
    }

    private val frames = MutableSharedFlow<CallPcmFrame>(extraBufferCapacity = 4_096)
    private val recognitions = FakeRecognitions()

    private fun frame(amplitude: Int, sampleRate: Int = 16_000): CallPcmFrame {
        val samples = sampleRate / 100
        val pcm = ByteArray(samples * 2) { i -> if (i % 2 == 0) (amplitude and 0xFF).toByte() else ((amplitude shr 8) and 0xFF).toByte() }
        return CallPcmFrame(pcm, sampleRate, channelCount = 1)
    }

    private fun emit(amplitude: Int, count: Int, sampleRate: Int = 16_000) = repeat(count) { frames.tryEmit(frame(amplitude, sampleRate)) }

    private val silenceFrames = (UtteranceEndpointer.END_SILENCE_MS / 10).toInt()

    private fun final(text: String, confidence: Double = 0.9) =
        OnDeviceRecognitionEvent.Final(OnDeviceTranscription.fromRecognition(text, "fr-FR", confidence, null))

    private fun capture(sdkInt: Int = 34, installed: Set<String> = setOf("fr-FR"), testScheduler: kotlinx.coroutines.test.TestCoroutineScheduler) =
        CallSpeechCapture(
            frames = frames,
            recognitions = recognitions,
            installedLanguages = { installed },
            sdkInt = sdkInt,
            region = { "FR" },
            io = UnconfinedTestDispatcher(testScheduler),
        )

    @Test
    fun `speech opens one recognition fed with its pre-roll, a silence ends its audio, and its words come out`() = runTest {
        capture(testScheduler = testScheduler).capture("fr-FR").test {
            frames.subscriptionCount.first { it > 0 }
            emit(amplitude = 0, count = 5, sampleRate = 48_000)
            assertThat(recognitions.opened).isEmpty()

            emit(amplitude = 8_000, count = 3, sampleRate = 48_000)
            emit(amplitude = 0, count = silenceFrames, sampleRate = 48_000)

            assertThat(recognitions.opened).containsExactly("fr-FR" to 16_000)
            val session = recognitions.sessions.single()
            assertThat(session.written).hasSize(5 + 3 + silenceFrames)
            assertThat(session.written.first().size).isEqualTo(320)
            assertThat(session.ended).isTrue()

            session.results.send(OnDeviceRecognitionEvent.Partial("bon"))
            assertThat(awaitItem()).isEqualTo(CallSpeechEvent.Partial("bon"))
            session.results.send(final("bonjour à tous"))
            session.results.close()
            assertThat(awaitItem()).isEqualTo(CallSpeechEvent.Final("bonjour à tous", 0.9))
            assertThat(session.closed).isTrue()
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `the next utterance opens the next recognition`() = runTest {
        capture(testScheduler = testScheduler).capture("fr-FR").test {
            frames.subscriptionCount.first { it > 0 }
            emit(amplitude = 8_000, count = 2)
            recognitions.sessions.single().results.apply { send(final("un")); close() }
            assertThat(awaitItem()).isEqualTo(CallSpeechEvent.Final("un", 0.9))

            emit(amplitude = 8_000, count = 2)

            assertThat(recognitions.sessions).hasSize(2)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `a device without an on-device recognizer says so and the capture ends`() = runTest {
        capture(testScheduler = testScheduler).capture("fr-FR").test {
            frames.subscriptionCount.first { it > 0 }
            emit(amplitude = 8_000, count = 1)
            recognitions.sessions.single().results.close(TranscriptionException(TranscriptionError.OnDeviceNotSupported("fr-FR")))

            assertThat(awaitItem()).isEqualTo(CallSpeechEvent.Unavailable(OwnSpeechSupport.DeviceUnsupported))
            awaitComplete()
        }
    }

    @Test
    fun `a passing failure closes the utterance without words and the capture goes on`() = runTest {
        capture(testScheduler = testScheduler).capture("fr-FR").test {
            frames.subscriptionCount.first { it > 0 }
            emit(amplitude = 8_000, count = 1)
            recognitions.sessions.single().results.close(TranscriptionException(TranscriptionError.RecognitionFailed(IllegalStateException("busy"))))

            assertThat(awaitItem()).isEqualTo(CallSpeechEvent.Final("", 0.0))
            emit(amplitude = 0, count = 1)
            emit(amplitude = 8_000, count = 1)
            assertThat(recognitions.sessions).hasSize(2)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `readiness reads the installed models only where an audio source can be given`() = runTest {
        assertThat(capture(sdkInt = 32, testScheduler = testScheduler).readiness("fr"))
            .isEqualTo(OwnSpeechReadiness(OwnSpeechSupport.DeviceUnsupported, null))
        assertThat(capture(sdkInt = 34, testScheduler = testScheduler).readiness("fr"))
            .isEqualTo(OwnSpeechReadiness(OwnSpeechSupport.Available, "fr-FR"))
        assertThat(capture(sdkInt = 34, installed = setOf("en-US"), testScheduler = testScheduler).readiness("fr"))
            .isEqualTo(OwnSpeechReadiness(OwnSpeechSupport.LanguageMissing, null))
    }
}
