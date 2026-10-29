package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.coVerifyOrder
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.model.ApiAuthor
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.MyStoriesTab
import me.meeshy.sdk.model.MyStoryDeleteConfirmation
import me.meeshy.sdk.model.PostEditDraft
import me.meeshy.sdk.model.StoryVisibility
import me.meeshy.sdk.model.SocketStoryDeletedData
import me.meeshy.sdk.friend.BlockCache
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.post.PostRepository
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.session.AccountTicket
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.SocialSocketManager
import me.meeshy.sdk.story.StoryPublishQueue
import me.meeshy.sdk.story.StoryRepository
import org.junit.After
import org.junit.Before
import org.junit.Test
import java.time.Instant

@OptIn(ExperimentalCoroutinesApi::class)
class MyStoriesViewModelTest {

    private val dispatcher = StandardTestDispatcher()
    private val nowMillis = Instant.parse("2026-10-22T12:00:00Z").toEpochMilli()
    private val deletedFlow = MutableSharedFlow<SocketStoryDeletedData>(extraBufferCapacity = 8)

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun post(id: String, createdAt: String, expiresAt: String?, views: Int = 0) = ApiPost(
        id = id,
        type = "STORY",
        createdAt = createdAt,
        expiresAt = expiresAt,
        viewCount = views,
        author = ApiAuthor(id = "me", username = "me"),
    )

    private val activeA = post("a", "2026-10-22T10:00:00Z", "2026-10-23T10:00:00Z", views = 4)
    private val activeB = post("b", "2026-10-22T09:00:00Z", "2026-10-23T09:00:00Z")
    private val expired = post("old", "2026-10-01T09:00:00Z", "2026-10-02T09:00:00Z")

    private fun failure() = NetworkResult.Failure(ApiError(message = "boom", code = "HTTP_500"))

    private fun repository(
        stream: List<ApiPost> = listOf(activeA, activeB),
        drained: NetworkResult<List<ApiPost>> = NetworkResult.Success(listOf(activeA, activeB, expired)),
        cached: List<ApiPost>? = null,
    ): StoryRepository = mockk<StoryRepository>(relaxed = true).also {
        every { it.storiesStream(any(), any()) } returns flowOf(CacheResult.Fresh(stream, 0L))
        every { it.publishQueue() } returns flowOf(StoryPublishQueue(emptyList(), emptyList()))
        coEvery { it.cachedMyStories() } returns cached
        coEvery { it.drainMyStories(any(), any()) } returns drained
        coEvery { it.delete(any()) } returns NetworkResult.Success(Unit)
        stream.forEach { story -> coEvery { postRepo.getPost(story.id) } returns NetworkResult.Success(story) }
    }

    private val postRepo: PostRepository = mockk<PostRepository>(relaxed = true).also {
        coEvery { it.update(any(), any<PostEditDraft>()) } returns NetworkResult.Success(ApiPost(id = "a"))
    }
    private val blocks = BlockCache()

    private fun viewModel(repo: StoryRepository): MyStoriesViewModel {
        val session = mockk<SessionRepository>(relaxed = true).also { every { it.currentUserId } returns "me" }
        val socket = mockk<SocialSocketManager>(relaxed = true).also { every { it.storyDeleted } returns deletedFlow }
        return MyStoriesViewModel(repo, postRepo, session, socket, blocks) { nowMillis }
    }

    @Test
    fun `les stories actives et expirees se classent d'elles-memes et l'archive ouvre un onglet`() = runTest(dispatcher) {
        val vm = viewModel(repository())
        advanceUntilIdle()

        val state = vm.state.value
        assertThat(state.active.map { it.id }).containsExactly("a", "b").inOrder()
        assertThat(state.archived.map { it.id }).containsExactly("old")
        assertThat(state.visibleTabs).contains(MyStoriesTab.ARCHIVE)
        assertThat(state.tab).isEqualTo(MyStoriesTab.PUBLISHED)
        assertThat(state.active.first().viewCount).isEqualTo(4)
        assertThat(state.showSkeleton).isFalse()
    }

    @Test
    fun `sans story active ni travail l'onglet d'ouverture est Brouillons seulement s'il y a des brouillons`() = runTest(dispatcher) {
        val vm = viewModel(repository(stream = emptyList(), drained = NetworkResult.Success(listOf(expired))))
        advanceUntilIdle()

        assertThat(vm.state.value.tab).isEqualTo(MyStoriesTab.PUBLISHED)
        assertThat(vm.state.value.archived.map { it.id }).containsExactly("old")
    }

