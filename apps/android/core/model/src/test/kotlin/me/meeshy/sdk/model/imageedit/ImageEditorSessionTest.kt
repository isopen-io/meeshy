package me.meeshy.sdk.model.imageedit

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ImageEditorSessionTest {
    private fun fresh() = ImageEditorSession()

    @Test
    fun `un curseur glisse puis pose ne grave qu'un seul pas`() {
        var s = fresh()
        listOf(0.1f, 0.2f, 0.3f).forEach { v -> s = s.update { it.copy(adjustments = it.adjustments.with(AdjustmentKind.BRIGHTNESS, v)) } }
        assertThat(s.history.count).isEqualTo(1)
        s = s.commit("Luminosité")
        assertThat(s.history.count).isEqualTo(2)
        assertThat(s.history.steps.last().label).isEqualTo("Luminosité")
    }

    @Test
    fun `annuler puis retablir rejoue la retouche vivante`() {
        val s = fresh().perform("Sepia") { it.copy(filter = ImageFilter.SEPIA) }
        assertThat(s.canUndo).isTrue()
        val undone = s.undo()
        assertThat(undone.live).isEqualTo(ImageEditState.IDENTITY)
        assertThat(undone.canRedo).isTrue()
        assertThat(undone.redo().live.filter).isEqualTo(ImageFilter.SEPIA)
    }

    @Test
    fun `sauter a un pas restaure sa retouche`() {
        val s = fresh().perform("Sepia") { it.copy(filter = ImageFilter.SEPIA) }.perform("Grain") { it.copy(effect = ImageEffect.GRAIN) }
        val first = s.history.steps[1].id
        assertThat(s.jump(first).live).isEqualTo(ImageEditState(filter = ImageFilter.SEPIA))
        assertThat(s.jump(999L)).isEqualTo(s)
    }

    @Test
    fun `reinitialiser sans retouche ne grave rien et avec retouche grave un pas`() {
        assertThat(fresh().reset("Réinitialisation").history.count).isEqualTo(1)
        val s = fresh().perform("Sepia") { it.copy(filter = ImageFilter.SEPIA) }.reset("Réinitialisation")
        assertThat(s.live).isEqualTo(ImageEditState.IDENTITY)
        assertThat(s.history.steps.last().label).isEqualTo("Réinitialisation")
    }

    @Test
    fun `repasser en Simple depuis Effets ferme l'outil`() {
        val s = fresh().withMode(ImageEditorMode.PRO).withTool(EditorTool.EFFECTS)
        assertThat(s.activeTool).isEqualTo(EditorTool.EFFECTS)
        assertThat(s.withMode(ImageEditorMode.SIMPLE).activeTool).isNull()
    }

    @Test
    fun `repasser en Simple garde un outil essentiel ouvert`() {
        val s = fresh().withMode(ImageEditorMode.PRO).withTool(EditorTool.FILTERS).withMode(ImageEditorMode.SIMPLE)
        assertThat(s.activeTool).isEqualTo(EditorTool.FILTERS)
    }

    @Test
    fun `Effets est refuse en Simple et le meme outil deux fois referme le controleur`() {
        assertThat(fresh().withTool(EditorTool.EFFECTS).activeTool).isNull()
        val open = fresh().withTool(EditorTool.ADJUST)
        assertThat(open.activeTool).isEqualTo(EditorTool.ADJUST)
        assertThat(open.withTool(EditorTool.ADJUST).activeTool).isNull()
        assertThat(open.withTool(EditorTool.CROP).activeTool).isEqualTo(EditorTool.CROP)
    }

    @Test
    fun `le rail depend du mode`() {
        assertThat(EditorTool.rail(ImageEditorMode.SIMPLE)).containsExactly(EditorTool.CROP, EditorTool.FILTERS, EditorTool.ADJUST).inOrder()
        assertThat(EditorTool.rail(ImageEditorMode.PRO)).hasSize(4)
    }

    @Test
    fun `le contexte choisit le ratio de recadrage`() {
        assertThat(ImageEditorContext.AVATAR.initialCropRatio).isEqualTo(CropRatio.SQUARE)
        assertThat(ImageEditorContext.STORY.initialCropRatio).isEqualTo(CropRatio.RATIO_9_16)
        assertThat(ImageEditorContext.POST.initialCropRatio).isEqualTo(CropRatio.FREE)
    }

    @Test
    fun `Simple montre trois reglages et Pro neuf`() {
        assertThat(ImageEditorFormat.toneRail(ImageEditorMode.SIMPLE)).containsExactly(
            AdjustmentKind.BRIGHTNESS, AdjustmentKind.CONTRAST, AdjustmentKind.SATURATION,
        ).inOrder()
        assertThat(ImageEditorFormat.toneRail(ImageEditorMode.PRO)).hasSize(9)
        assertThat(ImageEditorFormat.toneRail(ImageEditorMode.PRO)).doesNotContain(AdjustmentKind.GRAIN)
    }

    @Test
    fun `la valeur affichee est l'ecart au neutre signe`() {
        assertThat(ImageEditorFormat.adjustment(1.4f, AdjustmentKind.CONTRAST)).isEqualTo("+0.4")
        assertThat(ImageEditorFormat.adjustment(0f, AdjustmentKind.SATURATION)).isEqualTo("-1.0")
        assertThat(ImageEditorFormat.adjustment(0f, AdjustmentKind.BRIGHTNESS)).isEqualTo("+0.0")
    }

    @Test
    fun `l'inspection borne le zoom, ne deplace qu'zoome et revient a 1`() {
        val i = ImageEditorInspection.IDENTITY
        assertThat(i.panned(10f, 10f)).isEqualTo(i)
        assertThat(i.pinched(1f, 20f).zoom).isEqualTo(6f)
        assertThat(i.pinched(1f, 0.1f).zoom).isEqualTo(1f)
        val z = i.pinched(1f, 2f).panned(5f, -3f)
        assertThat(z.panX).isEqualTo(5f)
        assertThat(i.pinched(1f, 1.005f).settled()).isEqualTo(ImageEditorInspection.IDENTITY)
        assertThat(z.doubleTapped()).isEqualTo(ImageEditorInspection.IDENTITY)
        assertThat(i.doubleTapped().zoom).isEqualTo(2.4f)
    }

    @Test
    fun `la comparaison attend 250 ms et 30 dp`() {
        assertThat(ImageEditorCompare.HOLD_MILLIS).isEqualTo(250L)
        assertThat(ImageEditorCompare.MAX_DISTANCE_DP).isEqualTo(30f)
        assertThat(ImageEditorCompare.canBegin(false)).isFalse()
    }

    @Test
    fun `l'image contenue est centree dans le conteneur`() {
        val r = ImageEditorGeometry.fittedRect(200f, 100f, 100f, 100f)
        assertThat(r).isEqualTo(CropRect(0f, 25f, 100f, 50f))
        assertThat(ImageEditorGeometry.canvasHeight(1000f, controllerOpen = false)).isEqualTo(848f)
        assertThat(ImageEditorGeometry.canvasHeight(1000f, controllerOpen = true)).isEqualTo(620f)
    }
}
