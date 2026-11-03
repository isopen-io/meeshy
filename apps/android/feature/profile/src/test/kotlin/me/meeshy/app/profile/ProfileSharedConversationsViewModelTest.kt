package me.meeshy.app.profile

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import java.io.IOException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiParticipant
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.session.SessionRepository
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ProfileSharedConversationsViewModelTest {

    @Before
    fun setUp() {
        Dispatchers.setMain(UnconfinedTestDispatcher())
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private val repository: ConversationRepository = mockk()
    private val session: SessionRepository = mockk(relaxed = true) { every { currentUserId } returns "me" }

    private fun viewModel() = ProfileSharedConversationsViewModel(repository, session)

    private val group = ApiConversation(id = "g1", type = "group", title = "Equipe", avatar = "/g.webp")
    private val direct = ApiConversation(
        id = "d1",
        type = "direct",
        participants = listOf(
            ApiParticipant(id = "p1", userId = "me", displayName = "Moi"),
            ApiParticipant(id = "p2", userId = "u2", displayName = "Ada", avatar = "/ada.webp"),
        ),
    )

    @Test
    fun `l'onglet charge les conversations en commun avec la personne de la fiche`() = runTest {
        coEvery { repository.listSharedWith("u2", any()) } returns NetworkResult.Success(listOf(group, direct))
        val vm = viewModel()

        vm.load("u2")

        val rows = vm.state.value.rows
        assertThat(vm.state.value.userId).isEqualTo("u2")
        assertThat(rows.map { it.id }).containsExactly("g1", "d1").inOrder()
        assertThat(rows[0].title).isEqualTo("Equipe")
        assertThat(rows[0].avatarUrl).isEqualTo("/g.webp")
        assertThat(rows[1].title).isEqualTo("Ada")
        assertThat(rows[1].avatarUrl).isEqualTo("/ada.webp")
        assertThat(rows[0].accentHex).isNotEmpty()
    }

    @Test
    fun `le chargement est independant, l'etat est vide tant que rien n'est arrive`() = runTest {
        val gate = CompletableDeferred<NetworkResult<List<ApiConversation>>>()
        coEvery { repository.listSharedWith("u2", any()) } coAnswers { gate.await() }
        val vm = viewModel()

        vm.load("u2")
        assertThat(vm.state.value.rows).isEmpty()

        gate.complete(NetworkResult.Success(listOf(group)))
        assertThat(vm.state.value.rows.map { it.id }).containsExactly("g1")
    }

    @Test
    fun `un echec est silencieux et garde la liste precedente`() = runTest {
        coEvery { repository.listSharedWith("u2", any()) } returnsMany listOf(
            NetworkResult.Success(listOf(group)),
            NetworkResult.Failure(ApiError("boom")),
        )
        val vm = viewModel()
        vm.load("u2")

        vm.load("u2", force = true)

        assertThat(vm.state.value.rows.map { it.id }).containsExactly("g1")
        coVerify(exactly = 2) { repository.listSharedWith("u2", any()) }
    }

    @Test
    fun `un echec au premier chargement laisse la liste vide et se rejoue a la reouverture`() = runTest {
        coEvery { repository.listSharedWith("u2", any()) } returnsMany listOf(
            NetworkResult.Failure(ApiError("boom")),
            NetworkResult.Success(listOf(group)),
        )
        val vm = viewModel()

        vm.load("u2")
        assertThat(vm.state.value.rows).isEmpty()
        vm.load("u2")

        assertThat(vm.state.value.rows.map { it.id }).containsExactly("g1")
    }

    @Test
    fun `une exception reseau n'abat pas la fiche`() = runTest {
        coEvery { repository.listSharedWith("u2", any()) } throws IOException("offline")
        val vm = viewModel()

        vm.load("u2")

        assertThat(vm.state.value.rows).isEmpty()
    }

    @Test
    fun `une fois charge, rouvrir le meme onglet ne recharge pas`() = runTest {
        coEvery { repository.listSharedWith("u2", any()) } returns NetworkResult.Success(listOf(group))
        val vm = viewModel()

        vm.load("u2")
        vm.load("u2")

        coVerify(exactly = 1) { repository.listSharedWith("u2", any()) }
    }

    @Test
    fun `la liste d'une autre personne n'est jamais montree`() = runTest {
        coEvery { repository.listSharedWith("u2", any()) } returns NetworkResult.Success(listOf(group))
        coEvery { repository.listSharedWith("u3", any()) } returns NetworkResult.Failure(ApiError("boom"))
        val vm = viewModel()
        vm.load("u2")

        vm.load("u3")

        assertThat(vm.state.value.userId).isEqualTo("u3")
        assertThat(vm.state.value.rows).isEmpty()
    }

    // MARK: ce que l'onglet peint

    @Test
    fun `vide, on peut ecrire, la pilule Message accompagne le texte`() {
        assertThat(ProfileConversationsView.of(hasRows = false, interactionsDisabled = false, canMessage = true))
            .isEqualTo(ProfileConversationsView.Empty(interactionsDisabled = false, showsMessagePill = true))
    }

    @Test
    fun `vide et bloque, interdit sans pilule`() {
        assertThat(ProfileConversationsView.of(hasRows = false, interactionsDisabled = true, canMessage = true))
            .isEqualTo(ProfileConversationsView.Empty(interactionsDisabled = true, showsMessagePill = false))
    }

    @Test
    fun `vide pour moi-meme ou un visiteur anonyme, aucune pilule`() {
        assertThat(ProfileConversationsView.of(hasRows = false, interactionsDisabled = false, canMessage = false))
            .isEqualTo(ProfileConversationsView.Empty(interactionsDisabled = false, showsMessagePill = false))
    }

    @Test
    fun `avec des conversations, le bouton Message est en tete sauf pour moi, et estompe si bloque`() {
        assertThat(ProfileConversationsView.of(hasRows = true, interactionsDisabled = false, canMessage = true))
            .isEqualTo(ProfileConversationsView.Listing(interactionsDisabled = false, showsMessageButton = true))
        assertThat(ProfileConversationsView.of(hasRows = true, interactionsDisabled = true, canMessage = true))
            .isEqualTo(ProfileConversationsView.Listing(interactionsDisabled = true, showsMessageButton = true))
        assertThat(ProfileConversationsView.of(hasRows = true, interactionsDisabled = false, canMessage = false))
            .isEqualTo(ProfileConversationsView.Listing(interactionsDisabled = false, showsMessageButton = false))
    }
}
