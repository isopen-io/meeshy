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
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.friend.BlockCache
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

/**
 * Un texte resté vide quand on cesse de l'écrire est un fantôme (#13910, iOS `exitTextEditingMode`) : il ne survit pas à la
 * sortie d'écriture, par OK, par la scène touchée à vide, par un autre objet ou un autre texte choisi ; écrit, il reste.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class StoryComposerBlankTextTest {

    @Before
    fun setUp() = Dispatchers.setMain(UnconfinedTestDispatcher())

    @After
    fun tearDown() = Dispatchers.resetMain()

    private fun writing(): StoryComposerViewModel {
        val session: SessionRepository = mockk(relaxed = true)
        every { session.currentUser } returns MutableStateFlow(MeeshyUser(id = "me", username = "me", systemLanguage = "fr"))
        return StoryComposerViewModel(
            mockk<StoryRepository>(relaxed = true), session, mockk(relaxed = true), mockk<MediaUploadQueue>(relaxed = true),
            mockk<WorkManager>(relaxed = true), InMemoryStoryComposerDraftStore(), mockk<MediaBlobStore>(relaxed = true),
            mockk<StoryDraftConfirmation>(relaxed = true), BlockCache(),
        ).also {
            it.onEnterComposer()
            it.onAddTextElement()
        }
    }

    private val StoryComposerViewModel.texts get() = state.value.deck.selectedSlide.elements.map { it.text }

    @Test
    fun `a new text left without a keystroke leaves the scene with OK`() {
        val vm = writing()
        assertThat(vm.state.value.isEditingTextElement).isTrue()

        vm.onDeselectTextElement()

        assertThat(vm.texts).isEmpty()
    }

    @Test
    fun `a text left with only blanks leaves the scene when the empty scene is touched`() {
        val vm = writing()
        vm.onTextChange("  \n ")

        vm.onSceneBackgroundTap()

        assertThat(vm.texts).isEmpty()
        assertThat(vm.state.value.selectedTextElementId).isNull()
        assertThat(vm.state.value.framedTextElementId).isNull()
    }

    @Test
    fun `a blank text leaves the scene when another object is chosen`() {
        val vm = writing()

        vm.onAddSticker("😀")

        assertThat(vm.texts).isEmpty()
        assertThat(vm.state.value.deck.selectedSlide.stickers.map { it.emoji }).containsExactly("😀")
    }

    @Test
    fun `a blank text leaves the scene when another text is posed`() {
        val vm = writing()
        val blank = vm.state.value.selectedTextElementId

        vm.onAddTextElement()

        assertThat(vm.state.value.deck.selectedSlide.elements.map { it.id }).doesNotContain(blank)
        assertThat(vm.texts).hasSize(1)
    }

    @Test
    fun `a blank text whose menu is opened is still held, and stays`() {
        val vm = writing()
        val id = vm.state.value.selectedTextElementId!!

        vm.onOpenElementMenu(id)

        assertThat(vm.state.value.deck.selectedSlide.elements.map { it.id }).containsExactly(id)
    }

    @Test
    fun `a written text stays when its writing ends`() {
        val vm = writing()
        vm.onTextChange("Bonjour")

        vm.onDeselectTextElement()

        assertThat(vm.texts).containsExactly("Bonjour")
    }

    @Test
    fun `a blank text being written stays while it is still written`() {
        val vm = writing()

        vm.onTextChange("")

        assertThat(vm.texts).containsExactly("")
        assertThat(vm.state.value.isEditingTextElement).isTrue()
    }
}

/** Un texte posé PUIS écrit : un texte laissé vide quitte la scène dès qu'on le quitte (#13910). */
internal fun StoryComposerViewModel.addWrittenText(word: String) {
    onAddTextElement()
    onTextChange(word)
}
