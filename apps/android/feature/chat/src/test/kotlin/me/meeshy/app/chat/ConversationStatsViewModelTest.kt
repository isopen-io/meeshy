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
import me.meeshy.sdk.conversation.ConversationStatsRepository
import me.meeshy.sdk.model.ActivityPeriod
import me.meeshy.sdk.model.ContentTypeCounts
import me.meeshy.sdk.model.ContentTypeKind
import me.meeshy.sdk.model.ConversationMessageStatsResponse
import me.meeshy.sdk.model.DailyActivityEntry
import me.meeshy.sdk.model.ParticipantStatEntry
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import java.time.LocalDate
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ConversationStatsViewModelTest {

    private val dispatcher = StandardTestDispatcher()
    private val today = LocalDate.of(2026, 8, 21)

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun stats(
        total: Int = 10,
        content: ContentTypeCounts = ContentTypeCounts(text = 8, image = 2),
        participants: List<ParticipantStatEntry> = listOf(ParticipantStatEntry(userId = "u1", messageCount = 10)),
        daily: List<DailyActivityEntry> = listOf(
            DailyActivityEntry("2026-08-20", 5),
            DailyActivityEntry("2026-07-01", 9),
        ),
    ) = ConversationMessageStatsResponse(
        conversationId = "c1",
        totalMessages = total,
        totalWords = 40,
        contentTypes = content,
        participantStats = participants,
        dailyActivity = daily,
    )

    private fun repo(result: NetworkResult<ConversationMessageStatsResponse>): ConversationStatsRepository {
        val repository = mockk<ConversationStatsRepository>()
        coEvery { repository.fetchStats(any()) } returns result
        return repository
    }

    @Test
    fun `load projects a successful response into a loaded state`() = runTest {
        val vm = ConversationStatsViewModel(repo(NetworkResult.Success(stats())))

        vm.load("c1")
        advanceUntilIdle()

        val s = vm.state.value
        assertThat(s.phase).isEqualTo(StatsPhase.Loaded)
        assertThat(s.totalMessages).isEqualTo(10)
        assertThat(s.contentTypes.map { it.kind })
            .containsExactly(ContentTypeKind.TEXT, ContentTypeKind.IMAGE).inOrder()
        assertThat(s.participants).hasSize(1)
    }

    @Test
    fun `load marks an empty conversation as Empty`() = runTest {
        val vm = ConversationStatsViewModel(repo(NetworkResult.Success(stats(total = 0, participants = emptyList()))))

        vm.load("c1")
        advanceUntilIdle()

        assertThat(vm.state.value.phase).isEqualTo(StatsPhase.Empty)
    }

    @Test
    fun `load surfaces a failure as Error`() = runTest {
        val vm = ConversationStatsViewModel(repo(NetworkResult.Failure(ApiError("boom"))))

        vm.load("c1")
        advanceUntilIdle()

        assertThat(vm.state.value.phase).isEqualTo(StatsPhase.Error)
    }

    @Test
    fun `activity reflects the selected period without a refetch`() = runTest {
        val repository = repo(NetworkResult.Success(stats()))
        val vm = ConversationStatsViewModel(repository)

        vm.load("c1")
        advanceUntilIdle()

        // WEEK window drops the July point.
        assertThat(vm.state.value.activity(today).map { it.date }).containsExactly("2026-08-20")

        vm.selectPeriod(ActivityPeriod.ALL)
        assertThat(vm.state.value.activity(today).map { it.date })
            .containsExactly("2026-07-01", "2026-08-20").inOrder()

        // No second network call — the period switch is pure.
        coVerify(exactly = 1) { repository.fetchStats(any()) }
    }

    @Test
    fun `a second load for the same loaded conversation does not refetch`() = runTest {
        val repository = repo(NetworkResult.Success(stats()))
        val vm = ConversationStatsViewModel(repository)

        vm.load("c1")
        advanceUntilIdle()
        vm.load("c1")
        advanceUntilIdle()

        coVerify(exactly = 1) { repository.fetchStats("c1") }
    }

    @Test
    fun `retry refetches after a failure`() = runTest {
        val repository = mockk<ConversationStatsRepository>()
        coEvery { repository.fetchStats("c1") } returnsMany listOf(
            NetworkResult.Failure(ApiError("offline")),
            NetworkResult.Success(stats()),
        )
        val vm = ConversationStatsViewModel(repository)

        vm.load("c1")
        advanceUntilIdle()
        assertThat(vm.state.value.phase).isEqualTo(StatsPhase.Error)

        vm.retry()
        advanceUntilIdle()
        assertThat(vm.state.value.phase).isEqualTo(StatsPhase.Loaded)
        coVerify(exactly = 2) { repository.fetchStats("c1") }
    }

    @Test
    fun `selecting the current period is inert`() = runTest {
        val vm = ConversationStatsViewModel(repo(NetworkResult.Success(stats())))
        vm.load("c1")
        advanceUntilIdle()

        vm.selectPeriod(ActivityPeriod.WEEK)

        assertThat(vm.state.value.period).isEqualTo(ActivityPeriod.WEEK)
    }
}
