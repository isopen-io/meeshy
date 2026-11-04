package me.meeshy.sdk.attachment

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.launch
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.ApiAttachmentTranscription
import me.meeshy.sdk.model.MessageTranscriptionFiche.Request
import me.meeshy.sdk.model.TranslationFailureEntry
import me.meeshy.sdk.model.TranslationFailureKind
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.sync.TranslationFailureStore
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class TranscriptionRequestTrackerTest {

    private class Harness(scope: TestScope) {
        val failures = TranslationFailureStore()
        val answers = ArrayDeque<CompletableDeferred<NetworkResult<ApiAttachmentTranscription?>>>()
        val requested = mutableListOf<String>()
        val applied = mutableListOf<Triple<String, String, String>>()
        val tracker = TranscriptionRequestTracker(
            fetch = { attachmentId ->
                requested += attachmentId
                CompletableDeferred<NetworkResult<ApiAttachmentTranscription?>>().also { answers.addLast(it) }.await()
            },
            apply = { messageId, attachmentId, transcription ->
                applied += Triple(messageId, attachmentId, transcription.text.orEmpty())
            },
            failures = failures,
            nowMillis = { scope.testScheduler.currentTime },
        )
    }

    private val failure = NetworkResult.Failure(ApiError("réseau", code = "NETWORK"))

    /** Ce que l'observateur de [attachmentId] a vu, dans l'ordre ; arrêté avec le test. */
    private fun TestScope.watch(harness: Harness, attachmentId: String = "a1"): List<Request> {
        val seen = mutableListOf<Request>()
        backgroundScope.launch(UnconfinedTestDispatcher(testScheduler)) {
            harness.tracker.observe("m1", attachmentId).toList(seen)
        }
        runCurrent()
        return seen
    }

    private fun TestScope.ask(harness: Harness) {
        backgroundScope.launch { harness.tracker.request("m1", "a1") }
        runCurrent()
    }

    @Test
    fun `nothing is requested at rest`() = runTest {
        val seen = watch(Harness(this))

        assertThat(seen).containsExactly(Request.IDLE)
    }

    @Test
    fun `a request is in flight until the answer comes`() = runTest {
        val harness = Harness(this)
        val seen = watch(harness)

        ask(harness)

        assertThat(seen).containsExactly(Request.IDLE, Request.IN_FLIGHT).inOrder()
        assertThat(harness.requested).containsExactly("a1")
    }

    @Test
    fun `a transcription that was already done is applied to the cache and the request rests`() = runTest {
        val harness = Harness(this)
        val seen = watch(harness)
        ask(harness)

        harness.answers.single().complete(NetworkResult.Success(ApiAttachmentTranscription(text = "salut", language = "fr")))
        runCurrent()

        assertThat(harness.applied).containsExactly(Triple("m1", "a1", "salut"))
        assertThat(seen.last()).isEqualTo(Request.IDLE)
    }

    @Test
    fun `a refused request fails and can be asked again`() = runTest {
        val harness = Harness(this)
        val seen = watch(harness)
        ask(harness)

        harness.answers.removeFirst().complete(failure)
        runCurrent()
        assertThat(seen.last()).isEqualTo(Request.FAILED)

        ask(harness)
        assertThat(seen.last()).isEqualTo(Request.IN_FLIGHT)
        assertThat(harness.requested).containsExactly("a1", "a1")
    }

    @Test
    fun `a failure received by the socket while waiting shows and offers a retry`() = runTest {
        val harness = Harness(this)
        val seen = watch(harness)
        ask(harness)

        harness.failures.failed(TranslationFailureEntry("m1", TranslationFailureKind.TRANSCRIPTION, "a1"))
        runCurrent()

        assertThat(seen.last()).isEqualTo(Request.FAILED)
    }

    @Test
    fun `after ninety seconds of silence the request rests so it can be made again`() = runTest {
        val harness = Harness(this)
        val seen = watch(harness)
        ask(harness)
        harness.answers.single().complete(NetworkResult.Success(null))
        runCurrent()

        advanceTimeBy(89_000L)
        runCurrent()
        assertThat(seen.last()).isEqualTo(Request.IN_FLIGHT)
        advanceTimeBy(1_000L)
        runCurrent()

        assertThat(seen.last()).isEqualTo(Request.IDLE)
    }

    @Test
    fun `asking again while the wait lasts sends nothing`() = runTest {
        val harness = Harness(this)
        ask(harness)
        harness.answers.single().complete(NetworkResult.Success(null))
        runCurrent()

        ask(harness)

        assertThat(harness.requested).hasSize(1)
    }

    @Test
    fun `another attachment is not affected`() = runTest {
        val harness = Harness(this)
        val seen = watch(harness, attachmentId = "a2")

        ask(harness)

        assertThat(seen).containsExactly(Request.IDLE)
    }
}
