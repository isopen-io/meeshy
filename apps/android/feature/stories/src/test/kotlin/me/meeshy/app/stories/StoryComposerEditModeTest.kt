package me.meeshy.app.stories

import androidx.work.WorkManager
import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.media.MediaBlobStore
import me.meeshy.sdk.media.MediaUploadQueue
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.story.InMemoryStoryComposerDraftStore
import me.meeshy.sdk.story.StoryDraftConfirmation
import me.meeshy.sdk.story.StoryRepository
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class StoryComposerEditModeTest {

    @Before
    fun setUp() = Dispatchers.setMain(UnconfinedTestDispatcher())

    @After
    fun tearDown() = Dispatchers.resetMain()

    private val repo: StoryRepository = mockk(relaxed = true)
    private val session: SessionRepository = mockk(relaxed = true)
    private val editor: StoryEditor = mockk()
    private val drafts = InMemoryStoryComposerDraftStore()
    private val opening = StoryEditFixtures.opening()

    private fun viewModel(): StoryComposerViewModel {
        every { session.currentUser } returns MutableStateFlow(MeeshyUser(id = "me", username = "me", systemLanguage = "fr"))
        return StoryComposerViewModel(
            repo, session, mockk(relaxed = true), mockk<MediaUploadQueue>(relaxed = true), mockk<WorkManager>(relaxed = true),
            drafts, mockk<MediaBlobStore>(relaxed = true), mockk<StoryDraftConfirmation>(relaxed = true),
        )
    }

    @Test
    fun `la story rouverte remplit le composeur de sa scene`() {
        val vm = viewModel()

        vm.onEditing(opening, editor)

        assertThat(vm.state.value.deck.selectedSlide.text).isEqualTo("Bonjour")
        assertThat(vm.state.value.deck.selectedSlide.elements.map { it.text }).containsExactly("Salut", "Bonne journée").inOrder()
        assertThat(vm.state.value.deck.selectedSlide.placedMedia).hasSize(1)
        assertThat(vm.state.value.canPublish).isTrue()
    }

    @Test
    fun `enregistrer appelle la mise a jour et non la creation, puis ferme le composeur`() = runTest {
        coEvery { editor.save(any(), any(), any()) } returns null
        val vm = viewModel()
        vm.onEditing(opening, editor)

        vm.published.test {
            vm.publish()
            awaitItem()
        }

        coVerify(exactly = 1) { editor.save(opening, any(), "fr") }
        coVerify(exactly = 0) { repo.enqueuePublish(any(), any()) }
    }

    @Test
    fun `un echec laisse le composeur ouvert avec toute la composition et l'erreur`() = runTest {
        coEvery { editor.save(any(), any(), any()) } returns StoryEditErrors.FAILED
        val vm = viewModel()
        vm.onEditing(opening, editor)

        vm.publish()

        val state = vm.state.value
        assertThat(state.isPublishing).isFalse()
        assertThat(state.errorMessage).isEqualTo(StoryEditErrors.FAILED)
        assertThat(state.deck.selectedSlide.text).isEqualTo("Bonjour")
        assertThat(state.canPublish).isTrue()
    }

    @Test
    fun `une exception du reseau est un echec, pas un plantage`() = runTest {
        coEvery { editor.save(any(), any(), any()) } throws IllegalStateException("boom")
        val vm = viewModel()
        vm.onEditing(opening, editor)

        vm.publish()

        assertThat(vm.state.value.errorMessage).isEqualTo(StoryEditErrors.FAILED)
    }

    @Test
    fun `tant que la story n'est pas arrivee rien ne part, jamais une story neuve`() = runTest {
        val vm = viewModel()
        assertThat(vm.onEditRequested()).isTrue()
        vm.onTextChange("une nouvelle story")

        vm.publish()

        coVerify(exactly = 0) { repo.enqueuePublish(any(), any()) }
        coVerify(exactly = 0) { editor.save(any(), any(), any()) }
    }

    @Test
    fun `une edition deja ouverte ne se rouvre pas par-dessus ce que l'auteur a change`() {
        val vm = viewModel()
        vm.onEditRequested()
        vm.onEditing(opening, editor)

        assertThat(vm.onEditRequested()).isFalse()
    }

    @Test
    fun `quitter le composeur en edition n'ecrit aucun brouillon de story neuve`() = runTest {
        val vm = viewModel()
        vm.onEditing(opening, editor)

        vm.persistDraft()

        assertThat(drafts.load()).isNull()
    }

    @Test
    fun `en edition ajouter ou dupliquer une slide ne change rien`() {
        val vm = viewModel()
        vm.onEditing(opening, editor)

        vm.onAddSlide()
        vm.onDuplicateSelectedSlide()

        assertThat(vm.state.value.deck.slides).hasSize(1)
    }
}