    @Test
    fun `l'archive en cache peint tout de suite et une panne reseau la garde`() = runTest(dispatcher) {
        val vm = viewModel(
            repository(stream = emptyList(), drained = failure(), cached = listOf(expired)),
        )
        advanceUntilIdle()

        assertThat(vm.state.value.archived.map { it.id }).containsExactly("old")
        assertThat(vm.state.value.showSkeleton).isFalse()
    }

    @Test
    fun `la selection est filtree contre les stories affichees`() = runTest(dispatcher) {
        val vm = viewModel(repository())
        advanceUntilIdle()
        vm.onEvent(MyStoriesUiEvent.ToggleSelecting)
        vm.onEvent(MyStoriesUiEvent.ToggleSelected("a"))
        vm.onEvent(MyStoriesUiEvent.ToggleSelected("b"))
        assertThat(vm.state.value.selectedIds).containsExactly("a", "b")

        deletedFlow.tryEmit(SocketStoryDeletedData(storyId = "b"))
        advanceUntilIdle()

        assertThat(vm.state.value.selectedIds).containsExactly("a")
    }

    @Test
    fun `quitter le mode selection vide la selection`() = runTest(dispatcher) {
        val vm = viewModel(repository())
        advanceUntilIdle()
        vm.onEvent(MyStoriesUiEvent.ToggleSelecting)
        vm.onEvent(MyStoriesUiEvent.ToggleSelected("a"))
        vm.onEvent(MyStoriesUiEvent.ToggleSelecting)

        assertThat(vm.state.value.isSelecting).isFalse()
        assertThat(vm.state.value.selectedIds).isEmpty()
    }

    @Test
    fun `supprimer une story demande confirmation puis la retire`() = runTest(dispatcher) {
        val repo = repository()
        val vm = viewModel(repo)
        advanceUntilIdle()

        vm.onEvent(MyStoriesUiEvent.RequestDelete("a"))
        assertThat(vm.state.value.pendingDelete?.target).isEqualTo(MyStoryDeleteConfirmation.Target.PUBLISHED_STORY)
        coVerify(exactly = 0) { repo.delete(any()) }

        vm.onEvent(MyStoriesUiEvent.ConfirmDelete)
        advanceUntilIdle()

        coVerify { repo.delete("a") }
        assertThat(vm.state.value.active.map { it.id }).containsExactly("b")
        assertThat(vm.state.value.pendingDelete).isNull()
    }

    @Test
    fun `une suppression refusee par le serveur remet la story en place`() = runTest(dispatcher) {
        val repo = repository()
        coEvery { repo.delete("a") } returns failure()
        val vm = viewModel(repo)
        advanceUntilIdle()

        vm.onEvent(MyStoriesUiEvent.RequestDelete("a"))
        vm.onEvent(MyStoriesUiEvent.ConfirmDelete)
        advanceUntilIdle()

        assertThat(vm.state.value.active.map { it.id }).containsExactly("a", "b").inOrder()
    }

    @Test
    fun `annuler la confirmation ne supprime rien`() = runTest(dispatcher) {
        val repo = repository()
        val vm = viewModel(repo)
        advanceUntilIdle()

        vm.onEvent(MyStoriesUiEvent.RequestDelete("a"))
        vm.onEvent(MyStoriesUiEvent.DismissDelete)
        vm.onEvent(MyStoriesUiEvent.ConfirmDelete)
        advanceUntilIdle()

        coVerify(exactly = 0) { repo.delete(any()) }
        assertThat(vm.state.value.active).hasSize(2)
    }

    @Test
    fun `la suppression en masse a une alerte dediee et retire le lot`() = runTest(dispatcher) {
        val repo = repository()
        val vm = viewModel(repo)
        advanceUntilIdle()
        vm.onEvent(MyStoriesUiEvent.ToggleSelecting)
        vm.onEvent(MyStoriesUiEvent.ToggleSelected("a"))
        vm.onEvent(MyStoriesUiEvent.ToggleSelected("old"))

        vm.onEvent(MyStoriesUiEvent.RequestBulkDelete)
        assertThat(vm.state.value.pendingDelete?.target).isEqualTo(MyStoryDeleteConfirmation.Target.BULK_SELECTION)
        vm.onEvent(MyStoriesUiEvent.ConfirmDelete)
        advanceUntilIdle()

        coVerify { repo.delete("a") }
        coVerify { repo.delete("old") }
        assertThat(vm.state.value.active.map { it.id }).containsExactly("b")
        assertThat(vm.state.value.archived).isEmpty()
        assertThat(vm.state.value.selectedIds).isEmpty()
        assertThat(vm.state.value.isSelecting).isFalse()
        assertThat(vm.state.value.tab).isEqualTo(MyStoriesTab.PUBLISHED)
    }

