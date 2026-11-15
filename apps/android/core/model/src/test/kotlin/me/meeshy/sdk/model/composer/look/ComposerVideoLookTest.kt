package me.meeshy.sdk.model.composer.look

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.call.VideoFilterPreset
import me.meeshy.sdk.model.imageedit.NormalizedCrop
import me.meeshy.sdk.model.scene.StoryColorMatrix
import org.junit.Test

/** Le look d'une vidéo (#12736) : la couleur du filtre en matrice du GPU, le cadre en calque troué. */
class ComposerVideoLookTest {

    private fun argb(a: Int, r: Int, g: Int, b: Int) = (a shl 24) or (r shl 16) or (g shl 8) or b
    private fun alpha(pixel: Int) = pixel ushr 24

    @Test
    fun `sans filtre la video ne paie aucune passe de couleur, un filtre en paie une`() {
        assertThat(ComposerVideoLook.rgbMatrix(VideoFilterPreset.Natural)).isNull()
        assertThat(ComposerVideoLook.rgbMatrix(VideoFilterPreset.Warm)).isNotNull()
    }

    @Test
    fun `la matrice du GPU se lit colonne par colonne, le decalage dans la derniere`() {
        val values = StoryColorMatrix.IDENTITY.values.toMutableList().also {
            it[0] = 1.2f
            it[4] = 25.5f
            it[6] = 0.8f
        }
        val gpu = ComposerVideoLook.rgbMatrix(StoryColorMatrix(values))
        assertThat(gpu[0]).isEqualTo(1.2f)
        assertThat(gpu[5]).isEqualTo(0.8f)
        assertThat(gpu[12]).isWithin(1e-6f).of(0.1f)
        assertThat(gpu[15]).isEqualTo(1f)
    }

    @Test
    fun `un look se grave sur la video des qu il a un filtre ou un cadre`() {
        assertThat(ComposerVideoLook.paints(ComposerPhotoLook())).isFalse()
        assertThat(ComposerVideoLook.paints(ComposerPhotoLook(filter = VideoFilterPreset.Cool))).isTrue()
    }

    @Test
    fun `le calque du cadre est troue la ou la prise se voit, et la case se mesure`() {
        val white = intArrayOf(argb(255, 200, 0, 0), argb(255, 255, 255, 255), argb(255, 255, 255, 255), argb(255, 200, 0, 0))
        val black = intArrayOf(argb(255, 200, 0, 0), argb(255, 0, 0, 0), argb(255, 0, 0, 0), argb(255, 200, 0, 0))
        val matte = ComposerVideoFrameMatte.compose(white, black, still = null, width = 4, height = 1)
        assertThat(alpha(matte.pixels[0])).isEqualTo(255)
        assertThat(alpha(matte.pixels[1])).isEqualTo(0)
        assertThat(alpha(matte.pixels[2])).isEqualTo(0)
        assertThat(matte.slot).isEqualTo(NormalizedCrop(0.25f, 0f, 0.5f, 1f))
    }

    @Test
    fun `hors de la case, le fond tire de la prise vient de son image fixe`() {
        val white = intArrayOf(argb(255, 120, 120, 120), argb(255, 255, 255, 255))
        val black = intArrayOf(argb(255, 10, 10, 10), argb(255, 0, 0, 0))
        val still = intArrayOf(argb(255, 0, 90, 0), argb(255, 0, 0, 0))
        val matte = ComposerVideoFrameMatte.compose(white, black, still, width = 2, height = 1)
        assertThat(matte.pixels[0]).isEqualTo(still[0])
        assertThat(alpha(matte.pixels[1])).isEqualTo(0)
    }

    @Test
    fun `une prise pleine page ne se deplace pas, une case la couvre centree`() {
        val full = ComposerVideoFrameMatte.compose(intArrayOf(-1, -1), intArrayOf(argb(255, 0, 0, 0), argb(255, 0, 0, 0)), null, 2, 1)
        assertThat(full.slot).isNull()
        val quarter = ComposerVideoFrameMatte.placement(NormalizedCrop(0f, 0f, 0.5f, 0.5f))
        assertThat(quarter.scale).isEqualTo(0.5f)
        assertThat(quarter.translateX).isEqualTo(-0.5f)
        assertThat(quarter.translateY).isEqualTo(0.5f)
        assertThat(ComposerVideoFrameMatte.placement(NormalizedCrop(0.1f, 0.2f, 0.8f, 0.4f)).scale).isEqualTo(0.8f)
    }
}
