package me.meeshy.app.game.banner

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.game.InMemoryGameDevicePrefsStore
import me.meeshy.sdk.game.UserGameRepository
import me.meeshy.sdk.model.game.GameIntegrationParser
import me.meeshy.sdk.model.game.GameBannerBadge
import me.meeshy.sdk.model.game.UserGameProfileResponse
import me.meeshy.sdk.model.game.pages.GameDevicePrefs
import me.meeshy.sdk.session.AccountFence
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class GameBannerBadgeViewModelTest {

    private val dispatcher = StandardTestDispatcher()

    @Before fun setUp() { Dispatchers.setMain(dispatcher) }

    @After fun tearDown() { Dispatchers.resetMain() }

    private fun response(level: Int) = GameIntegrationParser.userGame(
        """{"visible":true,"standing":{"level":$level,"tier":"lueur","prestige":0,"flame":null,"rank":"echo","division":1},"treasury":null}""",
    )

    private fun viewModel(
        repository: UserGameRepository,
        hidden: Boolean = false,
        fence: AccountFence = AccountFence { "me" },
    ) = GameBannerBadgeViewModel(repository, InMemoryGameDevicePrefsStore(GameDevicePrefs(hidden = hidden)), fence)

    @Test
    fun `le disque se peint d'abord puis la lecture servie le remplace`() = runTest(dispatcher.scheduler) {
        val repository = mockk<UserGameRepository>()
        coEvery { repository.cached("u1") } returns response(3)
        coEvery { repository.load("u1") } returns response(4)
        val vm = viewModel(repository)

        vm.ensureLoaded("u1")
        advanceUntilIdle()

        assertThat(vm.observe("u1").first()!!.level).isEqualTo(4)
    }

    @Test
    fun `un refus servi retire le badge qu'on montrait`() = runTest(dispatcher.scheduler) {
        val repository = mockk<UserGameRepository>()
        coEvery { repository.cached("u1") } returns response(3)
        coEvery { repository.load("u1") } returns null
        val vm = viewModel(repository)

        vm.ensureLoaded("u1")
        advanceUntilIdle()

        assertThat(vm.observe("u1").first()).isNull()
    }

    @Test
    fun `le niveau d'un membre ne se peint jamais sous le nom d'un autre`() = runTest(dispatcher.scheduler) {
        val repository = mockk<UserGameRepository>()
        coEvery { repository.cached(any()) } returns null
        coEvery { repository.load("u1") } returns response(9)
        coEvery { repository.load("u2") } returns null
        val vm = viewModel(repository)

        vm.ensureLoaded("u1")
        advanceUntilIdle()

        assertThat(vm.observe("u1").first()).isNotNull()
        assertThat(vm.observe("u2").first()).isNull()
    }

    @Test
    fun `sous Jeu masque rien n'est lu ni peint`() = runTest(dispatcher.scheduler) {
        val repository = mockk<UserGameRepository>(relaxed = true)
        val vm = viewModel(repository, hidden = true)

        vm.ensureLoaded("u1")
        advanceUntilIdle()

        coVerify(exactly = 0) { repository.load(any()) }
        assertThat(vm.observe("u1").first()).isNull()
    }

    @Test
    fun `niveau et rang demandent le meme membre, une seule lecture part`() = runTest(dispatcher.scheduler) {
        val repository = mockk<UserGameRepository>()
        coEvery { repository.cached("u1") } returns null
        coEvery { repository.load("u1") } returns response(2)
        val vm = viewModel(repository)

        vm.ensureLoaded("u1")
        vm.ensureLoaded("u1")
        advanceUntilIdle()

        coVerify(exactly = 1) { repository.load("u1") }
        assertThat(GameBannerBadge.shown(vm.observe("u1").first(), "u1", hidden = false)).isNotNull()
    }

    @Test
    fun `une lecture qui echoue garde ce qui est peint`() = runTest(dispatcher.scheduler) {
        val repository = mockk<UserGameRepository>()
        coEvery { repository.cached("u1") } returns response(3)
        coEvery { repository.load("u1") } throws IllegalStateException("boom")
        val vm = viewModel(repository)

        vm.ensureLoaded("u1")
        advanceUntilIdle()

        assertThat(vm.observe("u1").first()!!.level).isEqualTo(3)
    }

    @Test
    fun `le badge lu pour un compte ne se peint jamais sous le compte suivant`() = runTest(dispatcher.scheduler) {
        var owner: String? = "a"
        val repository = mockk<UserGameRepository>()
        coEvery { repository.cached("u1") } returns null
        coEvery { repository.load("u1") } returns response(7)
        val vm = viewModel(repository, fence = AccountFence { owner })

        vm.ensureLoaded("u1")
        advanceUntilIdle()
        assertThat(vm.observe("u1").first()).isNotNull()

        owner = "b"

        assertThat(vm.observe("u1").first()).isNull()
    }

    @Test
    fun `une lecture partie sous un compte qui arrive apres le changement de compte n'est pas peinte`() = runTest(dispatcher.scheduler) {
        var owner: String? = "a"
        val gate = CompletableDeferred<UserGameProfileResponse?>()
        val repository = mockk<UserGameRepository>()
        coEvery { repository.cached("u1") } returns null
        coEvery { repository.load("u1") } coAnswers { gate.await() }
        val vm = viewModel(repository, fence = AccountFence { owner })

        vm.ensureLoaded("u1")
        advanceUntilIdle()
        owner = "b"
        gate.complete(response(7))
        advanceUntilIdle()

        assertThat(vm.observe("u1").first()).isNull()
    }

    @Test
    fun `le compte suivant relit le membre que le precedent lisait encore`() = runTest(dispatcher.scheduler) {
        var owner: String? = "a"
        val gate = CompletableDeferred<UserGameProfileResponse?>()
        val repository = mockk<UserGameRepository>()
        coEvery { repository.cached("u1") } returns null
        coEvery { repository.load("u1") } coAnswers { gate.await() } andThen response(2)
        val vm = viewModel(repository, fence = AccountFence { owner })

        vm.ensureLoaded("u1")
        advanceUntilIdle()
        owner = "b"
        vm.ensureLoaded("u1")
        advanceUntilIdle()
        gate.complete(response(7))
        advanceUntilIdle()

        assertThat(vm.observe("u1").first()!!.level).isEqualTo(2)
    }
}
