package me.meeshy.app.profile

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.appearance.AppearanceCatalogLoader
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.PackOrigin
import me.meeshy.sdk.model.ProfileDecorRef
import me.meeshy.sdk.model.ProfileDecorSide
import me.meeshy.sdk.model.ServedProfileDecor
import me.meeshy.sdk.model.ServedProfileDecorItem
import me.meeshy.sdk.model.appearance.AppearanceCatalog
import me.meeshy.sdk.model.appearance.InstalledPackList
import me.meeshy.sdk.model.appearance.InstalledPackSummary
import me.meeshy.sdk.net.api.PackApi
import me.meeshy.sdk.profile.ProfileDecorError
import me.meeshy.sdk.profile.ProfileDecorOutcome
import me.meeshy.sdk.profile.ProfileDecorRepository
import me.meeshy.sdk.session.SessionRepository
import org.junit.After
import org.junit.Before
import org.junit.Test

/**
 * Le sélecteur de décor de MON profil : il ne montre que ce que la session porte (la passerelle a servi), ne propose
 * que les packs installés et possédés, et un refus du serveur le dit sans toucher l'autre côté.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class ProfileDecorViewModelTest {

    private val dispatcher = StandardTestDispatcher()

    @Before fun setUp() = Dispatchers.setMain(dispatcher)

    @After fun tearDown() = Dispatchers.resetMain()

    private val catalog: AppearanceCatalog by lazy {
        val relative = "sdk-core/src/main/assets/appearance-catalog.json"
        val file = generateSequence(File(".").absoluteFile) { it.parentFile }.take(8)
            .flatMap { sequenceOf(File(it, relative), File(it, "apps/android/$relative")) }
            .first { it.isFile }
        AppearanceCatalog.decodeOrEmpty(file.readText())
    }

    private fun item(pack: String, key: String) = ServedProfileDecorItem(pack, key, PackOrigin.BUILTIN)

    private class Scenario(
        val viewModel: ProfileDecorViewModel,
        val repository: ProfileDecorRepository,
        val session: SessionRepository,
    )

    private fun scenario(
        decor: ServedProfileDecor = ServedProfileDecor.EMPTY,
        banner: String? = null,
        installed: (String) -> InstalledPackList? = { null },
        equip: (ServedProfileDecorItem?, ProfileDecorSide) -> ProfileDecorOutcome = { _, _ -> ProfileDecorOutcome.Superseded },
    ): Scenario {
        val session = mockk<SessionRepository>()
        val user = MutableStateFlow<MeeshyUser?>(MeeshyUser(id = "me", username = "me", banner = banner, profileDecor = decor))
        every { session.currentUser } returns user
        val repository = mockk<ProfileDecorRepository>()
        coEvery { repository.equip(any(), any()) } coAnswers { equip(firstArg(), secondArg()) }
        val loader = mockk<AppearanceCatalogLoader>()
        every { loader.state } returns MutableStateFlow(catalog)
        coEvery { loader.catalog() } returns catalog
        val packs = mockk<PackApi>()
        coEvery { packs.installed(any<String>()) } coAnswers {
            val list = installed(firstArg()) ?: throw java.io.IOException("offline")
            me.meeshy.sdk.model.ApiResponse(success = true, data = list)
        }
        return Scenario(ProfileDecorViewModel(repository, session, loader, packs), repository, session)
    }

    @Test
    fun `before the installed lists are read the default packs are offered`() = runTest(dispatcher) {
        val s = scenario()
        val job = s.viewModel.state.onEach { }.launchIn(backgroundScope)
        advanceUntilIdle()

        assertThat(s.viewModel.state.value.rings.map { it.pack }).contains("contours-essentiels")
        job.cancel()
    }

    @Test
    fun `a banner photo hides every design on the sheet`() = runTest(dispatcher) {
        val pack = catalog.bannerPacks.first()
        val design = item(pack.slug, pack.designs.first().key)
        val s = scenario(decor = ServedProfileDecor(banner = design), banner = "https://cdn/b.jpg")
        s.viewModel.state.onEach { }.launchIn(backgroundScope)
        advanceUntilIdle()

        val choice = s.viewModel.state.value.bannerChoice
        assertThat(choice.photoHidesDesigns).isTrue()
        assertThat(choice.isSelected(design.ref)).isFalse()
    }

    @Test
    fun `choosing a ring sends one intention for that side`() = runTest(dispatcher) {
        val s = scenario()
        s.viewModel.state.onEach { }.launchIn(backgroundScope)
        advanceUntilIdle()

        s.viewModel.equip(ProfileDecorRef("contours-essentiels", "x"), ProfileDecorSide.AVATAR_RING)
        advanceUntilIdle()

        coVerify(exactly = 1) {
            s.repository.equip(
                match { it?.pack == "contours-essentiels" && it.item == "x" && it.origin == PackOrigin.BUILTIN },
                ProfileDecorSide.AVATAR_RING,
            )
        }
    }

    @Test
    fun `choosing what is already equipped sends nothing`() = runTest(dispatcher) {
        val equipped = item("contours-essentiels", "x")
        val s = scenario(decor = ServedProfileDecor(avatarRing = equipped))
        s.viewModel.state.onEach { }.launchIn(backgroundScope)
        advanceUntilIdle()

        s.viewModel.equip(equipped.ref, ProfileDecorSide.AVATAR_RING)
        advanceUntilIdle()

        coVerify(exactly = 0) { s.repository.equip(any(), any()) }
    }

    @Test
    fun `a refusal by the gateway is said and a new choice clears it`() = runTest(dispatcher) {
        var refuse = true
        val s = scenario(equip = { _, _ ->
            if (refuse) ProfileDecorOutcome.Failed(ProfileDecorError.SAVE_FAILED) else ProfileDecorOutcome.Superseded
        })
        s.viewModel.state.onEach { }.launchIn(backgroundScope)
        advanceUntilIdle()

        s.viewModel.equip(ProfileDecorRef("p", "a"), ProfileDecorSide.BANNER)
        advanceUntilIdle()
        assertThat(s.viewModel.state.value.failed).isTrue()

        refuse = false
        s.viewModel.equip(ProfileDecorRef("p", "b"), ProfileDecorSide.BANNER)
        advanceUntilIdle()
        assertThat(s.viewModel.state.value.failed).isFalse()
    }

    @Test
    fun `an unpaid installed pack is not offered`() = runTest(dispatcher) {
        val locked = catalog.ringPacks.first { !it.installedByDefault }
        val s = scenario(installed = {
            InstalledPackList(listOf(InstalledPackSummary(locked.slug, installed = true, owned = false, price = 50)))
        })
        s.viewModel.state.onEach { }.launchIn(backgroundScope)
        advanceUntilIdle()

        assertThat(s.viewModel.state.value.rings.map { it.pack }).doesNotContain(locked.slug)
    }
}
