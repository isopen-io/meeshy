package me.meeshy.sdk.model.imageedit

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CropGeometryTest {
    private val bounds = CropRect(0f, 0f, 400f, 300f)
    private val frame = CropRect(100f, 100f, 200f, 100f)
    private fun resize(h: CropOverlayHandle, dx: Float, dy: Float, ratio: Double? = null) =
        CropGeometry.resized(frame, h, CropSize(dx, dy), ratio, 56f)

    @Test fun `le coin haut gauche libre deplace l'origine et reduit le cadre`() {
        assertThat(resize(CropOverlayHandle.TOP_LEFT, 10f, 20f)).isEqualTo(CropRect(110f, 120f, 190f, 80f))
    }

    @Test fun `le coin bas droit en mode ratio garde le ratio`() {
        val r = resize(CropOverlayHandle.BOTTOM_RIGHT, 40f, 10f, 2.0)
        assertThat(r.width / r.height).isWithin(1e-4f).of(2f)
        assertThat(r.width).isEqualTo(240f)
    }

    @Test fun `le bord gauche ne touche que la largeur`() {
        assertThat(resize(CropOverlayHandle.LEFT, 30f, 99f)).isEqualTo(CropRect(130f, 100f, 170f, 100f))
    }

    @Test fun `le centre deplace le cadre entier`() {
        assertThat(resize(CropOverlayHandle.CENTER, 5f, -5f)).isEqualTo(CropRect(105f, 95f, 200f, 100f))
    }

    @Test fun `un redimensionnement sous la taille minimale est refuse`() {
        assertThat(resize(CropOverlayHandle.RIGHT, -190f, 0f)).isEqualTo(frame)
        assertThat(resize(CropOverlayHandle.NONE, 10f, 10f)).isEqualTo(frame)
    }

    @Test fun `constrained ramene le cadre dans les bornes`() {
        val r = CropGeometry.constrained(CropRect(350f, -20f, 100f, 100f), bounds, 56f)
        assertThat(r).isEqualTo(CropRect(300f, 0f, 100f, 100f))
    }

    @Test fun `constrained impose la taille minimale`() {
        assertThat(CropGeometry.constrained(CropRect(10f, 10f, 5f, 5f), bounds, 56f).width).isEqualTo(56f)
    }

    @Test fun `le pas vaut un pour cent des bornes`() {
        assertThat(CropGeometry.step(bounds)).isEqualTo(CropSize(4f, 3f))
    }

    @Test fun `outward pousse chaque poignee vers l'exterieur`() {
        val s = CropSize(4f, 3f)
        assertThat(CropGeometry.outward(CropOverlayHandle.TOP_LEFT, s)).isEqualTo(CropSize(-4f, -3f))
        assertThat(CropGeometry.outward(CropOverlayHandle.BOTTOM, s)).isEqualTo(CropSize(0f, 3f))
        assertThat(CropGeometry.outward(CropOverlayHandle.CENTER, s)).isEqualTo(CropSize.ZERO)
    }

    @Test fun `scaledUniformly agrandit autour du centre`() {
        val r = CropGeometry.scaledUniformly(frame, CropSize(4f, 3f), null, true, 56f)
        assertThat(r.width).isEqualTo(208f)
        assertThat(r.centerX).isEqualTo(frame.centerX)
        assertThat(r.width / r.height).isWithin(1e-4f).of(2f)
    }

    @Test fun `scaledUniformly refuse de passer sous le minimum`() {
        assertThat(CropGeometry.scaledUniformly(CropRect(0f, 0f, 58f, 58f), CropSize(4f, 3f), null, false, 56f))
            .isEqualTo(CropRect(0f, 0f, 58f, 58f))
    }

    @Test fun `stepped agrandit un bord et refuse de sortir en ratio`() {
        assertThat(CropGeometry.stepped(frame, CropOverlayHandle.RIGHT, true, null, bounds, 56f)!!.width).isEqualTo(204f)
        val full = CropRect(0f, 0f, 400f, 300f)
        assertThat(CropGeometry.stepped(full, CropOverlayHandle.CENTER, true, null, bounds, 56f)).isNull()
        assertThat(CropGeometry.stepped(full, CropOverlayHandle.RIGHT, true, null, bounds, 56f)).isNull()
    }

    @Test fun `moved decale d'un pas et vaut null au bord`() {
        assertThat(CropGeometry.moved(frame, CropFrameMove.RIGHT, bounds, 56f)!!.left).isEqualTo(104f)
        assertThat(CropGeometry.moved(CropRect(0f, 0f, 100f, 100f), CropFrameMove.LEFT, bounds, 56f)).isNull()
    }

    @Test fun `percentages relatives a l'image`() {
        val p = CropGeometry.percentages(frame, bounds)
        assertThat(p.x).isWithin(1e-6).of(0.25)
        assertThat(p.width).isWithin(1e-6).of(0.5)
        assertThat(CropGeometry.percentages(frame, CropRect(0f, 0f, 0f, 0f)).width).isEqualTo(0.0)
    }

    @Test fun `detectHandle distingue coin bord centre et dehors`() {
        val h = 48f
        assertThat(CropGeometry.detectHandle(frame, 105f, 105f, null, h)).isEqualTo(CropOverlayHandle.TOP_LEFT)
        assertThat(CropGeometry.detectHandle(frame, 200f, 102f, null, h)).isEqualTo(CropOverlayHandle.TOP)
        assertThat(CropGeometry.detectHandle(frame, 200f, 102f, 2.0, h)).isEqualTo(CropOverlayHandle.CENTER)
        assertThat(CropGeometry.detectHandle(frame, 200f, 150f, null, h)).isEqualTo(CropOverlayHandle.CENTER)
        assertThat(CropGeometry.detectHandle(frame, 10f, 10f, null, h)).isEqualTo(CropOverlayHandle.NONE)
    }

    @Test fun `les bords sont absents de l'accessibilite en mode ratio`() {
        assertThat(CropGeometry.accessibleHandles(1.0)).hasSize(5)
        assertThat(CropGeometry.accessibleHandles(null)).hasSize(9)
    }
}
