package me.meeshy.app.game.pages

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import java.io.IOException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.engagement.EngagementProgressRepository
import me.meeshy.sdk.friend.FriendListRepository
import me.meeshy.sdk.game.GamePagesRepository
import me.meeshy.sdk.game.GameWriteOutcome
import me.meeshy.sdk.model.FriendRequestUser
import me.meeshy.sdk.model.game.LeagueCloses
import me.meeshy.sdk.model.game.LeagueConsentResponse
import me.meeshy.sdk.model.game.LeagueFriendsResponse
import me.meeshy.sdk.model.game.LeagueKey
import me.meeshy.sdk.model.game.LeagueWeekEntry
import me.meeshy.sdk.model.game.LeagueWeekResponse
import me.meeshy.sdk.model.game.LeagueZone
import me.meeshy.sdk.model.game.progression.ProgressionFailure
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class LeagueViewModelTest {

    @Before fun setUp() = Dispatchers.setMain(UnconfinedTestDispatcher())

    @After fun tearDown() = Dispatchers.resetMain()

    private val weekErrors = mutableListOf<(Throwable) -> Unit>()
    private val pages = mockk<GamePagesRepository>(relaxed = true)
    private val progress = mockk<EngagementProgressRepository>(relaxed = true)
    private val friendList = mockk<FriendListRepository>()

    private fun week(vararg entries: LeagueWeekEntry) = LeagueWeekResponse(
        weekKey = "2026-10-26", snapshotDay = "2026-10-27", closes = LeagueCloses("2026-11-01", 1200),
        placed = true, league = LeagueKey.Jade, groupId = "g", entries = entries.toList(),
    )

    private fun entry(rank: Int, isMe: Boolean = false) = LeagueWeekEntry(
        rank = rank, displayName = "Heros $rank", weekPoints = 100 - rank, zone = LeagueZone.Safe, cup = null, isMe = isMe,
    )

    private fun viewModel(
        source: Flow<CacheResult<LeagueWeekResponse>> = flowOf(CacheResult.Empty),
        friends: List<FriendRequestUser>? = emptyList(),
    ): LeagueViewModel {
        every { pages.leagueWeek(any()) } answers {
            weekErrors += firstArg<(Throwable) -> Unit>()
            source
        }
        every { pages.friendsLeague(any()) } returns flowOf(CacheResult.Empty)
        coEvery { friendList.cachedSnapshot() } returns friends
        return LeagueViewModel(pages, progress, friendList)
    }

    @Test
    fun `rien n est lu tant que l ecran ne demande pas le classement`() = runTest {
        val vm = viewModel(flowOf(CacheResult.Fresh(week(entry(1)), 0)))

        val state = vm.state.first()

        assertThat(state.week.value).isNull()
        assertThat(state.week.showsSkeleton).isFalse()
    }

    @Test
    fun `a froid le squelette paraît puis le classement servi remplace`() = runTest {
        val source = MutableSharedFlow<CacheResult<LeagueWeekResponse>>(replay = 1)
        val vm = viewModel(source)
        vm.wantWeek(true)
        source.emit(CacheResult.Empty)

        assertThat(vm.state.first { it.week.showsSkeleton }.week.value).isNull()

        source.emit(CacheResult.Fresh(week(entry(1, isMe = true)), 0))
        val served = vm.state.first { it.week.value != null }.week

        assertThat(served.showsSkeleton).isFalse()
        assertThat(served.value!!.entries.single().isMe).isTrue()
    }

    @Test
    fun `un classement perime se peint sans squelette et la coupure le garde en le disant`() = runTest {
        val source = MutableSharedFlow<CacheResult<LeagueWeekResponse>>(replay = 1)
        val vm = viewModel(source)
        vm.wantWeek(true)
        source.emit(CacheResult.Stale(week(entry(1), entry(2)), ageMillis = 7))
        vm.state.first { it.week.value != null }

        weekErrors.last().invoke(IOException("hors ligne"))

        val board = vm.state.first { it.week.failure == ProgressionFailure.Offline }.week
        assertThat(board.value!!.entries).hasSize(2)
        assertThat(board.showsSkeleton).isFalse()
        assertThat(board.failedWithoutValue).isFalse()
    }

    @Test
    fun `retirer l accord oublie le classement du disque et relit la progression`() = runTest {
        coEvery { pages.setLeagueConsent(any(), false) } returns GameWriteOutcome.Done(LeagueConsentResponse(false, null))
        val vm = viewModel()

        vm.setConsent(false)

        coVerify { pages.forgetLeagueWeek() }
        coVerify { progress.refresh() }
        assertThat(vm.state.first().consentRefusal).isNull()
    }

    @Test
    fun `une coupure pendant le consentement le dit et le reessai rejoue la meme requete`() = runTest {
        val requestIds = mutableListOf<String>()
        coEvery { pages.setLeagueConsent(capture(requestIds), true) } returns GameWriteOutcome.Refused("NETWORK", offline = true)
        val vm = viewModel()

        vm.setConsent(true)
        assertThat(vm.state.first { it.consentRefusal != null }.consentRefusal).isEqualTo(ConsentRefusal.Offline)
        vm.setConsent(true)

        assertThat(requestIds).hasSize(2)
        assertThat(requestIds[0]).isEqualTo(requestIds[1])
        coVerify(exactly = 0) { pages.forgetLeagueWeek() }
    }

    @Test
    fun `un refus de la passerelle garde son code pour la phrase`() = runTest {
        coEvery { pages.setLeagueConsent(any(), true) } returns GameWriteOutcome.Refused("LEAGUE_MINOR", offline = false)
        val vm = viewModel()

        vm.setConsent(true)

        assertThat(vm.state.first { it.consentRefusal != null }.consentRefusal).isEqualTo(ConsentRefusal.Code("LEAGUE_MINOR"))
    }

    @Test
    fun `les amis acceptes nomment la ligue entre amis`() = runTest {
        val vm = viewModel(friends = listOf(FriendRequestUser(id = "u1", username = "aube"), FriendRequestUser(id = "u2", username = "brume")))

        val state = vm.state.first { it.directory.isNotEmpty() }

        assertThat(state.directory.keys).containsExactly("u1", "u2")
    }

    @Test
    fun `la ligue des amis ne se lit que sur demande`() = runTest {
        val friends = LeagueFriendsResponse("2026-10-26", LeagueCloses("2026-11-01", 1200), emptyList())
        every { pages.friendsLeague(any()) } returns flowOf(CacheResult.Fresh(friends, 0))
        coEvery { friendList.cachedSnapshot() } returns null
        val vm = LeagueViewModel(pages, progress, friendList)

        assertThat(vm.state.first().friends.value).isNull()
        vm.wantFriends(true)

        assertThat(vm.state.first { it.friends.value != null }.friends.value!!.weekKey).isEqualTo("2026-10-26")
    }
}
