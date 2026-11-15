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
import me.meeshy.sdk.model.StoryBackgroundValue
import me.meeshy.sdk.model.StoryDrawingStrokePoint
import me.meeshy.sdk.model.StoryFilter
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.story.InMemoryStoryComposerDraftStore
import me.meeshy.sdk.story.StoryDraftConfirmation
import me.meeshy.sdk.story.StoryRepository
import org.junit.After
import org.junit.Before
import org.junit.Test

/**
 * #14209 — Annuler et Rétablir rejouent TOUTES les actions de la scène, un témoin par famille : l'action change la scène,
 * Annuler rend la scène d'avant, Rétablir celle d'après. Un geste continu vaut un pas, deux gestes deux pas, même sur le
 * même réglage, et le doigt levé referme le geste.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class StoryComposerHistoryFamiliesTest {

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
            mockk<StoryDraftConfirmation>(relaxed = true),
        )
    }

    private val StoryComposerViewModel.scene get() = state.value.deck.slides

    private fun StoryComposerViewModel.replaysBothWays(action: StoryComposerViewModel.() -> Unit) {
        val before = scene
        action()
        val after = scene
        assertThat(after).isNotEqualTo(before)

        onUndo()
        assertThat(scene).isEqualTo(before)
        assertThat(state.value.canRedo).isTrue()

        onRedo()
        assertThat(scene).isEqualTo(after)
    }

    private fun StoryComposerViewModel.withSticker(): String {
        onAddSticker("🔥")
        return state.value.selectedSlideStickers.single().id
    }

    private fun StoryComposerViewModel.withText(): String {
        onAddTextElement()
        return state.value.selectedSlideTextElements.single().id
    }

    @Test
    fun `adding an object`() = runTest {
        viewModel().replaysBothWays { onAddSticker("🔥") }
    }

    @Test
    fun `removing an object`() = runTest {
        val vm = viewModel()
        val id = vm.withSticker()
        vm.replaysBothWays { onRemoveSticker(id) }
    }

    @Test
    fun `duplicating an object`() = runTest {
        val vm = viewModel()
        val id = vm.withSticker()
        vm.replaysBothWays { onDuplicateSticker(id) }
    }

    @Test
    fun `moving an object, one gesture one step`() = runTest {
        val vm = viewModel()
        val id = vm.withSticker()
        vm.replaysBothWays {
            onStickerMoved(id, 0.01f, 0f)
            onStickerMoved(id, 0.02f, 0.01f)
            onStickerMoved(id, 0.03f, 0.02f)
            onStickerDragEnd()
        }
    }

    @Test
    fun `resizing and turning an object`() = runTest {
        val vm = viewModel()
        val id = vm.withSticker()
        vm.replaysBothWays {
            onStickerTransform(id, 1.2f, 10f)
            onStickerTransform(id, 1.1f, 5f)
            onStickerDragEnd()
        }
    }

    @Test
    fun `typing a text, one step for the whole word`() = runTest {
        val vm = viewModel()
        vm.withText()
        vm.replaysBothWays {
            onTextChange("B")
            onTextChange("Bo")
            onTextChange("Bonjour")
        }
    }

    @Test
    fun `styling a text`() = runTest {
        val vm = viewModel()
        val id = vm.withText()
        vm.replaysBothWays { onTextElementStyle(id, StoryTextStyle.NEON) }
    }

    @Test
    fun `colouring a text`() = runTest {
        val vm = viewModel()
        val id = vm.withText()
        vm.replaysBothWays { onTextElementColor(id, "#FF2E63") }
    }

    @Test
    fun `choosing a filter`() = runTest {
        viewModel().replaysBothWays { onSelectFilter(StoryFilter.VINTAGE) }
    }

    @Test
    fun `changing the background`() = runTest {
        viewModel().replaysBothWays { onSlideBackgroundChange(StoryBackgroundValue.Hex("FF2E63")) }
    }

    @Test
    fun `changing the duration`() = runTest {
        viewModel().replaysBothWays { onSlideDurationChange(12.0) }
    }

    @Test
    fun `adding a slide`() = runTest {
        viewModel().replaysBothWays { onAddSlide() }
    }

    @Test
    fun `duplicating a slide`() = runTest {
        viewModel().replaysBothWays { onDuplicateSelectedSlide() }
    }

    @Test
    fun `removing a slide`() = runTest {
        val vm = viewModel()
        vm.onAddSlide()
        val id = vm.state.value.deck.selectedId
        vm.replaysBothWays { onRemoveSlide(id) }
    }

    @Test
    fun `reordering the slides`() = runTest {
        val vm = viewModel()
        vm.onAddSlide()
        val last = vm.state.value.deck.slides.last().id
        vm.replaysBothWays { onMoveSlide(last, 0) }
    }

    @Test
    fun `drawing a stroke`() = runTest {
        val vm = viewModel()
        vm.onEnterDrawingMode()
        vm.replaysBothWays {
            onStrokeCaptured(listOf(StoryDrawingStrokePoint(0.1, 0.1), StoryDrawingStrokePoint(0.5, 0.5), StoryDrawingStrokePoint(0.9, 0.2)))
        }
    }

    @Test
    fun `clearing the whole scene`() = runTest {
        val vm = viewModel()
        vm.withSticker()
        vm.replaysBothWays { onClearAll() }
    }

    @Test
    fun `two separate moves of the same setting are two steps once the finger lifted between them`() = runTest {
        val vm = viewModel()
        vm.onSelectFilter(StoryFilter.WARM)
        vm.onFilterIntensityChange(0.3f)
        vm.onFilterIntensityChange(0.4f)
        vm.onGestureLifted()
        val afterFirst = vm.scene

        vm.onFilterIntensityChange(0.7f)
        vm.onFilterIntensityChange(0.8f)
        vm.onGestureLifted()
        vm.onUndo()

        assertThat(vm.scene).isEqualTo(afterFirst)
    }

    @Test
    fun `two separate pinches of the scene are two steps once the finger lifted between them`() = runTest {
        val vm = viewModel()
        vm.onCanvasTransform(10f, 0f, 1.1f, 300f, 400f)
        vm.onGestureLifted()
        val afterFirst = vm.scene

        vm.onCanvasTransform(20f, 0f, 1.2f, 300f, 400f)
        vm.onGestureLifted()
        vm.onUndo()

        assertThat(vm.scene).isEqualTo(afterFirst)
    }

    @Test
    fun `a lifted finger alone is no step`() = runTest {
        val vm = viewModel()
        vm.onGestureLifted()

        assertThat(vm.state.value.canUndo).isFalse()
    }

    @Test
    fun `a new action after an undo leaves nothing to redo`() = runTest {
        val vm = viewModel()
        vm.withSticker()
        vm.onSelectFilter(StoryFilter.BW)
        vm.onUndo()

        vm.onSlideDurationChange(9.0)

        assertThat(vm.state.value.canRedo).isFalse()
    }
}