    @Test
    fun `en masse un echec laisse la story selectionnee en place et le compte est remonte`() = runTest(dispatcher) {
        val repo = repository()
        coEvery { repo.delete("b") } returns failure()
        val vm = viewModel(repo)
        advanceUntilIdle()
        vm.onEvent(MyStoriesUiEvent.ToggleSelecting)
        vm.onEvent(MyStoriesUiEvent.ToggleSelected("a"))
        vm.onEvent(MyStoriesUiEvent.ToggleSelected("b"))
        vm.onEvent(MyStoriesUiEvent.RequestBulkDelete)
        vm.onEvent(MyStoriesUiEvent.ConfirmDelete)
        advanceUntilIdle()

        assertThat(vm.state.value.active.map { it.id }).containsExactly("b")
    }

    private fun republish(vm: MyStoriesViewModel, id: String) {
        vm.onEvent(MyStoriesUiEvent.RequestRepublish(id))
        vm.onEvent(MyStoriesUiEvent.ConfirmRepublish)
    }

    @Test
    fun `republier remplace la story par la version republiee`() = runTest(dispatcher) {
        val repo = repository()
        val republished = activeA.copy(createdAt = "2026-10-22T11:59:00Z", viewCount = 0)
        coEvery { repo.republish("a") } returns NetworkResult.Success(republished)
        val vm = viewModel(repo)
        advanceUntilIdle()

        republish(vm, "a")
        advanceUntilIdle()

        assertThat(vm.state.value.active.first().id).isEqualTo("a")
        assertThat(vm.state.value.active.first().viewCount).isEqualTo(0)
        assertThat(vm.state.value.isRepublishing).isFalse()
    }

    private val ticketOfA = AccountTicket(ownerId = "me", generation = 1L, session = 1L)
    private val ticketOfB = AccountTicket(ownerId = "B", generation = 2L, session = 3L)

    /** #13560 : le compte courant bascule de A vers B pendant la requête — ce que rend [StoryRepository.ticket] suit. */
    private fun switchingAccount(repo: StoryRepository): () -> Unit {
        var current = ticketOfA
        coEvery { repo.ticket() } answers { current }
        return { current = ticketOfB }
    }

    @Test
    fun `une suppression repondue apres le changement de compte ecrit l'archive sous le ticket du geste`() = runTest(dispatcher) {
        val repo = repository()
        val switchToB = switchingAccount(repo)
        coEvery { repo.delete("a") } coAnswers {
            switchToB()
            NetworkResult.Success(Unit)
        }
        val vm = viewModel(repo)
        advanceUntilIdle()

        vm.onEvent(MyStoriesUiEvent.RequestDelete("a"))
        vm.onEvent(MyStoriesUiEvent.ConfirmDelete)
        advanceUntilIdle()

        coVerify { repo.removeCachedStory("a", ticketOfA) }
        coVerify { repo.persistMyStories(any(), ticketOfA) }
        coVerify(exactly = 0) { repo.persistMyStories(any(), ticketOfB) }
    }

    @Test
    fun `une republication repondue apres le changement de compte ecrit l'archive sous le ticket du geste`() = runTest(dispatcher) {
        val repo = repository()
        val switchToB = switchingAccount(repo)
        coEvery { repo.republish("a") } coAnswers {
            switchToB()
            NetworkResult.Success(activeA.copy(viewCount = 0))
        }
        val vm = viewModel(repo)
        advanceUntilIdle()

        republish(vm, "a")
        advanceUntilIdle()

        coVerify { repo.persistMyStories(any(), ticketOfA) }
        coVerify(exactly = 0) { repo.persistMyStories(any(), ticketOfB) }
    }

