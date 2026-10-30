package me.meeshy.app.stories

import androidx.work.WorkManager
import com.google.common.truth.Truth.assertThat
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.friend.BlockCache
import me.meeshy.sdk.media.MediaBlobStore
import me.meeshy.sdk.media.MediaUploadQueue
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.StoryComposerDraftSnapshot
import me.meeshy.sdk.model.StoryDraftSlideSnapshot
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.story.InMemoryStoryComposerDraftStore
import me.meeshy.sdk.story.StoryDraftConfirmation
import me.meeshy.sdk.story.StoryRepository
import org.junit.After
import org.junit.Before
import org.junit.Test

/**
 * Fermer le compositeur (#13838) : un brouillon vide n'a rien à garder ; « Garder le brouillon » laisse la sauvegarde
 * automatique l'enregistrer, « Abandonner » le purge — sans jamais toucher au brouillon de l'auteur quand une porte a posé
 * sa propre matière.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class StoryComposerCloseDraftTest {

    private val dispatcher = UnconfinedTestDispatcher()

    @Before
    fun setUp() = Dispatchers.setMain(dispatcher)

    @After
    fun tearDown() = Dispatchers.resetMain()

    private fun viewModel(store: InMemoryStoryComposerDraftStore): StoryComposerViewModel {
        val session: SessionRepository = mockk(relaxed = true)
        every { session.currentUser } returns MutableStateFlow(MeeshyUser(id = "me", username = "me", systemLanguage = "fr"))
        return StoryComposerViewModel(
            mockk<StoryRepository>(relaxed = true), session, mockk(relaxed = true), mockk<MediaUploadQueue>(relaxed = true),
            mockk<WorkManager>(relaxed = true), store, mockk<MediaBlobStore>(relaxed = true),
            mockk<StoryDraftConfirmation>(relaxed = true), BlockCache(),
        )
    }

    private fun authorDraft() = StoryComposerDraftSnapshot(
        slides = listOf(StoryDraftSlideSnapshot(id = "s1", text = "le brouillon de l'auteur")),
        selectedId = "s1",
        visibility = "PUBLIC",
    )

    @Test
    fun `a freshly opened composer holds no draft, so its cross asks nothing`() = runTest {
        val vm = viewModel(InMemoryStoryComposerDraftStore())

        vm.onEnterComposer()

        assertThat(vm.state.value.hasDraftContent).isFalse()
    }

    @Test
    fun `a word written makes the draft worth a question`() = runTest {
        val vm = viewModel(InMemoryStoryComposerDraftStore())
        vm.onEnterComposer()

        vm.onTextChange("bonjour")

        assertThat(vm.state.value.hasDraftContent).isTrue()
    }

    @Test
    fun `a text laid on the scene makes the draft worth a question`() = runTest {
        val vm = viewModel(InMemoryStoryComposerDraftStore())
        vm.onEnterComposer()

        vm.onAddTextElement()

        assertThat(vm.state.value.hasDraftContent).isTrue()
    }

    @Test
    fun `keeping the draft lets the autosave record it on leaving`() = runTest {
        val store = InMemoryStoryComposerDraftStore()
        val vm = viewModel(store)
        vm.onEnterComposer()
        vm.onTextChange("bonjour")

        vm.persistDraft()

        assertThat(store.load()?.slides?.single()?.text).isEqualTo("bonjour")
    }

    @Test
    fun `abandoning purges the draft the autosave had recorded`() = runTest {
        val store = InMemoryStoryComposerDraftStore()
        val vm = viewModel(store)
        vm.onEnterComposer()
        vm.onTextChange("bonjour")
        vm.persistDraft()

        vm.onDiscardDraft()
        vm.persistDraft()

        assertThat(store.load()).isNull()
        assertThat(vm.state.value.hasDraftContent).isFalse()
    }

    @Test
    fun `abandoning what a door laid never erases the author's own stored draft`() = runTest {
        val store = InMemoryStoryComposerDraftStore(authorDraft())
        val vm = viewModel(store)
        vm.onEnterComposer(seededByDoor = true)
        vm.onTextChange("la matière de la porte")

        vm.onDiscardDraft()
        vm.persistDraft()

        assertThat(store.load()?.slides?.single()?.text).isEqualTo("le brouillon de l'auteur")
    }
}
