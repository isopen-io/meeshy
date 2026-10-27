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
import me.meeshy.sdk.model.game.GamePrivacyResponse
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
        coEvery { pages.setPrivacy(any(), true, null) } returns GameWriteOutcome.Done(GamePrivacyResponse(gameHidden = true, friendsLeagueOptOut = false))
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
}
