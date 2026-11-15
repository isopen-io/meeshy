package me.meeshy.app.contacts

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.UserSearchResult
import me.meeshy.sdk.user.UserRepository
import org.junit.After
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class KeypadViewModelTest {

    private val dispatcher = StandardTestDispatcher()

    init {
        Dispatchers.setMain(dispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun alice() = UserSearchResult(id = "u1", username = "alice", displayName = "Alice")

    private fun viewModel(
        users: UserRepository = mockk(relaxed = true),
        conversations: ConversationRepository = mockk(relaxed = true),
    ) = KeypadViewModel(users, conversations)

    private fun KeypadViewModel.type(text: String) = text.forEach { onEvent(KeypadUiEvent.Append(it.toString())) }

    private fun TestScope.settle() {
        advanceTimeBy(301)
        runCurrent()
    }

    @Test
    fun `sous les seuils aucune requete ne part`() = runTest(dispatcher) {
        val users = mockk<UserRepository>(relaxed = true)
        val vm = viewModel(users)

        vm.type("12")
        settle()

        assertThat(vm.state.value.load).isEqualTo(KeypadLoad.Idle)
        coVerify(exactly = 0) { users.getProfileByPhone(any()) }
        coVerify(exactly = 0) { users.searchUsers(any(), any(), any()) }
    }

    @Test
    fun `l'anti-rebond de 300 ms regroupe les touches en une seule requete`() = runTest(dispatcher) {
        val users = mockk<UserRepository>()
        coEvery { users.getProfileByPhone("123") } returns NetworkResult.Success(MeeshyUser(id = "u1", username = "alice"))
        val vm = viewModel(users)

        vm.type("123")
        advanceTimeBy(299)
        runCurrent()
        coVerify(exactly = 0) { users.getProfileByPhone(any()) }

        advanceTimeBy(2)
        runCurrent()

        coVerify(exactly = 1) { users.getProfileByPhone("123") }
        assertThat(vm.state.value.load).isEqualTo(KeypadLoad.Loaded)
        assertThat(vm.state.value.rows.map { it.user.id }).containsExactly("u1")
    }

    @Test
    fun `un 404 par telephone est un resultat vide et non une erreur`() = runTest(dispatcher) {
        val users = mockk<UserRepository>()
        coEvery { users.getProfileByPhone(any()) } returns
            NetworkResult.Failure(ApiError(message = "not found", httpStatus = 404))
        val vm = viewModel(users)

        vm.type("+33612")
        settle()

        assertThat(vm.state.value.load).isEqualTo(KeypadLoad.Loaded)
        assertThat(vm.state.value.rows).isEmpty()
    }

    @Test
    fun `le telephone part en chiffres seulement`() = runTest(dispatcher) {
        val users = mockk<UserRepository>(relaxed = true)
        val vm = viewModel(users)

        vm.type("+33 6 12")
        settle()

        coVerify { users.getProfileByPhone("33612") }
    }

    @Test
    fun `une erreur de recherche par nom donne l'etat erreur`() = runTest(dispatcher) {
        val users = mockk<UserRepository>()
        coEvery { users.searchUsers("al", 20, 0) } returns NetworkResult.Failure(ApiError(message = "boom", httpStatus = 500))
        val vm = viewModel(users)

        vm.type("al")
        settle()

        assertThat(vm.state.value.load).isEqualTo(KeypadLoad.Error)
        assertThat(vm.state.value.rows).isEmpty()
    }

    @Test
    fun `la reponse d'une saisie perimee est ignoree`() = runTest(dispatcher) {
        val slow = CompletableDeferred<NetworkResult<List<UserSearchResult>>>()
        val users = mockk<UserRepository>()
        coEvery { users.searchUsers("al", 20, 0) } coAnswers { slow.await() }
        coEvery { users.searchUsers("ali", 20, 0) } returns NetworkResult.Success(listOf(alice()))
        val vm = viewModel(users)

        vm.type("al")
        settle()
        vm.type("i")
        settle()
        slow.complete(NetworkResult.Success(listOf(UserSearchResult(id = "stale", username = "stale"))))
        runCurrent()

        assertThat(vm.state.value.rows.map { it.user.id }).containsExactly("u1")
    }

    @Test
    fun `effacer annule la recherche en cours et revient a l'etat initial`() = runTest(dispatcher) {
        val slow = CompletableDeferred<NetworkResult<List<UserSearchResult>>>()
        val users = mockk<UserRepository>()
        coEvery { users.searchUsers(any(), any(), any()) } coAnswers { slow.await() }
        val vm = viewModel(users)

        vm.type("al")
        settle()
        assertThat(vm.state.value.load).isEqualTo(KeypadLoad.Loading)
        vm.onEvent(KeypadUiEvent.Clear)
        slow.complete(NetworkResult.Success(listOf(alice())))
        runCurrent()

        assertThat(vm.state.value).isEqualTo(KeypadUiState())
    }

    @Test
    fun `une conversation directe connue est portee par la ligne`() = runTest(dispatcher) {
        val users = mockk<UserRepository>()
        coEvery { users.searchUsers("al", 20, 0) } returns NetworkResult.Success(listOf(alice()))
        val conversations = mockk<ConversationRepository>()
        coEvery { conversations.cachedDirectWith("u1") } returns ApiConversation(id = "c9")
        val vm = viewModel(users, conversations)

        vm.type("al")
        settle()

        assertThat(vm.state.value.rows.single().directConversationId).isEqualTo("c9")
    }

    @Test
    fun `retour arriere retire un caractere`() = runTest(dispatcher) {
        val vm = viewModel()

        vm.type("12")
        vm.onEvent(KeypadUiEvent.DeleteLast)

        assertThat(vm.state.value.input).isEqualTo("1")
    }
}
