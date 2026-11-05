package me.meeshy.app.settings

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.ProfileDecorSide
import me.meeshy.sdk.model.ServedProfileDecor
import me.meeshy.sdk.model.ServedProfileDecorItem
import me.meeshy.sdk.model.appearance.AppearancePackDomain
import me.meeshy.sdk.model.packs.ShopPack
import me.meeshy.sdk.profile.ProfileDecorError
import me.meeshy.sdk.profile.ProfileDecorOutcome
import me.meeshy.sdk.profile.ProfileDecorRepository
import me.meeshy.sdk.session.SessionRepository
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class PackShopBrowseViewModelTest {

    private val dispatcher = StandardTestDispatcher()

    @Before fun setUp() { Dispatchers.setMain(dispatcher) }

    @After fun tearDown() { Dispatchers.resetMain() }

    private val ring = ShopItem(AppearancePackDomain.AVATAR_RING, "contours", "or", "Or", art = null)
    private val user = MutableStateFlow<MeeshyUser?>(MeeshyUser(id = "me", username = "ana", displayName = "Ana"))

    private fun session(): SessionRepository = mockk<SessionRepository>(relaxed = true).also {
        every { it.currentUser } returns user
    }

    private fun resolver(calls: MutableList<String> = mutableListOf()) = ShopItemResolver { domain, slug, _ ->
        calls += slug
        if (slug == "absent") ShopPackContents.DownloadRequired
        else ShopPackContents.Ready(listOf(ring.copy(domain = domain, pack = slug), ring.copy(domain = domain, pack = slug, key = "argent")), embedded = true, bytes = 0)
    }

    private fun viewModel(
        resolver: ShopItemResolver = resolver(),
        decor: ProfileDecorRepository = mockk(relaxed = true),
    ) = PackShopBrowseViewModel(resolver, decor, session())

    @Test fun `the shop row opens the detail, its cover opens the first item, back unwinds to the shop`() = runTest(dispatcher) {
        val vm = viewModel()
        vm.openDetail(AppearancePackDomain.AVATAR_RING, "contours")
        vm.openViewer(AppearancePackDomain.AVATAR_RING, "contours", 1)
        advanceUntilIdle()
        assertThat(vm.state.value.stack.top).isEqualTo(ShopBrowseRoute.Viewer(AppearancePackDomain.AVATAR_RING, "contours", 1))

        assertThat(vm.back()).isTrue()
        assertThat(vm.back()).isTrue()
        assertThat(vm.back()).isFalse()
        advanceUntilIdle()
        assertThat(vm.state.value.stack.isOpen).isFalse()
    }

    @Test fun `contents are read once per pack, an absent pack is a drawn download state`() = runTest(dispatcher) {
        val calls = mutableListOf<String>()
        val vm = viewModel(resolver(calls))
        val packs = listOf(ShopPack(slug = "contours"), ShopPack(slug = "absent"))

        vm.prepare(AppearancePackDomain.AVATAR_RING, packs, "fr")
        vm.prepare(AppearancePackDomain.AVATAR_RING, packs, "fr")
        advanceUntilIdle()

        assertThat(calls).containsExactly("contours", "absent")
        assertThat(vm.state.value.itemsOf(AppearancePackDomain.AVATAR_RING, "contours")).hasSize(2)
        assertThat(vm.state.value.contentsOf(AppearancePackDomain.AVATAR_RING, "absent")).isEqualTo(ShopPackContents.DownloadRequired)
    }

    @Test fun `swiping to another page is remembered, a proposal from another pack replaces the viewer`() = runTest(dispatcher) {
        val vm = viewModel()
        vm.prepare(AppearancePackDomain.AVATAR_RING, listOf(ShopPack(slug = "contours"), ShopPack(slug = "autres")), "fr")
        vm.openDetail(AppearancePackDomain.AVATAR_RING, "contours")
        vm.openViewer(AppearancePackDomain.AVATAR_RING, "contours", 0)
        advanceUntilIdle()

        vm.settle(1)
        advanceUntilIdle()
        assertThat((vm.state.value.stack.top as ShopBrowseRoute.Viewer).index).isEqualTo(1)

        vm.showProposal(ring.copy(pack = "autres", key = "argent"))
        advanceUntilIdle()
        assertThat(vm.state.value.stack.top).isEqualTo(ShopBrowseRoute.Viewer(AppearancePackDomain.AVATAR_RING, "autres", 1))
        assertThat(vm.state.value.stack.routes).hasSize(2)
    }

    @Test fun `equipping goes through the profile decor equipment of the right side`() = runTest(dispatcher) {
        val decor = mockk<ProfileDecorRepository>()
        coEvery { decor.equip(any(), any()) } returns ProfileDecorOutcome.Confirmed(ServedProfileDecor.EMPTY)
        val vm = viewModel(decor = decor)
        advanceUntilIdle()

        vm.equip(ring)
        advanceUntilIdle()

        coVerify(exactly = 1) { decor.equip(match { it.pack == "contours" && it.item == "or" }, ProfileDecorSide.AVATAR_RING) }
        assertThat(vm.state.value.equipFailed).isFalse()
    }

    @Test fun `a refused equip says so, the repository having rolled the side back`() = runTest(dispatcher) {
        val decor = mockk<ProfileDecorRepository>()
        coEvery { decor.equip(any(), any()) } returns ProfileDecorOutcome.Failed(ProfileDecorError.SAVE_FAILED)
        val vm = viewModel(decor = decor)
        advanceUntilIdle()

        vm.equip(ring)
        advanceUntilIdle()

        assertThat(vm.state.value.equipFailed).isTrue()
    }

    @Test fun `an item already equipped or a wallpaper sends nothing`() = runTest(dispatcher) {
        val decor = mockk<ProfileDecorRepository>(relaxed = true)
        user.value = user.value!!.copy(profileDecor = ServedProfileDecor(avatarRing = ServedProfileDecorItem("contours", "or")))
        val vm = viewModel(decor = decor)
        advanceUntilIdle()

        vm.equip(ring)
        vm.equip(ring.copy(domain = AppearancePackDomain.WALLPAPER))
        advanceUntilIdle()

        coVerify(exactly = 0) { decor.equip(any(), any()) }
        assertThat(vm.state.value.me.decor.avatarRing?.item).isEqualTo("or")
    }
}
