package me.meeshy.app.conversations

import com.google.common.truth.Truth.assertThat
import io.mockk.every
import io.mockk.verify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ConversationClosedSocketEvent
import me.meeshy.sdk.model.ConversationDeletedSocketEvent
import me.meeshy.sdk.model.ConversationUpdatedSocketEvent
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.search.SearchLoadState
import me.meeshy.sdk.model.search.SearchPane
import me.meeshy.sdk.model.search.SearchPaneFailure
import me.meeshy.sdk.model.search.SearchPaneKind
import me.meeshy.sdk.model.search.SearchQueryCache
import me.meeshy.sdk.net.api.UserSearchResult
import me.meeshy.sdk.search.GlobalSearchRepository
import me.meeshy.sdk.search.InMemoryRecentSearchesStore
import me.meeshy.sdk.search.GlobalSearchResults
import me.meeshy.sdk.search.GlobalSearchSnapshot
import me.meeshy.sdk.session.SessionRepository
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
    private val conversationClosed = MutableSharedFlow<ConversationClosedSocketEvent>()
    private val socket = mockk<MessageSocketManager> {
        every { this@mockk.conversationUpdated } returns this@GlobalSearchViewModelTest.conversationUpdated
        every { this@mockk.conversationDeleted } returns this@GlobalSearchViewModelTest.conversationDeleted
        every { this@mockk.conversationRestored } returns MutableSharedFlow()
        every { this@mockk.conversationClosed } returns this@GlobalSearchViewModelTest.conversationClosed
    }

    private val signedInUser = MutableStateFlow<MeeshyUser?>(null)
    private val session = mockk<SessionRepository> {
        every { this@mockk.currentUser } returns this@GlobalSearchViewModelTest.signedInUser
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

    private fun stubSearch(results: GlobalSearchResults) {
        every { repository.search(any(), any(), any(), any()) } returns flowOf(GlobalSearchSnapshot.settled(results))
    }

    private fun stubSnapshots(vararg snapshots: GlobalSearchSnapshot) {
        every { repository.search(any(), any(), any(), any()) } returns flow { snapshots.forEach { emit(it) } }
    }

    private fun viewModel() = GlobalSearchViewModel(repository, recentSearches, socket, clock, session)

    // Une frappe sous le seuil ne part JAMAIS en reseau : la recherche a 1
    // caractere renverrait la moitie de la base et l'UI clignoterait a chaque
    // lettre tapee.
    @Test
    fun `queries below the threshold never hit the network`() = runTest(dispatcher) {
        val vm = viewModel()
        vm.setQuery("a")
        advanceUntilIdle()
        verify(exactly = 0) { repository.search(any(), any(), any(), any()) }
        assertThat(vm.state.value.hasSearched).isFalse()
    }

    // Le debounce coalise les frappes : trois saisies rapides = UNE recherche,
    // celle du texte final.
    @Test
    fun `rapid keystrokes coalesce into a single search of the final text`() = runTest(dispatcher) {
        stubSearch(GlobalSearchResults())
        val vm = viewModel()
        vm.setQuery("bel")
        advanceTimeBy(100)
        vm.setQuery("belv")
        advanceTimeBy(100)
        vm.setQuery("belva")
        advanceUntilIdle()
        verify(exactly = 1) { repository.search("belva", any(), any(), any()) }
    }

    // Revenir sous le seuil apres une recherche VIDE les resultats : des restes
    // d'une requete precedente sous un champ quasi vide font croire a des
    // resultats pour la nouvelle saisie.
    @Test
    fun `shrinking the query below the threshold clears previous results`() = runTest(dispatcher) {
        stubSearch(GlobalSearchResults(
            users = listOf(UserSearchResult(id = "u1", username = "belva")),
        ))
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
        stubSearch(GlobalSearchResults(
            conversations = listOf(ApiConversation(id = "c1"), ApiConversation(id = "c2")),
            users = listOf(UserSearchResult(id = "u1")),
        ))
        val vm = viewModel()
        vm.setQuery("meeshy")
        advanceUntilIdle()

        val state = vm.state.value
        assertThat(state.countFor(GlobalSearchTab.CONVERSATIONS)).isEqualTo(2)
        assertThat(state.countFor(GlobalSearchTab.USERS)).isEqualTo(1)
        assertThat(state.countFor(GlobalSearchTab.MESSAGES)).isEqualTo(0)
        verify(exactly = 1) { repository.search(any(), any(), any(), any()) }

        vm.selectTab(GlobalSearchTab.USERS)
        verify(exactly = 1) { repository.search(any(), any(), any(), any()) }
    }

    // Seule une recherche COMMISE (debounce ecoule, requete partie) entre dans
    // l'historique — les frappes intermediaires n'y laissent aucune trace.
    @Test
    fun `only committed searches enter the recent history`() = runTest(dispatcher) {
        stubSearch(GlobalSearchResults())
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
        stubSearch(GlobalSearchResults(
            users = listOf(UserSearchResult(id = "u1", username = "belva")),
        ))
        val vm = viewModel()
        vm.setQuery("belva")
        advanceUntilIdle()
        assertThat(vm.state.value.results.users).hasSize(1)

        vm.setQuery("b") // sous le seuil : vide, aucun reseau
        advanceUntilIdle()
        vm.setQuery("belva") // re-commise, mais TTL non ecoule
        advanceUntilIdle()

        verify(exactly = 1) { repository.search("belva", any(), any(), any()) }
        assertThat(vm.state.value.results.users).hasSize(1)
        assertThat(vm.state.value.hasSearched).isTrue()
        assertThat(vm.state.value.isSearching).isFalse()
    }

    // Une entree du cache expire au TTL : la MEME requete repart alors en reseau.
    @Test
    fun `a query re-searched after the TTL expires hits the network again`() = runTest(dispatcher) {
        stubSearch(GlobalSearchResults(
            users = listOf(UserSearchResult(id = "u1", username = "belva")),
        ))
        val vm = viewModel()
        clockNow = 0L
        vm.setQuery("belva")
        advanceUntilIdle()

        vm.setQuery("b")
        advanceUntilIdle()
        clockNow = SearchQueryCache.DEFAULT_TTL_MILLIS // pile au TTL : perime
        vm.setQuery("belva")
        advanceUntilIdle()

        verify(exactly = 2) { repository.search("belva", any(), any(), any()) }
    }

    // invalidateSearchCache vide le cache : la prochaine recherche identique
    // repart en reseau (le chemin qu'empruntent les evenements socket).
    @Test
    fun `invalidateSearchCache forces the next identical query back to the network`() = runTest(dispatcher) {
        stubSearch(GlobalSearchResults())
        val vm = viewModel()
        vm.setQuery("belva")
        advanceUntilIdle()

        vm.setQuery("b")
        advanceUntilIdle()
        vm.invalidateSearchCache()
        vm.setQuery("belva")
        advanceUntilIdle()

        verify(exactly = 2) { repository.search("belva", any(), any(), any()) }
    }

    // Un `conversation:updated` recu par socket invalide le cache : les resultats
    // gardes pourraient etre perimes (parite iOS `setupSocketInvalidation`).
    @Test
    fun `a conversation-updated socket event invalidates the query cache`() = runTest(dispatcher) {
        stubSearch(GlobalSearchResults())
        val vm = viewModel()
        vm.setQuery("belva")
        advanceUntilIdle()

        conversationUpdated.emit(ConversationUpdatedSocketEvent(conversationId = "c1"))
        advanceUntilIdle()

        vm.setQuery("b")
        advanceUntilIdle()
        vm.setQuery("belva")
        advanceUntilIdle()

        verify(exactly = 2) { repository.search("belva", any(), any(), any()) }
    }

    // Les resultats affiches portent la requete qui les a PRODUITS — pas la
    // saisie en cours. Une recherche reussie ancre `resultsQuery` sur son terme
    // (parite iOS `resultsQuery`, alimentee juste apres l'affectation des
    // resultats). C'est cette requete, et non `query`, contre laquelle une ligne
    // de resultat surligne son texte.
    @Test
    fun `a successful search anchors the results query on its term`() = runTest(dispatcher) {
        stubSearch(GlobalSearchResults(
            users = listOf(UserSearchResult(id = "u1", username = "belva")),
        ))
        val vm = viewModel()
        vm.setQuery("belva")
        advanceUntilIdle()
        assertThat(vm.state.value.resultsQuery).isEqualTo("belva")
    }

    // Le cache-hit ressert un resultat ET la requete qui l'a produit : sans quoi
    // une ligne resservie depuis le cache surlignerait contre une requete vide.
    @Test
    fun `a cached hit reports the cached term as the results query`() = runTest(dispatcher) {
        stubSearch(GlobalSearchResults(
            users = listOf(UserSearchResult(id = "u1", username = "belva")),
        ))
        val vm = viewModel()
        vm.setQuery("belva")
        advanceUntilIdle()

        vm.setQuery("b") // sous le seuil : vide
        advanceUntilIdle()
        assertThat(vm.state.value.resultsQuery).isEmpty()

        vm.setQuery("belva") // cache-hit, TTL non ecoule
        advanceUntilIdle()
        verify(exactly = 1) { repository.search("belva", any(), any(), any()) }
        assertThat(vm.state.value.resultsQuery).isEqualTo("belva")
    }

    // Revenir sous le seuil remet `resultsQuery` a vide en meme temps que les
    // resultats (parite iOS `clearResults`) : plus rien n'est affiche, donc plus
    // rien a surligner.
    @Test
    fun `shrinking below the threshold resets the results query`() = runTest(dispatcher) {
        stubSearch(GlobalSearchResults(
            users = listOf(UserSearchResult(id = "u1", username = "belva")),
        ))
        val vm = viewModel()
        vm.setQuery("belva")
        advanceUntilIdle()
        assertThat(vm.state.value.resultsQuery).isEqualTo("belva")

        vm.setQuery("b")
        advanceUntilIdle()
        assertThat(vm.state.value.resultsQuery).isEmpty()
    }

    // Le coeur du correctif : pendant que l'utilisateur tape une NOUVELLE requete,
    // les anciens resultats restent affiches et `resultsQuery` reste sur l'ancien
    // terme jusqu'a ce que la nouvelle recherche aboutisse — la saisie vive
    // (`query`) a deja change. Surligner contre `query` produirait un surlignage
    // decale (contre un terme qui n'a pas produit ces lignes).
    @Test
    fun `the results query stays on the shown results while a newer query is being typed`() = runTest(dispatcher) {
        stubSearch(GlobalSearchResults(
            users = listOf(UserSearchResult(id = "u1", username = "belva")),
        ))
        val vm = viewModel()
        vm.setQuery("belva")
        advanceUntilIdle()
        assertThat(vm.state.value.resultsQuery).isEqualTo("belva")

        vm.setQuery("belva rocks")
        advanceTimeBy(100) // debounce (300 ms) non ecoule : pas de nouvelle recherche

        assertThat(vm.state.value.query).isEqualTo("belva rocks")
        assertThat(vm.state.value.resultsQuery).isEqualTo("belva")
        assertThat(vm.state.value.results.users).hasSize(1)
    }

    // Un `conversation:deleted` recu par socket invalide aussi le cache.
    @Test
    fun `a conversation-deleted socket event invalidates the query cache`() = runTest(dispatcher) {
        stubSearch(GlobalSearchResults())
        val vm = viewModel()
        vm.setQuery("belva")
        advanceUntilIdle()

        conversationDeleted.emit(ConversationDeletedSocketEvent(conversationId = "c1"))
        advanceUntilIdle()

        vm.setQuery("b")
        advanceUntilIdle()
        vm.setQuery("belva")
        advanceUntilIdle()

        verify(exactly = 2) { repository.search("belva", any(), any(), any()) }
    }

    // #11615 — l'interlocuteur d'un direct s'elit contre le LECTEUR : la recherche
    // le lit de la session, sinon une ligne de resultat ne pourrait pas nommer l'autre.
    @Test
    fun `the signed-in reader is exposed so a direct hit can be named after its peer`() = runTest(dispatcher) {
        val vm = viewModel()
        advanceUntilIdle()
        assertThat(vm.state.value.currentUserId).isNull()

        signedInUser.value = MeeshyUser(id = "me", username = "me")
        advanceUntilIdle()

        assertThat(vm.state.value.currentUserId).isEqualTo("me")
    }

    private fun conversationPane(vararg ids: String, failed: Boolean = false) = SearchPane(
        items = ids.map { ApiConversation(id = it) },
        failure = SearchPaneFailure.Unreachable.takeIf { failed },
    )

    // Local d'abord : le premier instantane s'affiche pendant que le reseau repond encore,
    // sans spinner qui le remplace (etat cachedStale).
    @Test
    fun `local results show at once and the network is revalidated discreetly`() = runTest(dispatcher) {
        val gate = CompletableDeferred<Unit>()
        every { repository.search(any(), any(), any(), any()) } returns flow {
            emit(GlobalSearchSnapshot(conversations = conversationPane("local"), remoteSettled = false))
            gate.await()
            emit(GlobalSearchSnapshot(conversations = conversationPane("net", "local")))
        }
        val vm = viewModel()
        vm.setQuery("belva")
        advanceUntilIdle()

        assertThat(vm.state.value.results.conversations.map { it.id }).containsExactly("local")
        assertThat(vm.state.value.loadState).isEqualTo(SearchLoadState.CACHED_STALE)
        assertThat(vm.state.value.isSearching).isFalse()

        gate.complete(Unit)
        advanceUntilIdle()
        assertThat(vm.state.value.results.conversations.map { it.id }).containsExactly("net", "local").inOrder()
        assertThat(vm.state.value.loadState).isEqualTo(SearchLoadState.LOADED)
    }

    // Froid et sans resultat local : seul cas ou le spinner est permis.
    @Test
    fun `a cold search with nothing local is loading until the network answers`() = runTest(dispatcher) {
        val gate = CompletableDeferred<Unit>()
        every { repository.search(any(), any(), any(), any()) } returns flow {
            emit(GlobalSearchSnapshot(remoteSettled = false))
            gate.await()
            emit(GlobalSearchSnapshot())
        }
        val vm = viewModel()
        vm.setQuery("belva")
        advanceUntilIdle()
        assertThat(vm.state.value.loadState).isEqualTo(SearchLoadState.LOADING)
        assertThat(vm.state.value.isCurrentTabEmpty).isFalse()

        gate.complete(Unit)
        advanceUntilIdle()
        assertThat(vm.state.value.loadState).isEqualTo(SearchLoadState.LOADED)
        assertThat(vm.state.value.isCurrentTabEmpty).isTrue()
    }

    @Test
    fun `offline the local answer is final and is not an error`() = runTest(dispatcher) {
        stubSnapshots(GlobalSearchSnapshot(conversations = conversationPane("local"), offline = true))
        val vm = viewModel()
        vm.setQuery("belva")
        advanceUntilIdle()

        assertThat(vm.state.value.loadState).isEqualTo(SearchLoadState.OFFLINE)
        assertThat(vm.state.value.results.conversations).hasSize(1)
        assertThat(vm.state.value.failure).isNull()
    }

    // Un volet en panne n'est JAMAIS « aucun resultat ».
    @Test
    fun `a failed pane with nothing to show is an error and never an empty result`() = runTest(dispatcher) {
        stubSnapshots(GlobalSearchSnapshot(conversations = conversationPane(failed = true)))
        val vm = viewModel()
        vm.setQuery("belva")
        advanceUntilIdle()

        val state = vm.state.value
        assertThat(state.loadState).isEqualTo(SearchLoadState.ERROR)
        assertThat(state.failure).isEqualTo(SearchPaneKind.CONVERSATIONS)
        assertThat(state.isCurrentTabEmpty).isFalse()
        assertThat(state.isFailed(GlobalSearchTab.CONVERSATIONS)).isTrue()
    }

    @Test
    fun `a failed pane next to served results keeps the list and names the failure`() = runTest(dispatcher) {
        stubSnapshots(
            GlobalSearchSnapshot(
                conversations = conversationPane("c1"),
                users = SearchPane(failure = SearchPaneFailure.Unreachable),
            ),
        )
        val vm = viewModel()
        vm.setQuery("belva")
        advanceUntilIdle()

        assertThat(vm.state.value.loadState).isEqualTo(SearchLoadState.LOADED)
        assertThat(vm.state.value.failure).isEqualTo(SearchPaneKind.PEOPLE)
        assertThat(vm.state.value.results.conversations).hasSize(1)
    }

    // On ne memorise pas le vide d'une panne : la requete identique repart en reseau.
    @Test
    fun `a failed search is never served from the cache`() = runTest(dispatcher) {
        stubSnapshots(GlobalSearchSnapshot(conversations = conversationPane(failed = true)))
        val vm = viewModel()
        vm.setQuery("belva")
        advanceUntilIdle()
        vm.setQuery("b")
        advanceUntilIdle()
        vm.setQuery("belva")
        advanceUntilIdle()

        verify(exactly = 2) { repository.search("belva", any(), any(), any()) }
    }

    @Test
    fun `retryLastSearch replays the last launched query at once`() = runTest(dispatcher) {
        stubSnapshots(GlobalSearchSnapshot(conversations = conversationPane(failed = true)))
        val vm = viewModel()
        vm.setQuery("belva")
        advanceUntilIdle()

        stubSearch(GlobalSearchResults(conversations = listOf(ApiConversation(id = "c1"))))
        vm.retryLastSearch()
        advanceUntilIdle()

        verify(exactly = 2) { repository.search("belva", any(), any(), any()) }
        assertThat(vm.state.value.loadState).isEqualTo(SearchLoadState.LOADED)
        assertThat(vm.state.value.results.conversations).hasSize(1)
    }

    @Test
    fun `retryLastSearch before any search does nothing`() = runTest(dispatcher) {
        val vm = viewModel()
        vm.retryLastSearch()
        advanceUntilIdle()

        verify(exactly = 0) { repository.search(any(), any(), any(), any()) }
    }

    @Test
    fun `a conversation-closed socket event invalidates the query cache`() = runTest(dispatcher) {
        stubSearch(GlobalSearchResults())
        val vm = viewModel()
        vm.setQuery("belva")
        advanceUntilIdle()

        conversationClosed.emit(ConversationClosedSocketEvent(conversationId = "c1", closedBy = "u1"))
        advanceUntilIdle()
        vm.setQuery("b")
        advanceUntilIdle()
        vm.setQuery("belva")
        advanceUntilIdle()

        verify(exactly = 2) { repository.search("belva", any(), any(), any()) }
    }

    // La frappe suivante annule la recherche en vol : ses resultats tardifs ne reviennent pas.
    @Test
    fun `a newer query cancels the search still in flight`() = runTest(dispatcher) {
        val gate = CompletableDeferred<Unit>()
        every { repository.search("slow", any(), any(), any()) } returns flow {
            gate.await()
            emit(GlobalSearchSnapshot(conversations = conversationPane("stale")))
        }
        every { repository.search("fast", any(), any(), any()) } returns
            flowOf(GlobalSearchSnapshot(conversations = conversationPane("fresh")))
        val vm = viewModel()
        vm.setQuery("slow")
        advanceTimeBy(DEBOUNCE_PLUS)
        vm.setQuery("fast")
        advanceUntilIdle()
        gate.complete(Unit)
        advanceUntilIdle()

        assertThat(vm.state.value.results.conversations.map { it.id }).containsExactly("fresh")
        assertThat(vm.state.value.resultsQuery).isEqualTo("fast")
    }

    private companion object {
        const val DEBOUNCE_PLUS = 350L
    }
}
