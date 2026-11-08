package me.meeshy.sdk.model.media

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ImageCropGeometryTest {

    private val square = CropFrameSize(300f, 300f)
    private val banner = CropFrameSize(400f, 130f)

    @Test
    fun `le cadre de banniere prend la largeur de l'ecran sur 130 dp`() {
        val frame = ImageCropGeometry.bannerFrame(screenWidthPx = 1080f, densityScale = 2f)
        assertThat(frame).isEqualTo(CropFrameSize(1080f, 260f))
        assertThat(frame.circular).isFalse()
    }

    @Test
    fun `le cadre d'avatar est un cercle inscrit dans la zone libre`() {
        val frame = ImageCropGeometry.avatarFrame(availableWidthPx = 1000f, availableHeightPx = 1600f)
        assertThat(frame.widthPx).isEqualTo(frame.heightPx)
        assertThat(frame.widthPx).isAtMost(1000f)
        assertThat(frame.circular).isTrue()
    }

    @Test
    fun `cover prend le plus grand des deux rapports`() {
        // image 1000x500 dans un cadre 300x300 : la hauteur commande (0.6).
        assertThat(ImageCropGeometry.coverScale(1000, 500, square)).isWithin(1e-6f).of(0.6f)
        // image 500x1000 : la largeur commande.
        assertThat(ImageCropGeometry.coverScale(500, 1000, square)).isWithin(1e-6f).of(0.6f)
    }

    @Test
    fun `l'image ne laisse jamais de vide quel que soit le deplacement`() {
        val t = CropTransform.initial().panned(10_000f, -10_000f, 1000, 500, square)
        val scale = ImageCropGeometry.coverScale(1000, 500, square) * t.zoom
        val maxDx = (1000 * scale - 300f) / 2f
        val maxDy = (500 * scale - 300f) / 2f
        assertThat(t.offsetX).isWithin(1e-3f).of(maxDx)
        assertThat(t.offsetY).isWithin(1e-3f).of(-maxDy)
        assertThat(maxDy).isWithin(1e-3f).of(0f)
    }

    @Test
    fun `le zoom est borne entre 1 et le maximum`() {
        val low = CropTransform.initial().zoomed(0.1f, 1000, 500, square)
        val high = CropTransform.initial().zoomed(100f, 1000, 500, square)
        assertThat(low.zoom).isEqualTo(1f)
        assertThat(high.zoom).isEqualTo(ImageCropGeometry.MAX_ZOOM)
    }

    @Test
    fun `dezoomer ramene le decalage dans les nouvelles bornes`() {
        val zoomed = CropTransform.initial().zoomed(4f, 1000, 1000, square).panned(5000f, 0f, 1000, 1000, square)
        val back = zoomed.zoomed(0.01f, 1000, 1000, square)
        assertThat(back.zoom).isEqualTo(1f)
        assertThat(back.offsetX).isEqualTo(0f)
    }

    @Test
    fun `sans zoom ni decalage le rectangle source est centre et couvre le cadre`() {
        val rect = ImageCropGeometry.sourceRect(1000, 500, square, CropTransform.initial())
        assertThat(rect.heightPx).isEqualTo(500)
        assertThat(rect.widthPx).isEqualTo(500)
        assertThat(rect.leftPx).isEqualTo(250)
        assertThat(rect.topPx).isEqualTo(0)
    }

    @Test
    fun `le zoom reduit le rectangle source`() {
        val rect = ImageCropGeometry.sourceRect(1000, 1000, square, CropTransform(zoom = 2f, offsetX = 0f, offsetY = 0f))
        assertThat(rect.widthPx).isEqualTo(500)
        assertThat(rect.leftPx).isEqualTo(250)
    }

    @Test
    fun `un decalage vers la droite montre la partie gauche de la source`() {
        val t = CropTransform(zoom = 2f, offsetX = 75f, offsetY = 0f)
        val rect = ImageCropGeometry.sourceRect(1000, 1000, square, t)
        assertThat(rect.leftPx).isEqualTo(125)
    }

    @Test
    fun `le rectangle source reste dans l'image meme avec un decalage hors bornes`() {
        val t = CropTransform(zoom = 1f, offsetX = 99_999f, offsetY = -99_999f)
        val rect = ImageCropGeometry.sourceRect(1000, 500, square, t)
        assertThat(rect.leftPx).isAtLeast(0)
        assertThat(rect.topPx).isAtLeast(0)
        assertThat(rect.leftPx + rect.widthPx).isAtMost(1000)
        assertThat(rect.topPx + rect.heightPx).isAtMost(500)
    }

    @Test
    fun `le cadre large donne un rectangle source au rapport du cadre`() {
        val rect = ImageCropGeometry.sourceRect(2000, 2000, banner, CropTransform.initial())
        assertThat(rect.widthPx).isEqualTo(2000)
        assertThat(rect.heightPx.toFloat() / rect.widthPx).isWithin(0.01f).of(130f / 400f)
    }

    @Test
    fun `un pas clavier deplace par pas et reste borne`() {
        val zoomed = CropTransform.initial().zoomed(2f, 1000, 1000, square)
        val moved = zoomed.nudged(CropNudge.RIGHT, 1000, 1000, square)
        assertThat(moved.offsetX).isEqualTo(ImageCropGeometry.NUDGE_STEP_PX)
        val flat = CropTransform.initial().nudged(CropNudge.RIGHT, 1000, 1000, square)
        assertThat(flat.offsetX).isEqualTo(0f)
    }

    @Test
    fun `une image degeneree rend un rectangle vide sans planter`() {
        val rect = ImageCropGeometry.sourceRect(0, 0, square, CropTransform.initial())
        assertThat(rect.widthPx).isEqualTo(0)
    }
}
