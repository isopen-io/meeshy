package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.call.CallRecordsRepository
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.call.CallTranscriptPage
import me.meeshy.sdk.model.call.CallTranscriptState
import me.meeshy.sdk.model.call.PersistedTranscriptSegment
import me.meeshy.sdk.model.call.PersistedTranscriptTranslation
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.session.SessionRepository
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class CallDetailTranscriptViewModelTest {

    private val dispatcher = UnconfinedTestDispatcher()
    private val records: CallRecordsRepository = mockk()
    private val session: SessionRepository = mockk {
        every { currentUser } returns MutableStateFlow(MeeshyUser(id = "me", username = "ada", systemLanguage = "fr"))
    }

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun request(callId: String = "call-1") = CallTranscriptRequest(
        callId = callId,
        recordStartedAt = "2026-10-29T10:00:00.000Z",
        youLabel = "Vous",
        participantLabel = "Participant",
    )

    private fun page(vararg segments: PersistedTranscriptSegment) = CallTranscriptPage(
        callId = "call-1",
        conversationId = "conv-1",
        callStartedAt = "2026-10-29T10:00:00.000Z",
        segments = segments.toList(),
    )

    private fun peerSegment() = PersistedTranscriptSegment(
        id = "s1",
        speakerId = "peer",
        speakerDisplayName = "Zoé",
        text = "Hello",
        language = "en",
        capturedAtMs = 1_793_268_004_000L,
        translations = listOf(PersistedTranscriptTranslation(targetLanguage = "fr", translatedText = "Bonjour")),
    )

    @Test
    fun `stays loading, drawing nothing, until the replay answers`() = runTest {
        val pending = CompletableDeferred<NetworkResult<CallTranscriptPage>>()
        coEvery { records.transcript("call-1", any(), any()) } coAnswers { pending.await() }
        val viewModel = CallDetailTranscriptViewModel(records, session)

        viewModel.load(request())

        assertThat(viewModel.state.value.state).isEqualTo(CallTranscriptState.Loading)
        pending.complete(NetworkResult.Success(page()))
        assertThat(viewModel.state.value.state).isEqualTo(CallTranscriptState.Absent)
    }

    @Test
    fun `a served journal is projected in the reader's prism`() = runTest {
        coEvery { records.transcript("call-1", any(), any()) } returns NetworkResult.Success(page(peerSegment()))
        val viewModel = CallDetailTranscriptViewModel(records, session)

        viewModel.load(request())

        val ready = viewModel.state.value.state as CallTranscriptState.Ready
        assertThat(ready.lines.single().text(showOriginal = false)).isEqualTo("Bonjour")
        assertThat(ready.lines.single().speakerName).isEqualTo("Zoé")
    }

    @Test
    fun `a refusal hides the section, a transient failure offers a retry that reloads`() = runTest {
        coEvery { records.transcript("call-1", any(), any()) } returns
            NetworkResult.Failure(ApiError(message = "x", httpStatus = 403))
        val viewModel = CallDetailTranscriptViewModel(records, session)
        viewModel.load(request())
        assertThat(viewModel.state.value.state).isEqualTo(CallTranscriptState.Absent)

        coEvery { records.transcript("call-2", any(), any()) } returnsMany listOf(
            NetworkResult.Failure(ApiError(message = "offline")),
            NetworkResult.Success(page(peerSegment())),
        )
        viewModel.load(request(callId = "call-2"))
        assertThat(viewModel.state.value.state).isEqualTo(CallTranscriptState.Failed)

        viewModel.retry()
        assertThat(viewModel.state.value.state).isInstanceOf(CallTranscriptState.Ready::class.java)
    }

    @Test
    fun `reopening the same call does not refetch`() = runTest {
        coEvery { records.transcript("call-1", any(), any()) } returns NetworkResult.Success(page(peerSegment()))
        val viewModel = CallDetailTranscriptViewModel(records, session)

        viewModel.load(request())
        viewModel.load(request())

        coVerify(exactly = 1) { records.transcript("call-1", any(), any()) }
    }

    @Test
    fun `reopening a call whose replay failed tries again`() = runTest {
        coEvery { records.transcript("call-1", any(), any()) } returnsMany listOf(
            NetworkResult.Failure(ApiError(message = "offline")),
            NetworkResult.Success(page(peerSegment())),
        )
        val viewModel = CallDetailTranscriptViewModel(records, session)

        viewModel.load(request())
        viewModel.load(request())

        assertThat(viewModel.state.value.state).isInstanceOf(CallTranscriptState.Ready::class.java)
    }

    @Test
    fun `another call's lines are never served to the sheet opened next`() = runTest {
        coEvery { records.transcript("call-1", any(), any()) } returns NetworkResult.Success(page(peerSegment()))
        val viewModel = CallDetailTranscriptViewModel(records, session)
        viewModel.load(request())

        assertThat(viewModel.state.value.stateFor("call-2")).isEqualTo(CallTranscriptState.Loading)
        assertThat(viewModel.state.value.stateFor("call-1")).isInstanceOf(CallTranscriptState.Ready::class.java)
    }

    @Test
    fun `a call without id never reaches the network`() = runTest {
        val viewModel = CallDetailTranscriptViewModel(records, session)

        viewModel.load(request(callId = ""))

        assertThat(viewModel.state.value.state).isEqualTo(CallTranscriptState.Absent)
        coVerify(exactly = 0) { records.transcript(any(), any(), any()) }
    }
}