    @Test
    fun `republier redemande l'audience precedente sans rien envoyer avant la confirmation`() = runTest(dispatcher) {
        val friends = activeA.copy(visibility = "FRIENDS")
        val repo = repository(stream = listOf(friends))
        val vm = viewModel(repo)
        advanceUntilIdle()

        vm.onEvent(MyStoriesUiEvent.RequestRepublish("a"))

        val pending = vm.state.value.pendingRepublish!!
        assertThat(pending.choice.visibility).isEqualTo(StoryVisibility.FRIENDS)
        assertThat(pending.choice.userIds).isEmpty()
        coVerify(exactly = 0) { repo.republish(any()) }
    }

    @Test
    fun `une audience inconnue est proposee en PRIVATE jamais elargie`() = runTest(dispatcher) {
        val vm = viewModel(repository())
        advanceUntilIdle()

        vm.onEvent(MyStoriesUiEvent.RequestRepublish("a"))

        assertThat(vm.state.value.pendingRepublish!!.choice.visibility).isEqualTo(StoryVisibility.PRIVATE)
    }

    @Test
    fun `annuler la feuille ne republie rien et n'ecrit aucune audience`() = runTest(dispatcher) {
        val repo = repository()
        val vm = viewModel(repo)
        advanceUntilIdle()

        vm.onEvent(MyStoriesUiEvent.RequestRepublish("a"))
        vm.onEvent(MyStoriesUiEvent.DismissRepublish)
        advanceUntilIdle()

        assertThat(vm.state.value.pendingRepublish).isNull()
        coVerify(exactly = 0) { repo.republish(any()) }
        coVerify(exactly = 0) { postRepo.update(any(), any<PostEditDraft>()) }
    }

    @Test
    fun `confirmer sans changer l'audience republie sans ecrire l'audience`() = runTest(dispatcher) {
        val repo = repository(stream = listOf(activeA.copy(visibility = "FRIENDS")))
        coEvery { repo.republish("a") } returns NetworkResult.Success(activeA.copy(visibility = "FRIENDS"))
        val vm = viewModel(repo)
        advanceUntilIdle()

        republish(vm, "a")
        advanceUntilIdle()

        coVerify(exactly = 1) { repo.republish("a") }
        coVerify(exactly = 0) { postRepo.update(any(), any<PostEditDraft>()) }
    }

    @Test
    fun `un autre choix ecrit l'audience, liste vide comprise, puis republie`() = runTest(dispatcher) {
        val repo = repository(stream = listOf(activeA.copy(visibility = "ONLY", visibilityUserIds = listOf("x"))))
        coEvery { repo.republish("a") } returns NetworkResult.Success(activeA.copy(visibility = "FRIENDS"))
        coEvery { postRepo.update("a", any<PostEditDraft>()) } returns NetworkResult.Success(activeA)
        val vm = viewModel(repo)
        advanceUntilIdle()

        vm.onEvent(MyStoriesUiEvent.RequestRepublish("a"))
        vm.onEvent(MyStoriesUiEvent.ChooseRepublishVisibility(StoryVisibility.FRIENDS))
        vm.onEvent(MyStoriesUiEvent.ConfirmRepublish)
        advanceUntilIdle()

        coVerifyOrder {
            postRepo.update("a", PostEditDraft(visibility = "FRIENDS", visibilityUserIds = emptyList()))
            repo.republish("a")
        }
    }

    @Test
    fun `ONLY sans personne ne part pas`() = runTest(dispatcher) {
        val repo = repository()
        val vm = viewModel(repo)
        advanceUntilIdle()

        vm.onEvent(MyStoriesUiEvent.RequestRepublish("a"))
        vm.onEvent(MyStoriesUiEvent.ChooseRepublishVisibility(StoryVisibility.ONLY))
        vm.onEvent(MyStoriesUiEvent.ConfirmRepublish)
        advanceUntilIdle()

        assertThat(vm.state.value.pendingRepublish!!.canConfirm).isFalse()
        coVerify(exactly = 0) { repo.republish(any()) }
    }

    @Test
    fun `sous ONLY les bloques et soi sont purges de la liste choisie`() = runTest(dispatcher) {
        blocks.setBlocked("bad", true)
        val vm = viewModel(repository())
        advanceUntilIdle()

        vm.onEvent(MyStoriesUiEvent.RequestRepublish("a"))
        vm.onEvent(MyStoriesUiEvent.ChooseRepublishVisibility(StoryVisibility.ONLY))
        vm.onEvent(MyStoriesUiEvent.SetRepublishUserIds(listOf("ok", "bad", "me")))

        assertThat(vm.state.value.pendingRepublish!!.choice.userIds).containsExactly("ok")
    }

