package me.meeshy.sdk.attachment

import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.launch
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
            request = { attachmentId ->
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

    @Test
    fun `nothing is requested at rest`() = runTest {
        val harness = Harness(this)

        harness.tracker.observe("m1", "a1").test {
            assertThat(awaitItem()).isEqualTo(Request.IDLE)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `a request is in flight until the answer comes, then rests`() = runTest {
        val harness = Harness(this)

        harness.tracker.observe("m1", "a1").test {
            assertThat(awaitItem()).isEqualTo(Request.IDLE)
            launch { harness.tracker.request("m1", "a1") }
            runCurrent()
            assertThat(awaitItem()).isEqualTo(Request.IN_FLIGHT)

            harness.answers.single().complete(NetworkResult.Success(null))
            runCurrent()
            cancelAndIgnoreRemainingEvents()
        }
        assertThat(harness.requested).containsExactly("a1")
    }

    @Test
    fun `a transcription that was already done is applied to the cache and the request rests`() = runTest {
        val harness = Harness(this)

        launch { harness.tracker.request("m1", "a1") }
        runCurrent()
        harness.answers.single().complete(NetworkResult.Success(ApiAttachmentTranscription(text = "salut", language = "fr")))
        runCurrent()

        assertThat(harness.applied).containsExactly(Triple("m1", "a1", "salut"))
        harness.tracker.observe("m1", "a1").test {
            assertThat(awaitItem()).isEqualTo(Request.IDLE)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `a refused request fails and can be asked again`() = runTest {
        val harness = Harness(this)

        harness.tracker.observe("m1", "a1").test {
            assertThat(awaitItem()).isEqualTo(Request.IDLE)
            launch { harness.tracker.request("m1", "a1") }
            runCurrent()
            assertThat(awaitItem()).isEqualTo(Request.IN_FLIGHT)
            harness.answers.removeFirst().complete(failure)
            runCurrent()
            assertThat(awaitItem()).isEqualTo(Request.FAILED)

            launch { harness.tracker.request("m1", "a1") }
            runCurrent()
            assertThat(awaitItem()).isEqualTo(Request.IN_FLIGHT)
            cancelAndIgnoreRemainingEvents()
        }
        assertThat(harness.requested).containsExactly("a1", "a1")
    }

    @Test
    fun `a failure received by the socket while waiting shows and offers a retry`() = runTest {
        val harness = Harness(this)

        harness.tracker.observe("m1", "a1").test {
            assertThat(awaitItem()).isEqualTo(Request.IDLE)
            launch { harness.tracker.request("m1", "a1") }
            runCurrent()
            assertThat(awaitItem()).isEqualTo(Request.IN_FLIGHT)

            harness.failures.failed(TranslationFailureEntry("m1", TranslationFailureKind.TRANSCRIPTION, "a1"))
            runCurrent()
            assertThat(awaitItem()).isEqualTo(Request.FAILED)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `after ninety seconds of silence the request rests so it can be made again`() = runTest {
        val harness = Harness(this)

        harness.tracker.observe("m1", "a1").test {
            assertThat(awaitItem()).isEqualTo(Request.IDLE)
            launch { harness.tracker.request("m1", "a1") }
            runCurrent()
            assertThat(awaitItem()).isEqualTo(Request.IN_FLIGHT)
            harness.answers.single().complete(NetworkResult.Success(null))

            advanceTimeBy(89_000L)
            runCurrent()
            expectNoEvents()
            advanceTimeBy(1_000L)
            runCurrent()
            assertThat(awaitItem()).isEqualTo(Request.IDLE)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `asking again while the wait lasts sends nothing`() = runTest {
        val harness = Harness(this)

        launch { harness.tracker.request("m1", "a1") }
        runCurrent()
        harness.answers.single().complete(NetworkResult.Success(null))
        runCurrent()
        launch { harness.tracker.request("m1", "a1") }
        runCurrent()

        assertThat(harness.requested).hasSize(1)
    }

    @Test
    fun `another attachment is not affected`() = runTest {
        val harness = Harness(this)

        launch { harness.tracker.request("m1", "a1") }
        runCurrent()

        harness.tracker.observe("m1", "a2").test {
            assertThat(awaitItem()).isEqualTo(Request.IDLE)
            cancelAndIgnoreRemainingEvents()
        }
    }
}
