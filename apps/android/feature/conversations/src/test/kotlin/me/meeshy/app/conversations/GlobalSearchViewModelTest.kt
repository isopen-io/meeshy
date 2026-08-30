package me.meeshy.app.conversations

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ConversationDeletedSocketEvent
import me.meeshy.sdk.model.ConversationUpdatedSocketEvent
import me.meeshy.sdk.model.search.SearchQueryCache
import me.meeshy.sdk.net.api.UserSearchResult
import me.meeshy.sdk.search.GlobalSearchRepository
import me.meeshy.sdk.search.InMemoryRecentSearchesStore
import me.meeshy.sdk.search.GlobalSearchResults
import me.meeshy.sdk.socket.MessageSocketManager
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class GlobalSearchViewModelTest {

    private val dispatcher = StandardTestDispatcher()
    private val repository = mockk<GlobalSearchRepository>()

    private val conversationUpdated = MutableSharedFlow<ConversationUpdatedSocketEvent>()
    private val conversationDeleted = MutableSharedFlow<ConversationDeletedSocketEvent>()
    private val socket = mockk<MessageSocketManager> {
        every { this@mockk.conversationUpdated } returns this@GlobalSearchViewModelTest.conversationUpdated
        every { this@mockk.conversationDeleted } returns this@GlobalSearchViewModelTest.conversationDeleted
    }

    // Horloge controlable : le TTL du cache de requetes se teste sans dormir.
    private var clockNow = 0L
    private val clock = object : CacheClock {
        override fun nowMillis(): Long = clockNow
    }

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private val recentSearches = InMemoryRecentSearchesStore()

    private fun viewModel() = GlobalSearchViewModel(repository, recentSearches, socket, clock)

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

    // Seule une recherche COMMISE (debounce ecoule, requete partie) entre dans
    // l'historique — les frappes intermediaires n'y laissent aucune trace.
    @Test
    fun `only committed searches enter the recent history`() = runTest(dispatcher) {
        coEvery { repository.search(any(), any(), any(), any()) } returns GlobalSearchResults()
        val vm = viewModel()
        vm.setQuery("bel")
        advanceTimeBy(100)
        vm.setQuery("belva")
        advanceUntilIdle()
        assertThat(vm.state.value.recentSearches).containsExactly("belva")

        vm.removeRecentSearch("belva")
        advanceUntilIdle()
        assertThat(vm.state.value.recentSearches).isEmpty()
    }

    // Cache-first : re-chercher un terme deja vu dans la fenetre TTL ressert le
    // resultat SANS repartir en reseau — parite iOS `messageQueryCache` (le
    // spinner ne reapparait pas, dimension 2 Performance).
    @Test
    fun `re-searching a cached query within the TTL skips the network`() = runTest(dispatcher) {
        coEvery { repository.search(any(), any(), any(), any()) } returns GlobalSearchResults(
            users = listOf(UserSearchResult(id = "u1", username = "belva")),
        )
        val vm = viewModel()
        vm.setQuery("belva")
        advanceUntilIdle()
        assertThat(vm.state.value.results.users).hasSize(1)

        vm.setQuery("b") // sous le seuil : vide, aucun reseau
        advanceUntilIdle()
        vm.setQuery("belva") // re-commise, mais TTL non ecoule
        advanceUntilIdle()

        coVerify(exactly = 1) { repository.search("belva", any(), any(), any()) }
        assertThat(vm.state.value.results.users).hasSize(1)
        assertThat(vm.state.value.hasSearched).isTrue()
        assertThat(vm.state.value.isSearching).isFalse()
    }

    // Une entree du cache expire au TTL : la MEME requete repart alors en reseau.
    @Test
    fun `a query re-searched after the TTL expires hits the network again`() = runTest(dispatcher) {
        coEvery { repository.search(any(), any(), any(), any()) } returns GlobalSearchResults(
            users = listOf(UserSearchResult(id = "u1", username = "belva")),
        )
        val vm = viewModel()
        clockNow = 0L
        vm.setQuery("belva")
        advanceUntilIdle()

        vm.setQuery("b")
        advanceUntilIdle()
        clockNow = SearchQueryCache.DEFAULT_TTL_MILLIS // pile au TTL : perime
        vm.setQuery("belva")
        advanceUntilIdle()

        coVerify(exactly = 2) { repository.search("belva", any(), any(), any()) }
    }

    // invalidateSearchCache vide le cache : la prochaine recherche identique
    // repart en reseau (le chemin qu'empruntent les evenements socket).
    @Test
    fun `invalidateSearchCache forces the next identical query back to the network`() = runTest(dispatcher) {
        coEvery { repository.search(any(), any(), any(), any()) } returns GlobalSearchResults()
        val vm = viewModel()
        vm.setQuery("belva")
        advanceUntilIdle()

        vm.setQuery("b")
        advanceUntilIdle()
        vm.invalidateSearchCache()
        vm.setQuery("belva")
        advanceUntilIdle()

        coVerify(exactly = 2) { repository.search("belva", any(), any(), any()) }
    }

    // Un `conversation:updated` recu par socket invalide le cache : les resultats
    // gardes pourraient etre perimes (parite iOS `setupSocketInvalidation`).
    @Test
    fun `a conversation-updated socket event invalidates the query cache`() = runTest(dispatcher) {
        coEvery { repository.search(any(), any(), any(), any()) } returns GlobalSearchResults()
        val vm = viewModel()
        vm.setQuery("belva")
        advanceUntilIdle()

        conversationUpdated.emit(ConversationUpdatedSocketEvent(conversationId = "c1"))
        advanceUntilIdle()

        vm.setQuery("b")
        advanceUntilIdle()
        vm.setQuery("belva")
        advanceUntilIdle()

        coVerify(exactly = 2) { repository.search("belva", any(), any(), any()) }
    }

    // Un `conversation:deleted` recu par socket invalide aussi le cache.
    @Test
    fun `a conversation-deleted socket event invalidates the query cache`() = runTest(dispatcher) {
        coEvery { repository.search(any(), any(), any(), any()) } returns GlobalSearchResults()
        val vm = viewModel()
        vm.setQuery("belva")
        advanceUntilIdle()

        conversationDeleted.emit(ConversationDeletedSocketEvent(conversationId = "c1"))
        advanceUntilIdle()

        vm.setQuery("b")
        advanceUntilIdle()
        vm.setQuery("belva")
        advanceUntilIdle()

        coVerify(exactly = 2) { repository.search("belva", any(), any(), any()) }
    }
}
