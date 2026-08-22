package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.conversation.ConversationAnalysisRepository
import me.meeshy.sdk.model.ConflictTier
import me.meeshy.sdk.model.ConversationAnalysis
import me.meeshy.sdk.model.ConversationSummaryAnalysis
import me.meeshy.sdk.model.HealthTier
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ConversationAnalysisViewModelTest {

    private val dispatcher = StandardTestDispatcher()

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun analysis(summary: ConversationSummaryAnalysis?) =
        ConversationAnalysis(conversationId = "c1", summary = summary)

    private fun repo(result: NetworkResult<ConversationAnalysis>): ConversationAnalysisRepository {
        val repository = mockk<ConversationAnalysisRepository>()
        coEvery { repository.fetchAnalysis(any()) } returns result
        return repository
    }

    @Test
    fun `load projects a populated analysis into a loaded state`() = runTest {
        val vm = ConversationAnalysisViewModel(
            repo(
                NetworkResult.Success(
                    analysis(
                        ConversationSummaryAnalysis(
                            text = "Lively debate",
                            healthScore = 85,
                            conflictLevel = "high",
                            currentTopics = listOf("Sport"),
                        ),
                    ),
                ),
            ),
        )

        vm.load("c1")
        advanceUntilIdle()

        val s = vm.state.value
        assertThat(s.phase).isEqualTo(AnalysisPhase.Loaded)
        assertThat(s.summary?.healthTier).isEqualTo(HealthTier.GOOD)
        assertThat(s.summary?.conflictTier).isEqualTo(ConflictTier.HIGH)
        assertThat(s.summary?.topics).containsExactly("Sport")
    }

    @Test
    fun `load marks an analysis with no summary as Empty`() = runTest {
        val vm = ConversationAnalysisViewModel(repo(NetworkResult.Success(analysis(null))))

        vm.load("c1")
        advanceUntilIdle()

        assertThat(vm.state.value.phase).isEqualTo(AnalysisPhase.Empty)
        assertThat(vm.state.value.summary).isNull()
    }

    @Test
    fun `load marks a blank summary as Empty`() = runTest {
        val vm = ConversationAnalysisViewModel(
            repo(NetworkResult.Success(analysis(ConversationSummaryAnalysis(text = "   ")))),
        )

        vm.load("c1")
        advanceUntilIdle()

        assertThat(vm.state.value.phase).isEqualTo(AnalysisPhase.Empty)
    }

    @Test
    fun `load surfaces a failure as Error`() = runTest {
        val vm = ConversationAnalysisViewModel(repo(NetworkResult.Failure(ApiError("boom"))))

        vm.load("c1")
        advanceUntilIdle()

        assertThat(vm.state.value.phase).isEqualTo(AnalysisPhase.Error)
        assertThat(vm.state.value.hasError).isTrue()
    }

    @Test
    fun `a second load for the same loaded conversation does not refetch`() = runTest {
        val repository = repo(
            NetworkResult.Success(analysis(ConversationSummaryAnalysis(text = "x", healthScore = 50))),
        )
        val vm = ConversationAnalysisViewModel(repository)

        vm.load("c1")
        advanceUntilIdle()
        vm.load("c1")
        advanceUntilIdle()

        coVerify(exactly = 1) { repository.fetchAnalysis("c1") }
    }

    @Test
    fun `retry refetches after a failure`() = runTest {
        val repository = mockk<ConversationAnalysisRepository>()
        coEvery { repository.fetchAnalysis("c1") } returnsMany listOf(
            NetworkResult.Failure(ApiError("offline")),
            NetworkResult.Success(analysis(ConversationSummaryAnalysis(text = "recovered"))),
        )
        val vm = ConversationAnalysisViewModel(repository)

        vm.load("c1")
        advanceUntilIdle()
        assertThat(vm.state.value.phase).isEqualTo(AnalysisPhase.Error)

        vm.retry()
        advanceUntilIdle()
        assertThat(vm.state.value.phase).isEqualTo(AnalysisPhase.Loaded)
        coVerify(exactly = 2) { repository.fetchAnalysis("c1") }
    }
}
