package me.meeshy.sdk.model.composer.look

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.call.VideoFilterPreset
import me.meeshy.sdk.model.call.montage.CallMontageChoice
import me.meeshy.sdk.model.call.montage.CallMontageStyle
import org.junit.Test

/** La retouche unique Android : l'état de l'écran, en loi pure (#12614). */
class ComposerRetouchStateTest {

    private fun photo(tools: List<ComposerEditTool> = emptyList()) =
        ComposerRetouchState.opening(ComposerEditTake.Photo, renderableEffects = emptyList(), tools = tools)

    private val screen = ComposerLookStripItem.Frame(ComposerPhotoFrame.Montage(CallMontageChoice.Classic(CallMontageStyle.SCREEN)))

    @Test
    fun `a l entree, aucun outil ni famille ouverte, et la rangee haute est la`() {
        val state = photo()
        assertThat(state.openFamily).isNull()
        assertThat(state.activeTools).isEmpty()
        assertThat(state.showsTopRow).isTrue()
        assertThat(state.look.isUntouched).isTrue()
        assertThat(state.families).containsExactly(ComposerLookFamily.FILTERS, ComposerLookFamily.FRAMES).inOrder()
    }

    @Test
    fun `toucher une famille l ouvre et cache la rangee haute, la toucher encore la referme`() {
        val open = photo().tappingFamily(ComposerLookFamily.FRAMES)
        assertThat(open.openFamily).isEqualTo(ComposerLookFamily.FRAMES)
        assertThat(open.showsTopRow).isFalse()
        assertThat(open.tappingFamily(ComposerLookFamily.FILTERS).openFamily).isEqualTo(ComposerLookFamily.FILTERS)
        val closed = open.tappingFamily(ComposerLookFamily.FRAMES)
        assertThat(closed.openFamily).isNull()
        assertThat(closed.showsTopRow).isTrue()
    }

    @Test
    fun `une famille que la plateforme ne sait pas peindre ne s ouvre pas`() {
        assertThat(photo().tappingFamily(ComposerLookFamily.EFFECTS).openFamily).isNull()
    }

    @Test
    fun `filtre et cadre se combinent, et un look touche part rendu`() {
        val state = photo()
            .choosing(ComposerLookStripItem.Filter(VideoFilterPreset.Warm))
            .choosing(screen)
        assertThat(state.look.filter).isEqualTo(VideoFilterPreset.Warm)
        assertThat(state.look.frame).isEqualTo(screen.frame)
        assertThat(state.delivery).isEqualTo(ComposerRetouchDelivery.RENDERED)
        assertThat(photo().delivery).isEqualTo(ComposerRetouchDelivery.ORIGINAL)
        val back = state.choosing(ComposerLookStripItem.Filter(VideoFilterPreset.Natural)).choosing(ComposerLookStripItem.Frame(ComposerPhotoFrame.None))
        assertThat(back.delivery).isEqualTo(ComposerRetouchDelivery.ORIGINAL)
    }

    @Test
    fun `la reponse a l hote ne part qu une fois, et plus rien ne bouge ensuite`() {
        val settled = photo().tappingFamily(ComposerLookFamily.FILTERS).settling()!!
        assertThat(settled.openFamily).isNull()
        assertThat(settled.settling()).isNull()
        assertThat(settled.choosing(screen).look.isUntouched).isTrue()
        assertThat(settled.tappingFamily(ComposerLookFamily.FRAMES).openFamily).isNull()
    }

    @Test
    fun `un outil que la prise offre se montre seul, un outil absent ne bouge rien`() {
        val withCrop = photo(tools = listOf(ComposerEditTool.CROP))
        assertThat(withCrop.tools).containsExactly(ComposerEditTool.CROP)
        val cropping = withCrop.tappingTool(ComposerEditTool.CROP)
        assertThat(cropping.activeTools).containsExactly(ComposerEditTool.CROP)
        assertThat(cropping.showsTopRow).isFalse()
        assertThat(photo().tappingTool(ComposerEditTool.CROP).activeTools).isEmpty()
        assertThat(photo(tools = listOf(ComposerEditTool.TRIM)).tools).isEmpty()
    }

    @Test
    fun `la toile garde les proportions de la prise, en pixels pairs, sans jamais agrandir`() {
        assertThat(ComposerLookCanvas.fitted(4000, 3000, 2560)).isEqualTo(ComposerLookSize(2560, 1920))
        assertThat(ComposerLookCanvas.fitted(1081, 1921, 2560)).isEqualTo(ComposerLookSize(1080, 1920))
        assertThat(ComposerLookCanvas.fitted(3024, 4032, ComposerLookCanvas.PREVIEW_LONG_SIDE)).isEqualTo(ComposerLookSize(960, 1280))
        assertThat(ComposerLookCanvas.fitted(0, 100, 2560)).isNull()
    }
}
