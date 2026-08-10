package me.meeshy.app.conversations

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.net.api.UserSearchResult
import me.meeshy.sdk.search.GlobalSearchRepository
import me.meeshy.sdk.search.GlobalSearchResults
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class GlobalSearchViewModelTest {

    private val dispatcher = StandardTestDispatcher()
    private val repository = mockk<GlobalSearchRepository>()

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun viewModel() = GlobalSearchViewModel(repository)

    // Une frappe sous le seuil ne part JAMAIS en reseau : la recherche a 1
    // caractere renverrait la moitie de la base et l'UI clignoterait a chaque
    // lettre tapee.
    @Test
    fun `queries below the threshold never hit the network`() = runTest(dispatcher) {
        val vm = viewModel()
        vm.setQuery("a")
        advanceUntilIdle()
        coVerify(exactly = 0) { repository.search(any(), any(), any(), any()) }
        assertThat(vm.state.value.hasSearched).isFalse()
    }

    // Le debounce coalise les frappes : trois saisies rapides = UNE recherche,
    // celle du texte final.
    @Test
    fun `rapid keystrokes coalesce into a single search of the final text`() = runTest(dispatcher) {
        coEvery { repository.search(any(), any(), any(), any()) } returns GlobalSearchResults()
        val vm = viewModel()
        vm.setQuery("bel")
        advanceTimeBy(100)
        vm.setQuery("belv")
        advanceTimeBy(100)
        vm.setQuery("belva")
        advanceUntilIdle()
        coVerify(exactly = 1) { repository.search("belva", any(), any(), any()) }
    }

    // Revenir sous le seuil apres une recherche VIDE les resultats : des restes
    // d'une requete precedente sous un champ quasi vide font croire a des
    // resultats pour la nouvelle saisie.
    @Test
    fun `shrinking the query below the threshold clears previous results`() = runTest(dispatcher) {
        coEvery { repository.search(any(), any(), any(), any()) } returns GlobalSearchResults(
            users = listOf(UserSearchResult(id = "u1", username = "belva")),
        )
        val vm = viewModel()
        vm.setQuery("belva")
        advanceUntilIdle()
        assertThat(vm.state.value.results.users).hasSize(1)

        vm.setQuery("b")
        advanceUntilIdle()
        assertThat(vm.state.value.results.users).isEmpty()
        assertThat(vm.state.value.hasSearched).isFalse()
    }

    // Le compte par onglet vient du MEME resultat : changer d'onglet ne re-fetche
    // pas, il ne fait que changer la vue.
    @Test
    fun `tab counts derive from the single shared result`() = runTest(dispatcher) {
        coEvery { repository.search(any(), any(), any(), any()) } returns GlobalSearchResults(
            conversations = listOf(ApiConversation(id = "c1"), ApiConversation(id = "c2")),
            users = listOf(UserSearchResult(id = "u1")),
        )
        val vm = viewModel()
        vm.setQuery("meeshy")
        advanceUntilIdle()

        val state = vm.state.value
        assertThat(state.countFor(GlobalSearchTab.CONVERSATIONS)).isEqualTo(2)
        assertThat(state.countFor(GlobalSearchTab.USERS)).isEqualTo(1)
        assertThat(state.countFor(GlobalSearchTab.MESSAGES)).isEqualTo(0)
        coVerify(exactly = 1) { repository.search(any(), any(), any(), any()) }

        vm.selectTab(GlobalSearchTab.USERS)
        coVerify(exactly = 1) { repository.search(any(), any(), any(), any()) }
    }
}
