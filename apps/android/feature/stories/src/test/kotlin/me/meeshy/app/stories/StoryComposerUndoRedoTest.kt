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
import me.meeshy.sdk.media.MediaBlobStore
import me.meeshy.sdk.media.MediaUploadQueue
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.story.InMemoryStoryComposerDraftStore
import me.meeshy.sdk.story.StoryRepository
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class StoryComposerUndoRedoTest {

    @Before
    fun setUp() = Dispatchers.setMain(UnconfinedTestDispatcher())

    @After
    fun tearDown() = Dispatchers.resetMain()

    private fun viewModel(): StoryComposerViewModel {
        val session: SessionRepository = mockk(relaxed = true)
        every { session.currentUser } returns MutableStateFlow(MeeshyUser(id = "me", username = "me", systemLanguage = "en"))
        return StoryComposerViewModel(
            mockk<StoryRepository>(relaxed = true),
            session,
            mockk<StoryMediaUploader>(relaxed = true),
            mockk<MediaUploadQueue>(relaxed = true),
            mockk<WorkManager>(relaxed = true),
            InMemoryStoryComposerDraftStore(),
            mockk<MediaBlobStore>(relaxed = true),
        )
    }

    @Test
    fun `a fresh composer has nothing to undo or redo`() = runTest {
        val vm = viewModel()

        assertThat(vm.state.value.canUndo).isFalse()
        assertThat(vm.state.value.canRedo).isFalse()
    }

    @Test
    fun `undo restores the deck before a sticker and redo brings it back`() = runTest {
        val vm = viewModel()

        vm.onAddSticker("🔥")
        assertThat(vm.state.value.selectedSlideStickers).hasSize(1)
        assertThat(vm.state.value.canUndo).isTrue()

        vm.onUndo()
        assertThat(vm.state.value.selectedSlideStickers).isEmpty()
        assertThat(vm.state.value.canUndo).isFalse()
        assertThat(vm.state.value.canRedo).isTrue()

        vm.onRedo()
        assertThat(vm.state.value.selectedSlideStickers).hasSize(1)
        assertThat(vm.state.value.canRedo).isFalse()
    }

    @Test
    fun `a new edit after an undo truncates the redo branch`() = runTest {
        val vm = viewModel()
        vm.onAddSticker("🔥")
        vm.onUndo()

        vm.onAddTextElement()

        assertThat(vm.state.value.canRedo).isFalse()
    }

    @Test
    fun `a continuous drag of a sticker is a single undo step`() = runTest {
        val vm = viewModel()
        vm.onAddSticker("🔥")
        val id = vm.state.value.selectedSlideStickers.single().id
        val placed = vm.state.value.selectedSlideStickers.single()

        vm.onStickerMoved(id, 0.05f, 0.05f)
        vm.onStickerMoved(id, 0.05f, 0.05f)
        vm.onStickerMoved(id, 0.05f, 0.05f)
        assertThat(vm.state.value.selectedSlideStickers.single()).isNotEqualTo(placed)

        vm.onUndo()

        assertThat(vm.state.value.selectedSlideStickers.single()).isEqualTo(placed)
    }

    @Test
    fun `selecting another slide is not an undo step`() = runTest {
        val vm = viewModel()
        vm.onAddSlide()
        vm.onUndo()
        vm.onAddSlide()
        val first = vm.state.value.deck.slides.first().id

        vm.onSelectSlide(first)
        vm.onUndo()

        assertThat(vm.state.value.deck.slides).hasSize(1)
    }

    @Test
    fun `undo and redo on empty stacks are inert`() = runTest {
        val vm = viewModel()
        val before = vm.state.value

        vm.onUndo()
        vm.onRedo()

        assertThat(vm.state.value).isEqualTo(before)
    }
}
