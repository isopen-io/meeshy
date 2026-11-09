package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.imageedit.NormalizedCrop
import org.junit.Test

/** Le format d'une image d'identité (#17257, jumelle de l'iOS `EntityImageFormat`) : l'avatar rond 1:1, la bannière 3:1. */
class EntityImageFormatTest {

    @Test
    fun `l avatar est un rond carre, la banniere un bandeau trois fois plus large que haut`() {
        assertThat(EntityImageFormat.AVATAR.aspect).isEqualTo(1.0)
        assertThat(EntityImageFormat.AVATAR.isRound).isTrue()
        assertThat(EntityImageFormat.BANNER.aspect).isEqualTo(3.0)
        assertThat(EntityImageFormat.BANNER.isRound).isFalse()
    }

    @Test
    fun `chaque cible d envoi a son format, et l avatar n ouvre jamais celui de la banniere`() {
        assertThat(EntityImageFormat.of(ImageUploadTarget.AVATAR)).isEqualTo(EntityImageFormat.AVATAR)
        assertThat(EntityImageFormat.of(ImageUploadTarget.BANNER)).isEqualTo(EntityImageFormat.BANNER)
    }

    @Test
    fun `le cadre initial est le plus grand aux proportions du format, centre dans la prise`() {
        assertThat(EntityImageFormat.AVATAR.centeredCrop(4000, 3000)).isEqualTo(NormalizedCrop(0.125f, 0f, 0.75f, 1f))
        val banner = EntityImageFormat.BANNER.centeredCrop(3000, 3000)!!
        assertThat(banner.x).isEqualTo(0f)
        assertThat(banner.width).isEqualTo(1f)
        assertThat(banner.height).isWithin(1e-6f).of(1f / 3f)
        assertThat(banner.y).isWithin(1e-6f).of(1f / 3f)
    }

    @Test
    fun `une prise deja au format n a pas de cadre a poser`() {
        assertThat(EntityImageFormat.AVATAR.centeredCrop(800, 800)).isNull()
        assertThat(EntityImageFormat.BANNER.centeredCrop(1500, 500)).isNull()
    }

    @Test
    fun `le recadrage final en pixels tient le format exact, centre`() {
        assertThat(EntityImageFormat.AVATAR.pixelWindow(4000, 3000)).isEqualTo(PixelWindow(500, 0, 3000, 3000))
        assertThat(EntityImageFormat.BANNER.pixelWindow(1200, 900)).isEqualTo(PixelWindow(0, 250, 1200, 400))
        assertThat(EntityImageFormat.BANNER.pixelWindow(2000, 400)).isEqualTo(PixelWindow(400, 0, 1200, 400))
    }

    @Test
    fun `une image deja au format ou vide ne se recadre pas`() {
        assertThat(EntityImageFormat.AVATAR.pixelWindow(512, 512)).isNull()
        assertThat(EntityImageFormat.BANNER.pixelWindow(1500, 500)).isNull()
        assertThat(EntityImageFormat.BANNER.pixelWindow(1501, 500)).isNull()
        assertThat(EntityImageFormat.AVATAR.pixelWindow(0, 500)).isNull()
    }
}
