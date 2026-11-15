package me.meeshy.sdk.model.media

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class MediaCropReadinessTest {

    @Test
    fun `pas de pastille de proportion sans ratio mesure`() {
        assertThat(MediaCropReadiness.ratioPadsMayAct(null)).isFalse()
        assertThat(MediaCropReadiness.ratioPadsMayAct(0.0)).isFalse()
        assertThat(MediaCropReadiness.ratioPadsMayAct(-1.0)).isFalse()
        assertThat(MediaCropReadiness.ratioPadsMayAct(Double.NaN)).isFalse()
        assertThat(MediaCropReadiness.ratioPadsMayAct(Double.POSITIVE_INFINITY)).isFalse()
    }

    @Test
    fun `un ratio mesure autorise les pastilles`() {
        assertThat(MediaCropReadiness.ratioPadsMayAct(1.78)).isTrue()
    }

    @Test
    fun `libre reste offert sans mesure, les autres non`() {
        assertThat(MediaCropReadiness.mayAct(MediaCropRatio.FREE, null)).isTrue()
        assertThat(MediaCropReadiness.mayAct(MediaCropRatio.PORTRAIT_9_16, null)).isFalse()
        assertThat(MediaCropReadiness.mayAct(MediaCropRatio.PORTRAIT_9_16, 1.78)).isTrue()
    }
}
