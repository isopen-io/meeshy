package me.meeshy.ui.sticker.template

import android.graphics.Bitmap
import android.graphics.Color
import com.google.common.truth.Truth.assertThat
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class StickerDieCutTest {

    @Test
    fun `le papier deborde de 1,6 pour cent du cote le plus long, au moins deux dp`() {
        assertThat(StickerDieCut.outline(200f, 100f)).isWithin(0.0001f).of(3.2f)
        assertThat(StickerDieCut.outline(40f, 20f)).isEqualTo(2f)
    }

    @Test
    fun `la marge par bord couvre le papier et l'ombre, arrondie au dessus`() {
        assertThat(StickerDieCut.margin(200f, 100f)).isEqualTo(9f)
        assertThat(StickerDieCut.margin(40f, 20f)).isEqualTo(6f)
    }

    @Test
    fun `l'ombre est d'encre indigo a 26 pour cent, decalee vers le bas`() {
        assertThat(Color.alpha(StickerDieCut.ink)).isEqualTo(66)
        assertThat(StickerDieCut.shadowOffset(200f, 100f)).isWithin(0.0001f).of(2.24f)
        assertThat(StickerDieCut.DIRECTIONS).isEqualTo(16)
    }

    @Test
    fun `l'image decoupee est agrandie de la marge sur chaque bord, a l'echelle de l'ecran`() {
        val source = Bitmap.createBitmap(400, 200, Bitmap.Config.ARGB_8888)
        val cut = StickerDieCut.apply(source, density = 2f)
        val margin = StickerDieCut.margin(200f, 100f) * 2f
        assertThat(cut.width).isEqualTo((400 + 2 * margin).toInt())
        assertThat(cut.height).isEqualTo((200 + 2 * margin).toInt())
        assertThat(cut.config).isEqualTo(Bitmap.Config.ARGB_8888)
    }

    @Test
    fun `une image degeneree est rendue telle quelle`() {
        val source = Bitmap.createBitmap(1, 1, Bitmap.Config.ARGB_8888)
        assertThat(StickerDieCut.apply(source, density = 0f)).isSameInstanceAs(source)
    }
}
