package me.meeshy.app.game.pages

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.engagement.EngagementProgressRepository
import me.meeshy.sdk.game.GameDevicePrefsStore
import me.meeshy.sdk.game.GamePagesRepository
import me.meeshy.sdk.game.GameWriteOutcome
import me.meeshy.sdk.game.InMemoryGameDevicePrefsStore
import me.meeshy.sdk.model.game.GameBlock
import me.meeshy.sdk.model.game.GameLeagueBlock
import me.meeshy.sdk.model.game.GamePrivacyResponse
import me.meeshy.sdk.model.game.LeagueAccess
import me.meeshy.sdk.model.game.LeagueCloses
import me.meeshy.sdk.model.game.LeagueConsentResponse
import me.meeshy.sdk.model.game.LeagueFriends
import me.meeshy.sdk.model.game.ShowcaseVisibilityResponse
import me.meeshy.sdk.model.game.engagement.ApiEngagementProgress
import me.meeshy.sdk.model.game.GameSettingsResponse
import me.meeshy.sdk.model.game.GameVisibility
import me.meeshy.sdk.model.game.ShowcaseVisibility
import me.meeshy.sdk.model.game.pages.GameDevicePrefs
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class GameSettingsViewModelTest {

    @Before fun setUp() = Dispatchers.setMain(UnconfinedTestDispatcher())

    @After fun tearDown() = Dispatchers.resetMain()

    private val pages = mockk<GamePagesRepository>(relaxed = true)
    private val progress = mockk<EngagementProgressRepository>(relaxed = true)

    private val closed = GameVisibility(ShowcaseVisibility.Me, ShowcaseVisibility.Me, ShowcaseVisibility.Me, ShowcaseVisibility.Me)
    private val open = GameVisibility(ShowcaseVisibility.Everyone, ShowcaseVisibility.Friends, ShowcaseVisibility.Everyone, ShowcaseVisibility.Me)

    private fun leagueAccess(access: LeagueAccess) {
        val league = GameLeagueBlock(
            unlocked = true,
            access = access,
            weekKey = "2026-10-26",
            closes = LeagueCloses("2026-11-01", 1200),
            friends = LeagueFriends(rank = 1, size = 3, weekPoints = 40),
        )
        val game = mockk<GameBlock> { every { this@mockk.league } returns league }
        every { progress.progress(any()) } returns flowOf(CacheResult.Fresh(ApiEngagementProgress.empty.copy(game = game), 0))
    }

    private fun hidingTaken() {
        coEvery { pages.setPrivacy(any(), true, null) } returns GameWriteOutcome.Done(GamePrivacyResponse(gameHidden = true, friendsLeagueOptOut = false))
        coEvery { pages.closeVisibility(any()) } returns GameWriteOutcome.Done(ShowcaseVisibilityResponse(closed))
        coEvery { pages.setLeagueConsent(any(), false) } returns GameWriteOutcome.Done(LeagueConsentResponse(consent = false, pseudonym = null))
    }

    private fun viewModel(
        store: GameDevicePrefsStore = InMemoryGameDevicePrefsStore(),
        served: CacheResult<GameSettingsResponse> = CacheResult.Empty,
    ): GameSettingsViewModel {
        every { pages.settings(any()) } returns flowOf(served)
        return GameSettingsViewModel(pages, store, progress)
    }

    @Test
    fun `les celebrations restent sur l appareil et ne partent jamais au serveur`() = runTest {
        val store = InMemoryGameDevicePrefsStore()
        val vm = viewModel(store)

        vm.setCelebrations(false)

        assertThat(store.current().celebrations).isFalse()
        coVerify(exactly = 0) { pages.setPrivacy(any(), any(), any()) }
    }

    @Test
    fun `masquer ne tient que si le serveur l a pris`() = runTest {
        val store = InMemoryGameDevicePrefsStore()
        coEvery { pages.setPrivacy(any(), true, null) } returns GameWriteOutcome.Refused("NETWORK", offline = true)
        val vm = viewModel(store)

        vm.setHidden(true)

        assertThat(store.current().hidden).isFalse()
        assertThat(vm.state.first { it.hideRefusal != null }.hideRefusal).isEqualTo(SwitchRefusal.Offline)
    }

    @Test
    fun `masquer pris par le serveur masque l appareil et relit la progression`() = runTest {
        val store = InMemoryGameDevicePrefsStore()
        hidingTaken()
        val vm = viewModel(store)

        vm.setHidden(true)

        assertThat(store.current().hidden).isTrue()
        coVerify { progress.refresh() }
    }

    @Test
    fun `reafficher ne se bloque jamais cote appareil meme quand le serveur refuse`() = runTest {
        val store = InMemoryGameDevicePrefsStore(GameDevicePrefs(hidden = true))
        coEvery { pages.setPrivacy(any(), false, null) } returns GameWriteOutcome.Refused("NETWORK", offline = true)
        val vm = viewModel(store)

        vm.setHidden(false)

        assertThat(store.current().hidden).isFalse()
    }

    @Test
    fun `le reessai d un interrupteur rejoue la meme requete`() = runTest {
        val ids = mutableListOf<String>()
        coEvery { pages.setPrivacy(capture(ids), null, true) } returns GameWriteOutcome.Refused("NETWORK", offline = true)
        val vm = viewModel()

        vm.setFriendsLeagueOptOut(true)
        vm.setFriendsLeagueOptOut(true)

        assertThat(ids).hasSize(2)
        assertThat(ids[0]).isEqualTo(ids[1])
    }

    @Test
    fun `l opposition a la ligue des amis se redit depuis la reponse du serveur`() = runTest {
        val store = InMemoryGameDevicePrefsStore()
        coEvery { pages.setPrivacy(any(), null, true) } returns GameWriteOutcome.Done(GamePrivacyResponse(gameHidden = false, friendsLeagueOptOut = true))
        val vm = viewModel(store)

        vm.setFriendsLeagueOptOut(true)

        assertThat(store.current().friendsLeagueOptOut).isTrue()
        assertThat(vm.state.first { it.friendsLeagueOptedOut }.friendsLeagueOptedOut).isTrue()
    }

    @Test
    fun `une lecture fraiche des reglages servis aligne l appareil sur le serveur`() = runTest {
        val store = InMemoryGameDevicePrefsStore()
        val served = GameSettingsResponse(gameHidden = true, friendsLeagueOptOut = true, visibility = closed)

        viewModel(store, CacheResult.Fresh(served, 0))

        assertThat(store.current().hidden).isTrue()
        assertThat(store.current().friendsLeagueOptOut).isTrue()
    }

    @Test
    fun `un cache perime se montre sans toucher aux reglages de l appareil`() = runTest {
        val store = InMemoryGameDevicePrefsStore()
        val served = GameSettingsResponse(gameHidden = true, friendsLeagueOptOut = true, visibility = closed)

        val vm = viewModel(store, CacheResult.Stale(served, 5))

        assertThat(vm.state.first { it.served != null }.served).isEqualTo(served)
        assertThat(store.current().hidden).isFalse()
    }

    @Test
    fun `masquer pris ferme les quatre visibilites et retire l accord a la ligue publique comme iOS`() = runTest {
        hidingTaken()
        leagueAccess(LeagueAccess.Open)
        val vm = viewModel(served = CacheResult.Fresh(GameSettingsResponse(gameHidden = false, friendsLeagueOptOut = false, visibility = open), 0))

        vm.setHidden(true)

        coVerify(exactly = 1) { pages.closeVisibility(any()) }
        coVerify(exactly = 1) { pages.setLeagueConsent(any(), false) }
        coVerify(exactly = 1) { pages.forgetLeagueWeek() }
        assertThat(vm.state.first { it.served?.visibility == closed }.served?.visibility).isEqualTo(closed)
    }

    @Test
    fun `masquer n ecrit rien de plus quand tout est deja ferme et la ligue publique fermee`() = runTest {
        hidingTaken()
        leagueAccess(LeagueAccess.ConsentRequired)
        val vm = viewModel(served = CacheResult.Fresh(GameSettingsResponse(gameHidden = false, friendsLeagueOptOut = false, visibility = closed), 0))

        vm.setHidden(true)

        coVerify(exactly = 0) { pages.closeVisibility(any()) }
        coVerify(exactly = 0) { pages.setLeagueConsent(any(), any()) }
    }

    @Test
    fun `sans savoir les visibilites ni l acces a la ligue masquer ferme les deux`() = runTest {
        hidingTaken()
        every { progress.progress(any()) } returns flowOf(CacheResult.Empty)
        val vm = viewModel()

        vm.setHidden(true)

        coVerify(exactly = 1) { pages.closeVisibility(any()) }
        coVerify(exactly = 1) { pages.setLeagueConsent(any(), false) }
    }

    @Test
    fun `un masquage refuse ne ferme rien`() = runTest {
        coEvery { pages.setPrivacy(any(), true, null) } returns GameWriteOutcome.Refused("NETWORK", offline = true)
        leagueAccess(LeagueAccess.Open)
        val vm = viewModel()

        vm.setHidden(true)

        coVerify(exactly = 0) { pages.closeVisibility(any()) }
        coVerify(exactly = 0) { pages.setLeagueConsent(any(), any()) }
    }

    @Test
    fun `reafficher ne rouvre ni les visibilites ni la ligue`() = runTest {
        coEvery { pages.setPrivacy(any(), false, null) } returns GameWriteOutcome.Done(GamePrivacyResponse(gameHidden = false, friendsLeagueOptOut = false))
        val vm = viewModel(InMemoryGameDevicePrefsStore(GameDevicePrefs(hidden = true)))

        vm.setHidden(false)

        coVerify(exactly = 0) { pages.closeVisibility(any()) }
        coVerify(exactly = 0) { pages.setLeagueConsent(any(), any()) }
    }

    @Test
    fun `un refus de fermeture se dit sans defaire le masquage`() = runTest {
        val store = InMemoryGameDevicePrefsStore()
        hidingTaken()
        coEvery { pages.closeVisibility(any()) } returns GameWriteOutcome.Refused("GAME_RATE_LIMITED", offline = false)
        leagueAccess(LeagueAccess.Locked)
        val vm = viewModel(store)

        vm.setHidden(true)

        assertThat(store.current().hidden).isTrue()
        assertThat(vm.state.first { it.hideRefusal != null }.hideRefusal).isEqualTo(SwitchRefusal.Code("GAME_RATE_LIMITED"))
    }
}
