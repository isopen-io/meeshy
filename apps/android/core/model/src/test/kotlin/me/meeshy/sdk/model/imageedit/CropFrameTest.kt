package me.meeshy.sdk.model.imageedit

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CropFrameTest {
    private val display = CropRect(0f, 0f, 400f, 300f)

    @Test fun `les chips pro n'apparaissent qu'en mode pro`() {
        assertThat(CropRatio.available(false)).doesNotContain(CropRatio.RATIO_9_16)
        assertThat(CropRatio.available(true)).hasSize(5)
        assertThat(CropRatio.available(true).first()).isEqualTo(CropRatio.FREE)
    }

    @Test fun `le cadre initial en ratio occupe 92 pour cent et est centre`() {
        val r = CropFrame.initial(null, 1.0, display)
        assertThat(r.height).isWithin(1e-3f).of(300f * 0.92f)
        assertThat(r.centerX).isWithin(1e-3f).of(200f)
    }

    @Test fun `sans ratio ni recadrage le cadre est l'image entiere`() {
        assertThat(CropFrame.initial(null, null, display)).isEqualTo(display)
    }

    @Test fun `un recadrage enregistre est restitue`() {
        val r = CropFrame.initial(NormalizedCrop(0.25f, 0.5f, 0.5f, 0.25f), null, display)
        assertThat(r).isEqualTo(CropRect(100f, 150f, 200f, 75f))
    }

    @Test fun `changer de ratio recentre et garde le ratio`() {
        val r = CropFrame.adjustedToRatio(CropRect(50f, 50f, 300f, 200f), 1.0, display)
        assertThat(r.width / r.height).isWithin(1e-3f).of(1f)
        assertThat(r.centerX).isWithin(1e-3f).of(200f)
    }

    @Test fun `ouvrir puis fermer sans toucher ne cuit rien`() {
        assertThat(CropFrame.bake(false, false, display, display)).isNull()
    }

    @Test fun `un cadre touche est cuit et un cadre plein devient null`() {
        val half = CropFrame.bake(true, false, CropRect(100f, 75f, 200f, 150f), display)!!
        assertThat(half.crop).isEqualTo(NormalizedCrop(0.25f, 0.25f, 0.5f, 0.5f))
        assertThat(CropFrame.bake(true, false, display, display)!!.crop).isNull()
    }

    @Test fun `un recadrage existant est recuit meme sans nouvelle saisie`() {
        assertThat(CropFrame.bake(false, true, CropRect(100f, 75f, 200f, 150f), display)).isNotNull()
    }
}
