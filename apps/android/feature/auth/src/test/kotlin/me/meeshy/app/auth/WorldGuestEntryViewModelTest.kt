package me.meeshy.app.auth

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.model.AnonymousSessionContext
import me.meeshy.sdk.model.ParticipantPermissions
import me.meeshy.sdk.model.world.WorldEntry
import me.meeshy.sdk.model.world.WorldEntryFailure
import me.meeshy.sdk.model.world.WorldGuestStep
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.session.InMemoryAnonymousSessionStore
import me.meeshy.sdk.world.WorldEntryRepository
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class WorldGuestEntryViewModelTest {

    private val dispatcher = StandardTestDispatcher()

    @Before
    fun setUp() = Dispatchers.setMain(dispatcher)

    @After
    fun tearDown() = Dispatchers.resetMain()

    private val entry = WorldEntry(identifier = "world", title = "World Wide", shareLinkIdentifier = "mshy_w")

    private fun session(conversationId: String = "c1", linkId: String = "mshy_w") = AnonymousSessionContext(
        sessionToken = "tok",
        participantId = "p1",
        permissions = ParticipantPermissions.anonymous(canSendMessages = true, canSendFiles = false, canSendImages = false),
        linkId = linkId,
        conversationId = conversationId,
    )

    private fun repository(
        entryResult: NetworkResult<WorldEntry> = NetworkResult.Success(entry),
        joinResult: NetworkResult<AnonymousSessionContext> = NetworkResult.Success(session()),
    ): WorldEntryRepository = mockk<WorldEntryRepository>().also {
        coEvery { it.entry() } returns entryResult
        coEvery { it.joinAsGuest(any(), any(), any()) } returns joinResult
    }

    private fun viewModel(
        repository: WorldEntryRepository = repository(),
        store: InMemoryAnonymousSessionStore = InMemoryAnonymousSessionStore(),
        authenticated: Boolean = false,
    ) = WorldGuestEntryViewModel(repository, store, ShareLinkAuthStateProviding { authenticated })

    @Test
    fun `la porte s'ouvre avec l'entree servie et attend un nom`() = runTest(dispatcher) {
        val vm = viewModel()
        advanceUntilIdle()

        assertThat(vm.state.value.availability).isEqualTo(WorldAvailability.Open(entry))
        assertThat(vm.state.value.worldTitle).isEqualTo("World Wide")
        assertThat(vm.state.value.step).isEqualTo(WorldGuestStep.NAME)
        assertThat(vm.state.value.canContinue).isFalse()
    }

    @Test
    fun `un 404 ferme la porte`() = runTest(dispatcher) {
        val vm = viewModel(repository(entryResult = NetworkResult.Failure(ApiError(message = "x", httpStatus = 404))))
        advanceUntilIdle()

        assertThat(vm.state.value.availability).isEqualTo(WorldAvailability.Unavailable)
    }

    @Test
    fun `un nom vide ne passe pas a la langue, un nom valide oui, et le retour revient au nom`() = runTest(dispatcher) {
        val vm = viewModel()
        advanceUntilIdle()

        vm.continueToLanguage()
        assertThat(vm.state.value.step).isEqualTo(WorldGuestStep.NAME)

        vm.onNameChange("  Amina ")
        vm.continueToLanguage()
        assertThat(vm.state.value.step).isEqualTo(WorldGuestStep.LANGUAGE)
        assertThat(vm.state.value.trimmedName).isEqualTo("Amina")

        assertThat(vm.back()).isTrue()
        assertThat(vm.state.value.step).isEqualTo(WorldGuestStep.NAME)
        assertThat(vm.back()).isFalse()
    }

    @Test
    fun `un nom de deux caracteres ne passe pas a la langue et dit son minimum, trois caracteres passent`() = runTest(dispatcher) {
        val vm = viewModel()
        advanceUntilIdle()

        vm.onNameChange(" Al ")
        assertThat(vm.state.value.nameTooShort).isTrue()
        assertThat(vm.state.value.canContinue).isFalse()
        vm.continueToLanguage()
        assertThat(vm.state.value.step).isEqualTo(WorldGuestStep.NAME)

        vm.onNameChange("Ali")
        assertThat(vm.state.value.nameTooShort).isFalse()
        vm.continueToLanguage()
        assertThat(vm.state.value.step).isEqualTo(WorldGuestStep.LANGUAGE)
    }

    @Test
    fun `l'entree envoie la cle lue, le nom rogne et la langue choisie, puis ouvre le fil`() = runTest(dispatcher) {
        val repository = repository()
        val vm = viewModel(repository)
        advanceUntilIdle()
        vm.onNameChange(" Amina ")
        vm.onLanguageChange("pt")
        vm.continueToLanguage()

        vm.enter()
        advanceUntilIdle()

        coVerify(exactly = 1) { repository.joinAsGuest("mshy_w", "Amina", "pt") }
        assertThat(vm.state.value.destination).isEqualTo(WorldDestination.Conversation("c1"))
        assertThat(vm.state.value.isEntering).isFalse()
    }

    @Test
    fun `un second appui pendant l'entree ne relance pas la requete`() = runTest(dispatcher) {
        val gate = CompletableDeferred<NetworkResult<AnonymousSessionContext>>()
        val repository = mockk<WorldEntryRepository>().also {
            coEvery { it.entry() } returns NetworkResult.Success(entry)
            coEvery { it.joinAsGuest(any(), any(), any()) } coAnswers { gate.await() }
        }
        val vm = viewModel(repository)
        advanceUntilIdle()
        vm.onNameChange("Amina")
        vm.continueToLanguage()

        vm.enter()
        vm.enter()
        advanceUntilIdle()
        assertThat(vm.state.value.isEntering).isTrue()
        assertThat(vm.back()).isTrue()
        assertThat(vm.state.value.step).isEqualTo(WorldGuestStep.LANGUAGE)

        gate.complete(NetworkResult.Success(session()))
        advanceUntilIdle()

        coVerify(exactly = 1) { repository.joinAsGuest(any(), any(), any()) }
    }

    @Test
    fun `un refus de la passerelle dit sa raison et laisse reessayer`() = runTest(dispatcher) {
        val vm = viewModel(
            repository(joinResult = NetworkResult.Failure(ApiError(message = "Lien fermé", httpStatus = 403))),
        )
        advanceUntilIdle()
        vm.onNameChange("Amina")
        vm.continueToLanguage()

        vm.enter()
        advanceUntilIdle()

        assertThat(vm.state.value.failure).isEqualTo(WorldEntryFailure.Refused("Lien fermé"))
        assertThat(vm.state.value.destination).isNull()
        assertThat(vm.state.value.canEnter).isTrue()
    }

    @Test
    fun `une session invitee deja ouverte sur la cle est reprise sans reposer les questions`() = runTest(dispatcher) {
        val store = InMemoryAnonymousSessionStore().also { it.save(session(conversationId = "c9")) }
        val vm = viewModel(store = store)
        advanceUntilIdle()

        assertThat(vm.state.value.destination).isEqualTo(WorldDestination.Conversation("c9"))
    }

    @Test
    fun `une session invitee d'un autre lien n'est pas reprise`() = runTest(dispatcher) {
        val store = InMemoryAnonymousSessionStore().also { it.save(session(linkId = "autre")) }
        val vm = viewModel(store = store)
        advanceUntilIdle()

        assertThat(vm.state.value.destination).isNull()
    }

    @Test
    fun `un compte ouvert n'entre jamais en invite mais passe a la porte des comptes`() = runTest(dispatcher) {
        val repository = repository()
        val vm = viewModel(repository, authenticated = true)
        advanceUntilIdle()

        assertThat(vm.state.value.destination).isEqualTo(WorldDestination.AccountJoin("mshy_w"))
        vm.onNameChange("Amina")
        vm.continueToLanguage()
        vm.enter()
        advanceUntilIdle()
        coVerify(exactly = 0) { repository.joinAsGuest(any(), any(), any()) }
    }
}