    @Test
    fun `une republication refusee rend l'audience precedente et le dit`() = runTest(dispatcher) {
        val repo = repository(stream = listOf(activeA.copy(visibility = "FRIENDS")))
        coEvery { repo.republish("a") } returns failure()
        coEvery { postRepo.update(any(), any<PostEditDraft>()) } returns NetworkResult.Success(activeA)
        val vm = viewModel(repo)
        advanceUntilIdle()

        vm.onEvent(MyStoriesUiEvent.RequestRepublish("a"))
        vm.onEvent(MyStoriesUiEvent.ChooseRepublishVisibility(StoryVisibility.PUBLIC))
        vm.onEvent(MyStoriesUiEvent.ConfirmRepublish)
        advanceUntilIdle()

        coVerify { postRepo.update("a", PostEditDraft(visibility = "FRIENDS", visibilityUserIds = emptyList())) }
        assertThat(vm.effects.first()).isEqualTo(MyStoriesUiEffect.RepublishFailed)
        assertThat(vm.state.value.isRepublishing).isFalse()
    }

    @Test
    fun `une audience refusee n'envoie pas la republication`() = runTest(dispatcher) {
        val repo = repository()
        coEvery { postRepo.update(any(), any<PostEditDraft>()) } returns failure()
        val vm = viewModel(repo)
        advanceUntilIdle()

        vm.onEvent(MyStoriesUiEvent.RequestRepublish("a"))
        vm.onEvent(MyStoriesUiEvent.ChooseRepublishVisibility(StoryVisibility.PUBLIC))
        vm.onEvent(MyStoriesUiEvent.ConfirmRepublish)
        advanceUntilIdle()

        coVerify(exactly = 0) { repo.republish(any()) }
    }

    @Test
    fun `une audience brute inconnue est ecrite en PRIVATE avant la republication meme sans toucher la feuille`() = runTest(dispatcher) {
        val repo = repository(stream = listOf(activeA.copy(visibility = "GALAXY")))
        coEvery { repo.republish("a") } returns NetworkResult.Success(activeA)
        coEvery { postRepo.update("a", any<PostEditDraft>()) } returns NetworkResult.Success(activeA)
        val vm = viewModel(repo)
        advanceUntilIdle()

        republish(vm, "a")
        advanceUntilIdle()

        coVerifyOrder {
            postRepo.update("a", PostEditDraft(visibility = "PRIVATE", visibilityUserIds = emptyList()))
            repo.republish("a")
        }
    }

    @Test
    fun `une liste brute aux ids invalides est reecrite nettoyee avant la republication`() = runTest(dispatcher) {
        blocks.setBlocked("bad", true)
        val repo = repository(stream = listOf(activeA.copy(visibility = "ONLY", visibilityUserIds = listOf("ok", "bad", "me"))))
        coEvery { repo.republish("a") } returns NetworkResult.Success(activeA)
        coEvery { postRepo.update("a", any<PostEditDraft>()) } returns NetworkResult.Success(activeA)
        val vm = viewModel(repo)
        advanceUntilIdle()

        republish(vm, "a")
        advanceUntilIdle()

        coVerifyOrder {
            postRepo.update("a", PostEditDraft(visibility = "ONLY", visibilityUserIds = listOf("ok")))
            repo.republish("a")
        }
    }

    @Test
    fun `un echec restaure les valeurs brutes du serveur`() = runTest(dispatcher) {
        val repo = repository(stream = listOf(activeA.copy(visibility = "ONLY", visibilityUserIds = listOf("ok", "bad"))))
        coEvery { repo.republish("a") } returns failure()
        coEvery { postRepo.update(any(), any<PostEditDraft>()) } returns NetworkResult.Success(activeA)
        val vm = viewModel(repo)
        advanceUntilIdle()

        vm.onEvent(MyStoriesUiEvent.RequestRepublish("a"))
        vm.onEvent(MyStoriesUiEvent.SetRepublishUserIds(listOf("ok")))
        vm.onEvent(MyStoriesUiEvent.ConfirmRepublish)
        advanceUntilIdle()

        coVerify { postRepo.update("a", PostEditDraft(visibility = "ONLY", visibilityUserIds = listOf("ok", "bad"))) }
    }

