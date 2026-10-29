package me.meeshy.app.settings

import androidx.lifecycle.SavedStateHandle
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.model.appearance.AppearancePackDomain
import me.meeshy.sdk.model.packs.PackPurchaseRefusal
import me.meeshy.sdk.model.packs.PackPurchaseResponse
import me.meeshy.sdk.model.packs.PackShopFailure
import me.meeshy.sdk.model.packs.PackShopResponse
import me.meeshy.sdk.model.packs.PackShopSection
import me.meeshy.sdk.model.packs.ShopPack
import me.meeshy.sdk.packs.PackPurchaseOutcome
import me.meeshy.sdk.packs.PackShopRepository
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class PackShopViewModelTest {

    private val dispatcher = StandardTestDispatcher()

    @Before fun setUp() { Dispatchers.setMain(dispatcher) }

    @After fun tearDown() { Dispatchers.resetMain() }

    private val animes = ShopPack(slug = "animes", price = 90, owned = false)
    private val served = PackShopResponse(
        domains = listOf(
            PackShopSection("wallpaper", listOf(animes, ShopPack(slug = "essentiels", owned = true))),
            PackShopSection("banner", emptyList()),
        ),
        balance = 340,
    )

    private fun repository(emit: CacheResult<PackShopResponse>? = CacheResult.Fresh(served, 0)): PackShopRepository {
        val repository = mockk<PackShopRepository>(relaxed = true)
        every { repository.shop(any()) } returns MutableStateFlow(emit ?: CacheResult.Empty)
        return repository
    }

    private fun viewModel(repository: PackShopRepository, args: Map<String, Any?> = emptyMap()) =
        PackShopViewModel(repository, SavedStateHandle(args))

    @Test fun `a cached shop paints at once with the served balance and no failure`() = runTest(dispatcher) {
        val vm = viewModel(repository())
        advanceUntilIdle()

        assertThat(vm.state.value.balance).isEqualTo(340)
        assertThat(vm.state.value.packs!!.map { it.slug }).containsExactly("animes", "essentiels")
        assertThat(vm.state.value.loadFailed).isFalse()
    }

    @Test fun `a cold shop has no rows and no balance, the skeleton`() = runTest(dispatcher) {
        val vm = viewModel(repository(CacheResult.Empty))
        advanceUntilIdle()

        assertThat(vm.state.value.packs).isNull()
        assertThat(vm.state.value.balance).isNull()
    }

    @Test fun `a sync error on a cold cache is a load failure and on a painted cache it is not`() = runTest(dispatcher) {
        val coldRepo = mockk<PackShopRepository>(relaxed = true)
        every { coldRepo.shop(any()) } answers {
            firstArg<(Throwable) -> Unit>().invoke(RuntimeException("offline"))
            MutableStateFlow(CacheResult.Empty)
        }
        val cold = viewModel(coldRepo)
        advanceUntilIdle()
        assertThat(cold.state.value.loadFailed).isTrue()

        val warmRepo = mockk<PackShopRepository>(relaxed = true)
        every { warmRepo.shop(any()) } answers {
            firstArg<(Throwable) -> Unit>().invoke(RuntimeException("offline"))
            MutableStateFlow(CacheResult.Stale(served, 1))
        }
        val warm = viewModel(warmRepo)
        advanceUntilIdle()
        assertThat(warm.state.value.loadFailed).isFalse()
        assertThat(warm.state.value.balance).isEqualTo(340)
    }

    @Test fun `a link opens the asked domain and marks the asked pack, an unknown pack marks nothing`() = runTest(dispatcher) {
        val vm = viewModel(repository(), mapOf("domain" to "wallpaper", "pack" to "animes"))
        advanceUntilIdle()
        assertThat(vm.state.value.selected).isEqualTo(AppearancePackDomain.WALLPAPER)
        assertThat(vm.state.value.focusTarget).isEqualTo("animes")

        val unknown = viewModel(repository(), mapOf("domain" to "banner", "pack" to "animes"))
        advanceUntilIdle()
        assertThat(unknown.state.value.selected).isEqualTo(AppearancePackDomain.BANNER)
        assertThat(unknown.state.value.focusTarget).isNull()
    }

    @Test fun `a purchase in flight changes neither the pack nor the balance, only the server answer does`() = runTest(dispatcher) {
        val answer = CompletableDeferred<PackPurchaseOutcome>()
        val repository = repository()
        coEvery { repository.purchase(AppearancePackDomain.WALLPAPER, "animes", any()) } coAnswers { answer.await() }
        val vm = viewModel(repository)
        advanceUntilIdle()

        vm.buy("animes")
        advanceUntilIdle()

        assertThat(vm.state.value.pendingSlugs).containsExactly("animes")
        assertThat(vm.state.value.balance).isEqualTo(340)
        assertThat(vm.state.value.packs!!.first { it.slug == "animes" }.isOwned).isFalse()

        answer.complete(PackPurchaseOutcome.Done(PackPurchaseResponse(animes.copy(owned = true, installed = true), balance = 250)))
        advanceUntilIdle()

        assertThat(vm.state.value.pendingSlugs).isEmpty()
        assertThat(vm.state.value.balance).isEqualTo(250)
        assertThat(vm.state.value.packs!!.first { it.slug == "animes" }.isOwned).isTrue()
    }

    @Test fun `a second touch while the purchase is in flight sends nothing more`() = runTest(dispatcher) {
        val repository = repository()
        coEvery { repository.purchase(any(), any(), any()) } coAnswers { CompletableDeferred<PackPurchaseOutcome>().await() }
        val vm = viewModel(repository)
        advanceUntilIdle()

        vm.buy("animes")
        vm.buy("animes")
        advanceUntilIdle()

        coVerify(exactly = 1) { repository.purchase(any(), any(), any()) }
    }

    @Test fun `a refused purchase says why, leaves the shop as served and rereads the balance from the server`() = runTest(dispatcher) {
        val repository = repository()
        coEvery { repository.purchase(any(), any(), any()) } returns
            PackPurchaseOutcome.Refused(PackPurchaseRefusal(PackShopFailure.INSUFFICIENT_MEESHES, definitive = true))
        val vm = viewModel(repository)
        advanceUntilIdle()

        vm.buy("animes")
        advanceUntilIdle()

        assertThat(vm.state.value.failure).isEqualTo(PackShopFailure.INSUFFICIENT_MEESHES)
        assertThat(vm.state.value.balance).isEqualTo(340)
        assertThat(vm.state.value.packs!!.first { it.slug == "animes" }.isOwned).isFalse()
        coVerify(exactly = 1) { repository.refresh() }
    }

    @Test fun `a retry after a cut reuses the intention id so the server charges once`() = runTest(dispatcher) {
        val repository = repository()
        val ids = mutableListOf<String>()
        coEvery { repository.purchase(any(), any(), capture(ids)) } returns
            PackPurchaseOutcome.Refused(PackPurchaseRefusal(PackShopFailure.GENERIC, definitive = false))
        val vm = viewModel(repository)
        advanceUntilIdle()

        vm.buy("animes")
        advanceUntilIdle()
        vm.buy("animes")
        advanceUntilIdle()

        assertThat(ids).hasSize(2)
        assertThat(ids[0]).isEqualTo(ids[1])
    }

    @Test fun `a free or owned pack is never bought`() = runTest(dispatcher) {
        val repository = repository()
        val vm = viewModel(repository)
        advanceUntilIdle()

        vm.buy("essentiels")
        vm.buy("unknown")
        advanceUntilIdle()

        coVerify(exactly = 0) { repository.purchase(any(), any(), any()) }
    }

    @Test fun `changing the domain dismisses the previous failure`() = runTest(dispatcher) {
        val repository = repository()
        coEvery { repository.purchase(any(), any(), any()) } returns
            PackPurchaseOutcome.Refused(PackPurchaseRefusal(PackShopFailure.INSUFFICIENT_MEESHES, definitive = true))
        val vm = viewModel(repository)
        advanceUntilIdle()
        vm.buy("animes")
        advanceUntilIdle()

        vm.select(AppearancePackDomain.BANNER)
        advanceUntilIdle()

        assertThat(vm.state.value.failure).isNull()
        assertThat(vm.state.value.packs).isEmpty()
    }
}
