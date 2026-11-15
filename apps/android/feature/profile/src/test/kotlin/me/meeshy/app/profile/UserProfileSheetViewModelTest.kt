package me.meeshy.app.profile

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.UserUpdatedEvent
import me.meeshy.sdk.model.profile.ProfileLoadState
import me.meeshy.sdk.model.profile.ProfileSheetUser
import me.meeshy.sdk.profile.ProfileCacheRepository
import me.meeshy.sdk.profile.ProfileSheetLoader
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.MessageSocketManager
import me.meeshy.sdk.theme.DynamicColorGenerator
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class UserProfileSheetViewModelTest {
    private val dispatcher = StandardTestDispatcher()
    private val updates = MutableSharedFlow<UserUpdatedEvent>(extraBufferCapacity = 8)
    private val cache = mockk<ProfileCacheRepository>(relaxed = true)
    private val loader = mockk<ProfileSheetLoader>()
    private val bob = MeeshyUser(id = "64b7f0a1c2d3e4f5a6b7c8d9", username = "bob", displayName = "Bob")

    @Before fun setUp() = Dispatchers.setMain(dispatcher)
    @After fun tearDown() = Dispatchers.resetMain()

    private fun session(me: MeeshyUser? = null): SessionRepository {
        val session = mockk<SessionRepository>()
        every { session.currentUser } returns MutableStateFlow(me)
        every { session.currentUserId } returns me?.id
        return session
    }

    private fun viewModel(vararg states: ProfileLoadState, me: MeeshyUser? = null): UserProfileSheetViewModel {
        every { loader.open(any(), any(), any()) } returns flowOf(*states)
        val socket = mockk<MessageSocketManager>()
        every { socket.userUpdated } returns updates
        return UserProfileSheetViewModel(loader, cache, socket, session(me))
    }

    @Test
    fun `la fiche expose le contenu charge et un squelette seulement a vide`() = runTest(dispatcher) {
        val vm = viewModel(
            ProfileLoadState(isLoadingProfile = true, isLoadingStats = true),
            ProfileLoadState(profile = bob),
        )
        vm.onEvent(UserProfileSheetEvent.Open(ProfileSheetUser(userId = bob.id, username = "bob")))
        advanceUntilIdle()
        assertThat(vm.state.value.profile).isEqualTo(bob)
        assertThat(vm.state.value.isLoadingProfile).isFalse()
    }

    @Test
    fun `une panne a vide offre reessayer qui rejoue l'ouverture`() = runTest(dispatcher) {
        val vm = viewModel(ProfileLoadState(profileLoadFailed = true))
        vm.onEvent(UserProfileSheetEvent.Open(ProfileSheetUser(userId = bob.id, username = "bob")))
        advanceUntilIdle()
        assertThat(vm.state.value.canRetry).isTrue()
        vm.onEvent(UserProfileSheetEvent.Retry)
        advanceUntilIdle()
        io.mockk.verify { loader.open(bob.id, "bob", true) }
    }

    @Test
    fun `bloque par la cible n'offre pas de reessayer et neutralise l'accent`() = runTest(dispatcher) {
        val vm = viewModel(ProfileLoadState(isBlockedByTarget = true, profileLoadFailed = true))
        vm.onEvent(UserProfileSheetEvent.Open(ProfileSheetUser(userId = bob.id, username = "bob")))
        advanceUntilIdle()
        assertThat(vm.state.value.canRetry).isFalse()
        assertThat(vm.state.value.accentHex).isEqualTo("888888")
        vm.onEvent(UserProfileSheetEvent.Retry)
        advanceUntilIdle()
        io.mockk.verify(exactly = 1) { loader.open(any(), any(), any()) }
    }

    @Test
    fun `une fiche ouverte par pseudo est hydratee sans perdre l'accent derive`() = runTest(dispatcher) {
        val vm = viewModel(ProfileLoadState(profile = bob))
        vm.onEvent(UserProfileSheetEvent.Open(ProfileSheetUser(username = "bob")))
        val accentBefore = vm.state.value.user.accentColor
        advanceUntilIdle()
        assertThat(accentBefore).isNotEmpty()
        assertThat(vm.state.value.user.userId).isEqualTo(bob.id)
        assertThat(vm.state.value.user.accentColor).isEqualTo(accentBefore)
    }

    @Test
    fun `user updated du profil ouvert repeint sans relecture et un autre compte est ignore`() = runTest(dispatcher) {
        val vm = viewModel(ProfileLoadState(profile = bob))
        vm.onEvent(UserProfileSheetEvent.Open(ProfileSheetUser(userId = bob.id, username = "bob")))
        advanceUntilIdle()
        updates.tryEmit(UserUpdatedEvent(userId = "autre", displayName = "X", username = "x", hasNameGroup = true))
        advanceUntilIdle()
        assertThat(vm.state.value.profile?.displayName).isEqualTo("Bob")
        val event = UserUpdatedEvent(userId = bob.id, displayName = "Bobby", username = "bob", hasNameGroup = true)
        updates.tryEmit(event)
        advanceUntilIdle()
        assertThat(vm.state.value.profile?.displayName).isEqualTo("Bobby")
        coVerify { cache.repaint(event) }
        io.mockk.verify(exactly = 1) { loader.open(any(), any(), any()) }
    }

    @Test
    fun `c'est moi par id ou par pseudo et un tiers ne l'est pas`() = runTest(dispatcher) {
        val me = MeeshyUser(id = "64b7f0a1c2d3e4f5a6b7c8aa", username = "atabeth")
        val byId = viewModel(ProfileLoadState(), me = me)
        byId.onEvent(UserProfileSheetEvent.Open(ProfileSheetUser(userId = me.id, username = "x")))
        advanceUntilIdle()
        assertThat(byId.state.value.isSelf).isTrue()

        val byName = viewModel(ProfileLoadState(), me = me)
        byName.onEvent(UserProfileSheetEvent.Open(ProfileSheetUser(username = "atabeth")))
        advanceUntilIdle()
        assertThat(byName.state.value.isSelf).isTrue()

        val other = viewModel(ProfileLoadState(profile = bob), me = me)
        other.onEvent(UserProfileSheetEvent.Open(ProfileSheetUser(userId = bob.id, username = "bob")))
        advanceUntilIdle()
        assertThat(other.state.value.isSelf).isFalse()
    }

    @Test
    fun `l'accent est celui du profil jamais celui de l'ecran appelant`() = runTest(dispatcher) {
        val vm = viewModel(ProfileLoadState(profile = bob))
        vm.onEvent(UserProfileSheetEvent.Open(ProfileSheetUser(userId = bob.id, username = "bob", accentColor = "FF0000")))
        advanceUntilIdle()
        assertThat(vm.state.value.user.accentColor).isEqualTo(DynamicColorGenerator.profileAccentHex(bob.id, "bob"))
    }

    @Test
    fun `ouvrir une autre personne ne repeint jamais la precedente`() = runTest(dispatcher) {
        val vm = viewModel(ProfileLoadState(profile = bob))
        vm.onEvent(UserProfileSheetEvent.Open(ProfileSheetUser(userId = bob.id, username = "bob")))
        advanceUntilIdle()
        every { loader.open(any(), any(), any()) } returns kotlinx.coroutines.flow.emptyFlow()
        vm.onEvent(UserProfileSheetEvent.Open(ProfileSheetUser(userId = "64b7f0a1c2d3e4f5a6b7c8ee", username = "eve")))
        assertThat(vm.state.value.profile).isNull()
        assertThat(vm.state.value.content).isEqualTo(ProfileSheetContent.Skeleton)
    }
}