    @Test
    fun `une audience ecrite puis laissee par une restauration ratee n'est pas tenue pour inchangee au tour suivant`() = runTest(dispatcher) {
        val original = activeA.copy(visibility = "ONLY", visibilityUserIds = listOf("ok"))
        val repo = repository(stream = listOf(original))
        coEvery { repo.republish("a") } returns failure()
        val publicDraft = PostEditDraft(visibility = "PUBLIC", visibilityUserIds = emptyList())
        val onlyDraft = PostEditDraft(visibility = "ONLY", visibilityUserIds = listOf("ok"))
        coEvery { postRepo.update("a", publicDraft) } coAnswers {
            coEvery { postRepo.getPost("a") } returns NetworkResult.Success(original.copy(visibility = "PUBLIC", visibilityUserIds = emptyList()))
            NetworkResult.Success(activeA)
        }
        coEvery { postRepo.update("a", onlyDraft) } returns failure()
        val vm = viewModel(repo)
        advanceUntilIdle()

        vm.onEvent(MyStoriesUiEvent.RequestRepublish("a"))
        vm.onEvent(MyStoriesUiEvent.ChooseRepublishVisibility(StoryVisibility.PUBLIC))
        vm.onEvent(MyStoriesUiEvent.ConfirmRepublish)
        advanceUntilIdle()

        coEvery { postRepo.update("a", onlyDraft) } returns NetworkResult.Success(activeA)
        coEvery { repo.republish("a") } returns NetworkResult.Success(original)
        vm.onEvent(MyStoriesUiEvent.RequestRepublish("a"))
        assertThat(vm.state.value.pendingRepublish!!.choice).isEqualTo(
            me.meeshy.sdk.model.composer.StoryRepublishAudience.Choice(StoryVisibility.ONLY, listOf("ok")),
        )
        vm.onEvent(MyStoriesUiEvent.ConfirmRepublish)
        advanceUntilIdle()

        coVerifyOrder {
            postRepo.update("a", publicDraft)
            repo.republish("a")
            postRepo.update("a", onlyDraft)
            postRepo.update("a", onlyDraft)
            repo.republish("a")
        }
    }

    @Test
    fun `une audience changee ailleurs depuis le cache est reecrite telle que confirmee avant la republication`() = runTest(dispatcher) {
        val repo = repository(stream = listOf(activeA.copy(visibility = "FRIENDS")))
        coEvery { postRepo.getPost("a") } returns NetworkResult.Success(activeA.copy(visibility = "PUBLIC"))
        coEvery { repo.republish("a") } returns NetworkResult.Success(activeA)
        val vm = viewModel(repo)
        advanceUntilIdle()

        republish(vm, "a")
        advanceUntilIdle()

        coVerifyOrder {
            postRepo.update("a", PostEditDraft(visibility = "FRIENDS", visibilityUserIds = emptyList()))
            repo.republish("a")
        }
    }

    @Test
    fun `sans relecture du serveur l'audience confirmee est ecrite avant la republication`() = runTest(dispatcher) {
        val repo = repository(stream = listOf(activeA.copy(visibility = "FRIENDS")))
        coEvery { postRepo.getPost("a") } returns failure()
        coEvery { repo.republish("a") } returns NetworkResult.Success(activeA)
        val vm = viewModel(repo)
        advanceUntilIdle()

        republish(vm, "a")
        advanceUntilIdle()

        coVerifyOrder {
            postRepo.update("a", PostEditDraft(visibility = "FRIENDS", visibilityUserIds = emptyList()))
            repo.republish("a")
        }
    }

    @Test
    fun `une republication refusee restaure l'audience relue au serveur et non celle du cache`() = runTest(dispatcher) {
        val repo = repository(stream = listOf(activeA.copy(visibility = "FRIENDS")))
        coEvery { postRepo.getPost("a") } returns NetworkResult.Success(activeA.copy(visibility = "ONLY", visibilityUserIds = listOf("x")))
        coEvery { repo.republish("a") } returns failure()
        val vm = viewModel(repo)
        advanceUntilIdle()

        vm.onEvent(MyStoriesUiEvent.RequestRepublish("a"))
        vm.onEvent(MyStoriesUiEvent.ChooseRepublishVisibility(StoryVisibility.PUBLIC))
        vm.onEvent(MyStoriesUiEvent.ConfirmRepublish)
        advanceUntilIdle()

        coVerifyOrder {
            postRepo.update("a", PostEditDraft(visibility = "PUBLIC", visibilityUserIds = emptyList()))
            repo.republish("a")
            postRepo.update("a", PostEditDraft(visibility = "ONLY", visibilityUserIds = listOf("x")))
        }
    }
}
