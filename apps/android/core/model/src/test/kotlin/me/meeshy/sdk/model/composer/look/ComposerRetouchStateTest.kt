package me.meeshy.sdk.model.composer.look

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.call.VideoFilterPreset
import me.meeshy.sdk.model.call.montage.CallMontageChoice
import me.meeshy.sdk.model.call.montage.CallMontageStyle
import me.meeshy.sdk.model.imageedit.CropRect
import me.meeshy.sdk.model.imageedit.NormalizedCrop
import me.meeshy.sdk.model.media.MediaTrimBounds
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

    private fun video(hasAudio: Boolean = true) = ComposerRetouchState.opening(
        ComposerEditTake.Video(hasAudio),
        renderableEffects = emptyList(),
        tools = ComposerEditTool.entries,
        durationSeconds = 12.0,
        lookFamilies = false,
    )

    @Test
    fun `un preset recadre au plus grand centre, et Original sur la prise entiere ne recadre rien`() {
        val square = photo(listOf(ComposerEditTool.CROP)).choosingPreset(ComposerCropPreset.SQUARE, 4000, 3000)
        assertThat(square.cropPreset).isEqualTo(ComposerCropPreset.SQUARE)
        assertThat(square.crop!!.width.toDouble()).isWithin(1e-6).of(0.75)
        assertThat(square.delivery).isEqualTo(ComposerRetouchDelivery.RENDERED)
        val original = square.choosingPreset(ComposerCropPreset.ORIGINAL, 4000, 3000)
        assertThat(original.crop).isNull()
        assertThat(original.delivery).isEqualTo(ComposerRetouchDelivery.ORIGINAL)
    }

    @Test
    fun `des equerres tirees a la main font un recadrage libre, sauf si elles realisent un preset`() {
        val free = photo().cropping(NormalizedCrop(0.1f, 0.1f, 0.5f, 0.7f), 1000, 1000)
        assertThat(free.cropPreset).isNull()
        val square = photo().cropping(NormalizedCrop(0f, 0f, 0.5f, 0.5f), 1000, 1000)
        assertThat(square.cropPreset).isEqualTo(ComposerCropPreset.SQUARE)
    }

    @Test
    fun `une video offre recadrer, couper et le son, et sans look elle n a pas de familles`() {
        val clip = video()
        assertThat(clip.tools).containsExactly(ComposerEditTool.CROP, ComposerEditTool.TEXT, ComposerEditTool.TRIM, ComposerEditTool.SOUND).inOrder()
        assertThat(clip.families).isEmpty()
        assertThat(video(hasAudio = false).tools).doesNotContain(ComposerEditTool.SOUND)
        assertThat(clip.delivery).isEqualTo(ComposerRetouchDelivery.ORIGINAL)
    }

    @Test
    fun `couper grave une fenetre valide, une fenetre trop courte vaut la video entiere`() {
        val cut = video().trimming(MediaTrimBounds(2.0, 8.0))
        assertThat(cut.video!!.window).isEqualTo(MediaTrimBounds(2.0, 8.0))
        assertThat(cut.delivery).isEqualTo(ComposerRetouchDelivery.RENDERED)
        assertThat(video().trimming(MediaTrimBounds(3.0, 3.1)).video!!.isTrimmed).isFalse()
        assertThat(photo().trimming(MediaTrimBounds(2.0, 8.0)).video).isNull()
    }

    @Test
    fun `le son se regle et se coupe, le muet garde le gain`() {
        val louder = video().settingGain(1.6)
        assertThat(louder.video!!.sound.effectiveGain).isEqualTo(1.6)
        val muted = louder.togglingMute()
        assertThat(muted.video!!.sound.effectiveGain).isEqualTo(0.0)
        assertThat(muted.togglingMute().video!!.sound.effectiveGain).isEqualTo(1.6)
        assertThat(video().settingGain(5.0).video!!.sound.gain).isEqualTo(ComposerTakeSound.MAX_GAIN)
    }

    @Test
    fun `l image se pose entiere et centree dans son conteneur`() {
        assertThat(ComposerLookCanvas.displayRect(400f, 800f, 200, 100)).isEqualTo(CropRect(0f, 300f, 400f, 200f))
        assertThat(ComposerLookCanvas.displayRect(0f, 800f, 200, 100).width).isEqualTo(0f)
    }
}
