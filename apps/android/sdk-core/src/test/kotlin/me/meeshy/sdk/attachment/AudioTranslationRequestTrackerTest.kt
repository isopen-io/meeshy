package me.meeshy.sdk.attachment

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.AttachmentConsentError
import me.meeshy.sdk.model.AttachmentTranslateResponse
import me.meeshy.sdk.model.AttachmentTranslationResult
import me.meeshy.sdk.model.TranslationFailureEntry
import me.meeshy.sdk.model.TranslationFailureKind
import me.meeshy.sdk.model.translation.AudioTranslationRequestState
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.sync.TranslationFailureStore
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class AudioTranslationRequestTrackerTest {

    private class Harness(scope: TestScope) {
        val failures = TranslationFailureStore()
        val answers = ArrayDeque<CompletableDeferred<AttachmentTranslateOutcome>>()
        val asked = mutableListOf<Triple<String, String, String?>>()
        val applied = mutableListOf<Triple<String, String, AttachmentTranslationResult>>()
        val hasTrack = MutableStateFlow(false)
        val tracker = AudioTranslationRequestTracker(
            translate = { attachmentId, language, source ->
                asked += Triple(attachmentId, language, source)
                CompletableDeferred<AttachmentTranslateOutcome>().also { answers.addLast(it) }.await()
            },
            apply = { messageId, attachmentId, result -> applied += Triple(messageId, attachmentId, result) },
            failures = failures,
            nowMillis = { scope.testScheduler.currentTime },
        )
    }

    private val spanish = AttachmentTranslationResult(id = "t1", targetLanguage = "es", translatedText = "Hola", audioUrl = "https://cdn/es.mp3", durationMs = 4000)

    private fun TestScope.watch(h: Harness, language: String = "es"): List<AudioTranslationRequestState> {
        val seen = mutableListOf<AudioTranslationRequestState>()
        backgroundScope.launch(UnconfinedTestDispatcher(testScheduler)) {
            h.tracker.observe("m1", "a1", language, h.hasTrack).toList(seen)
        }
        runCurrent()
        return seen
    }

    private fun TestScope.ask(h: Harness, language: String = "es") {
        backgroundScope.launch { h.tracker.request("m1", "a1", language, "en") }
        runCurrent()
    }

    @Test
    fun `nothing is requested at rest`() = runTest {
        assertThat(watch(Harness(this))).containsExactly(AudioTranslationRequestState.Idle)
    }

    @Test
    fun `a request goes by attachment id and language and is in flight until the answer`() = runTest {
        val h = Harness(this)
        val seen = watch(h)

        ask(h)

        assertThat(h.asked).containsExactly(Triple("a1", "es", "en"))
        assertThat(seen.last()).isEqualTo(AudioTranslationRequestState.InFlight(sinceMs = 0L))
    }

    @Test
    fun `a ready translation is written to the cache and the request rests`() = runTest {
        val h = Harness(this)
        ask(h)

        h.answers.single().complete(AttachmentTranslateOutcome.Success(AttachmentTranslateResponse(translations = listOf(spanish))))
        runCurrent()

        assertThat(h.applied).containsExactly(Triple("m1", "a1", spanish))
        assertThat(h.tracker.requests.value).isEmpty()
    }

    @Test
    fun `an asynchronous job keeps the request in flight until the socket brings the track`() = runTest {
        val h = Harness(this)
        val seen = watch(h)
        ask(h)

        h.answers.single().complete(AttachmentTranslateOutcome.Success(AttachmentTranslateResponse(status = "processing", jobId = "j1")))
        runCurrent()
        h.hasTrack.value = true
        runCurrent()

        assertThat(h.applied).isEmpty()
        assertThat(seen.map { it::class }).containsAtLeast(AudioTranslationRequestState.InFlight::class, AudioTranslationRequestState.Ready::class)
        assertThat(seen.last()).isEqualTo(AudioTranslationRequestState.Ready)
    }

    @Test
    fun `a missing consent shows the consent notice, not a generic failure`() = runTest {
        val h = Harness(this)
        val seen = watch(h)
        ask(h)

        val consent = AttachmentConsentError("CONSENT_REQUIRED", "Voice consent needed", listOf("voiceCloning"))
        h.answers.single().complete(AttachmentTranslateOutcome.ConsentRequired(consent))
        runCurrent()

        assertThat(seen.last()).isEqualTo(AudioTranslationRequestState.ConsentRequired("Voice consent needed", listOf("voiceCloning")))
        assertThat(h.failures.ledger.value.forMessage("m1")).isEmpty()
    }

    @Test
    fun `a refused request is a failure of THIS language and a retry clears it`() = runTest {
        val h = Harness(this)
        val seen = watch(h)
        ask(h)

        h.answers.removeFirst().complete(AttachmentTranslateOutcome.Failed(ApiError("réseau", code = "NETWORK")))
        runCurrent()
        assertThat(seen.last()).isEqualTo(AudioTranslationRequestState.Failed)

        ask(h)
        assertThat(h.asked).hasSize(2)
        assertThat(seen.last()).isInstanceOf(AudioTranslationRequestState.InFlight::class.java)
    }

    @Test
    fun `a socket failure only fails a language that is waiting`() = runTest {
        val h = Harness(this)
        val waiting = watch(h, "es")
        val resting = watch(h, "de")
        ask(h, "es")

        h.failures.failed(TranslationFailureEntry("m1", TranslationFailureKind.AUDIO_TRANSLATION, attachmentId = "a1", error = "tts"))
        runCurrent()

        assertThat(waiting.last()).isEqualTo(AudioTranslationRequestState.Failed)
        assertThat(resting.last()).isEqualTo(AudioTranslationRequestState.Idle)
    }

    @Test
    fun `a second tap while the first is waiting asks nothing more`() = runTest {
        val h = Harness(this)
        ask(h)
        ask(h)

        assertThat(h.asked).hasSize(1)
    }

    @Test
    fun `the end of the session forgets every pending request`() = runTest {
        val h = Harness(this)
        ask(h)

        h.tracker.clear()

        assertThat(h.tracker.requests.value).isEmpty()
    }
}
