package me.meeshy.sdk.speech

import android.content.Intent
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.speech.OnDeviceRecognitionEvent
import me.meeshy.sdk.model.speech.TranscriptionError
import me.meeshy.sdk.model.speech.TranscriptionException
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class OnDeviceSpeechRecognizerTest {

    private class FakeSession : RecognizerSession {
        var started: Intent? = null
        var cancelled = 0
        var destroyed = 0
        override fun startListening(intent: Intent) { started = intent }
        override fun cancel() { cancelled++ }
        override fun destroy() { destroyed++ }
    }

    private class FakeFactory(var available: Boolean = true) : RecognizerSessionFactory {
        val session = FakeSession()
        var listener: RecognitionListener? = null
        var created = 0
        override fun isOnDeviceAvailable(): Boolean = available
        override fun create(listener: RecognitionListener): RecognizerSession {
            created++
            this.listener = listener
            return session
        }
    }

    private var now = 0L

    private fun recognizer(
        factory: FakeFactory,
        permitted: Boolean = true,
        callHoldsMic: Boolean = false,
        sdkInt: Int = 34,
    ) = AndroidOnDeviceSpeechRecognizer(
        sessions = factory,
        main = UnconfinedTestDispatcher(),
        microphonePermitted = { permitted },
        microphoneClaim = MicrophoneClaim { callHoldsMic },
        sdkInt = sdkInt,
        clock = { now.also { now += 3_000L } },
    )

    private fun results(text: String, confidence: Float): Bundle = Bundle().apply {
        putStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION, arrayListOf(text))
        putFloatArray(SpeechRecognizer.CONFIDENCE_SCORES, floatArrayOf(confidence))
    }

    private val request = OnDeviceTranscriptionRequest("fr-FR")

    @Test
    fun `les résultats partiels précèdent le résultat final et le flux se termine`() = runTest {
        val factory = FakeFactory()
        recognizer(factory).transcribe(request).test {
            factory.listener!!.onPartialResults(results("bon", 0f))
            assertThat(awaitItem()).isEqualTo(OnDeviceRecognitionEvent.Partial("bon"))
            factory.listener!!.onResults(results("bonjour à tous", 0.9f))
            val final = awaitItem() as OnDeviceRecognitionEvent.Final
            assertThat(final.transcription.text).isEqualTo("bonjour à tous")
            assertThat(final.transcription.language).isEqualTo("fr-FR")
            assertThat(final.transcription.confidence).isWithin(1e-6).of(0.9)
            assertThat(final.transcription.speakingRate).isNotNull()
            awaitComplete()
        }
        assertThat(factory.session.destroyed).isEqualTo(1)
    }

    @Test
    fun `la requête force le modèle sur appareil et la langue demandée`() = runTest {
        val factory = FakeFactory()
        recognizer(factory).transcribe(request).test {
            val intent = factory.session.started!!
            assertThat(intent.getStringExtra(RecognizerIntent.EXTRA_LANGUAGE)).isEqualTo("fr-FR")
            assertThat(intent.getBooleanExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, false)).isTrue()
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `annuler la collecte libère le reconnaisseur`() = runTest {
        val factory = FakeFactory()
        recognizer(factory).transcribe(request).test {
            cancelAndIgnoreRemainingEvents()
        }
        assertThat(factory.session.cancelled).isEqualTo(1)
        assertThat(factory.session.destroyed).isEqualTo(1)
    }

    @Test
    fun `une erreur du reconnaisseur devient une erreur typée et libère la session`() = runTest {
        val factory = FakeFactory()
        recognizer(factory).transcribe(request).test {
            factory.listener!!.onError(13)
            val error = awaitError() as TranscriptionException
            assertThat(error.error).isEqualTo(TranscriptionError.RecognizerUnavailable("fr-FR"))
        }
        assertThat(factory.session.destroyed).isEqualTo(1)
    }

    @Test
    fun `aucune parole entendue rend un résultat vide plutôt qu'une erreur`() = runTest {
        val factory = FakeFactory()
        recognizer(factory).transcribe(request).test {
            factory.listener!!.onError(SpeechRecognizer.ERROR_NO_MATCH)
            val final = awaitItem() as OnDeviceRecognitionEvent.Final
            assertThat(final.transcription.text).isEmpty()
            awaitComplete()
        }
    }

    @Test
    fun `sans permission micro rien n'est démarré`() = runTest {
        val factory = FakeFactory()
        recognizer(factory, permitted = false).transcribe(request).test {
            assertThat((awaitError() as TranscriptionException).error).isEqualTo(TranscriptionError.PermissionDenied)
        }
        assertThat(factory.created).isEqualTo(0)
    }

    @Test
    fun `tant que l'appel tient le micro la reconnaissance ne le prend pas`() = runTest {
        val factory = FakeFactory()
        recognizer(factory, callHoldsMic = true).transcribe(request).test {
            val error = (awaitError() as TranscriptionException).error
            assertThat(error).isInstanceOf(TranscriptionError.AudioEngineFailed::class.java)
        }
        assertThat(factory.created).isEqualTo(0)
    }

    @Test
    fun `sans reconnaissance sur appareil il n'y a jamais de repli sur le service réseau`() = runTest {
        val unavailable = FakeFactory(available = false)
        recognizer(unavailable).transcribe(request).test {
            assertThat((awaitError() as TranscriptionException).error)
                .isEqualTo(TranscriptionError.OnDeviceNotSupported("fr-FR"))
        }
        val api30 = FakeFactory()
        recognizer(api30, sdkInt = 30).transcribe(request).test {
            assertThat((awaitError() as TranscriptionException).error)
                .isEqualTo(TranscriptionError.OnDeviceNotSupported("fr-FR"))
        }
        assertThat(unavailable.created + api30.created).isEqualTo(0)
    }
}
