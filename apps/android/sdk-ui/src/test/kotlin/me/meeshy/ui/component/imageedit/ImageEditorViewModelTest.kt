package me.meeshy.ui.component.imageedit

import android.graphics.Bitmap
import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.model.imageedit.AdjustmentKind
import me.meeshy.sdk.model.imageedit.EditorTool
import me.meeshy.sdk.model.imageedit.ImageEditorContext
import me.meeshy.sdk.model.imageedit.ImageEditorMode
import me.meeshy.sdk.model.imageedit.ImageEffect
import me.meeshy.sdk.model.imageedit.ImageFilter
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ImageEditorViewModelTest {
    private val dispatcher = UnconfinedTestDispatcher()

    @Before fun setUp() = Dispatchers.setMain(dispatcher)

    @After fun tearDown() = Dispatchers.resetMain()

    private class Rig(
        val renderer: FakeImageEditorRenderer = FakeImageEditorRenderer(),
        val store: FakeImageEditorModeStore = FakeImageEditorModeStore(),
        val original: Bitmap = Bitmap.createBitmap(10, 10, Bitmap.Config.ARGB_8888),
        dispatcher: kotlinx.coroutines.CoroutineDispatcher,
    ) {
        val vm = ImageEditorViewModel(original, ImageEditorContext.POST, FakeImageEditorLabels, renderer, store, dispatcher)
        val ui get() = vm.uiState.value
    }

    private fun rig(mode: ImageEditorMode = ImageEditorMode.SIMPLE) =
        Rig(store = FakeImageEditorModeStore(mode), dispatcher = dispatcher)

    @Test fun `la densite demarre sur la derniere choisie et se retient quand on la change`() {
        val r = rig(ImageEditorMode.PRO)
        assertThat(r.ui.mode).isEqualTo(ImageEditorMode.PRO)
        r.vm.onEvent(ImageEditorUiEvent.SelectMode(ImageEditorMode.SIMPLE))
        assertThat(r.ui.mode).isEqualTo(ImageEditorMode.SIMPLE)
        assertThat(r.store.mode).isEqualTo(ImageEditorMode.SIMPLE)
        r.vm.onEvent(ImageEditorUiEvent.SelectMode(ImageEditorMode.SIMPLE))
        assertThat(r.store.saves).isEqualTo(1)
    }

    @Test fun `repasser en Simple depuis Effets ferme l'outil`() {
        val r = rig(ImageEditorMode.PRO)
        r.vm.onEvent(ImageEditorUiEvent.SelectTool(EditorTool.EFFECTS))
        assertThat(r.ui.activeTool).isEqualTo(EditorTool.EFFECTS)
        r.vm.onEvent(ImageEditorUiEvent.SelectMode(ImageEditorMode.SIMPLE))
        assertThat(r.ui.activeTool).isNull()
    }

    @Test fun `un outil s'ouvre, se referme au second appui, et Filtres rend ses vignettes`() {
        val r = rig()
        r.vm.onEvent(ImageEditorUiEvent.SelectTool(EditorTool.FILTERS))
        assertThat(r.ui.activeTool).isEqualTo(EditorTool.FILTERS)
        assertThat(r.renderer.thumbnailCalls).isEqualTo(1)
        assertThat(r.ui.filterThumbnails.keys).containsExactlyElementsIn(ImageFilter.entries)
        r.vm.onEvent(ImageEditorUiEvent.SelectTool(EditorTool.FILTERS))
        assertThat(r.ui.activeTool).isNull()
    }

    @Test fun `choisir un filtre grave un pas libelle et se defait`() {
        val r = rig()
        r.vm.onEvent(ImageEditorUiEvent.SelectFilter(ImageFilter.SEPIA))
        assertThat(r.ui.state.filter).isEqualTo(ImageFilter.SEPIA)
        assertThat(r.ui.historySteps.map { it.label }).containsExactly("Original", "SEPIA").inOrder()
        assertThat(r.ui.canUndo).isTrue()
        r.vm.onEvent(ImageEditorUiEvent.Undo)
        assertThat(r.ui.state.filter).isEqualTo(ImageFilter.ORIGINAL)
        assertThat(r.ui.canRedo).isTrue()
        r.vm.onEvent(ImageEditorUiEvent.Redo)
        assertThat(r.ui.state.filter).isEqualTo(ImageFilter.SEPIA)
    }

    @Test fun `un curseur glisse puis pose ne grave qu'un pas, et reinitialiser en grave un libelle`() {
        val r = rig()
        listOf(0.1f, 0.2f, 0.3f).forEach { r.vm.onEvent(ImageEditorUiEvent.SetAdjustment(AdjustmentKind.BRIGHTNESS, it)) }
        assertThat(r.ui.historySteps).hasSize(1)
        r.vm.onEvent(ImageEditorUiEvent.CommitAdjustment(AdjustmentKind.BRIGHTNESS))
        assertThat(r.ui.historySteps).hasSize(2)
        r.vm.onEvent(ImageEditorUiEvent.ResetAdjustments)
        assertThat(r.ui.historySteps.last().label).isEqualTo("Ajustements réinitialisés")
        assertThat(r.ui.state.adjustments.isNeutral).isTrue()
    }

    @Test fun `sauter a un pas de l'historique restaure sa retouche`() {
        val r = rig()
        r.vm.onEvent(ImageEditorUiEvent.SelectFilter(ImageFilter.SEPIA))
        r.vm.onEvent(ImageEditorUiEvent.ToggleEffect(ImageEffect.GRAIN))
        val sepiaStep = r.ui.historySteps[1].id
        r.vm.onEvent(ImageEditorUiEvent.Jump(sepiaStep))
        assertThat(r.ui.state.effect).isEqualTo(ImageEffect.NONE)
        assertThat(r.ui.currentStepId).isEqualTo(sepiaStep)
    }

    @Test fun `le rendu final est produit une seule fois depuis l'original intact`() = runTest {
        val r = rig()
        r.vm.onEvent(ImageEditorUiEvent.SelectFilter(ImageFilter.NOIR))
        val previewRenders = r.renderer.renders.size
        r.vm.uiEffects.test {
            r.vm.onEvent(ImageEditorUiEvent.Finish)
            r.vm.onEvent(ImageEditorUiEvent.Finish)
            assertThat(awaitItem()).isInstanceOf(ImageEditorUiEffect.Accepted::class.java)
            expectNoEvents()
        }
        val exports = r.renderer.renders.drop(previewRenders)
        assertThat(exports).hasSize(1)
        assertThat(exports.single().first).isSameInstanceAs(r.original)
        assertThat(exports.single().second.filter).isEqualTo(ImageFilter.NOIR)
    }

    @Test fun `annuler n'exporte rien`() = runTest {
        val r = rig()
        r.vm.uiEffects.test {
            r.vm.onEvent(ImageEditorUiEvent.Cancel)
            assertThat(awaitItem()).isEqualTo(ImageEditorUiEffect.Cancelled)
        }
        assertThat(r.renderer.renders).isEmpty()
    }

    @Test fun `comparer n'a de sens qu'avec une retouche et se relache`() {
        val r = rig()
        r.vm.onEvent(ImageEditorUiEvent.BeginCompare)
        assertThat(r.ui.isComparing).isFalse()
        r.vm.onEvent(ImageEditorUiEvent.SelectFilter(ImageFilter.SEPIA))
        r.vm.onEvent(ImageEditorUiEvent.BeginCompare)
        assertThat(r.ui.isComparing).isTrue()
        assertThat(r.ui.displayed).isSameInstanceAs(r.ui.comparison)
        r.vm.onEvent(ImageEditorUiEvent.EndCompare)
        assertThat(r.ui.isComparing).isFalse()
        assertThat(r.ui.displayed).isSameInstanceAs(r.ui.preview)
    }

    @Test fun `l'apercu se rend sur la copie reduite, jamais sur l'original mute`() {
        val r = rig()
        r.vm.onEvent(ImageEditorUiEvent.SelectFilter(ImageFilter.VIVID))
        assertThat(r.renderer.renders).isNotEmpty()
        assertThat(r.renderer.renders.last().second.filter).isEqualTo(ImageFilter.VIVID)
        assertThat(r.vm.workingImage).isSameInstanceAs(r.original)
    }
}
