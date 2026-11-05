package me.meeshy.sdk.model.fullscreen

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.fullscreen.MediaStageSeek.Zone
import org.junit.Test

class MediaStageSeekTest {
    @Test fun `les tiers lateraux sont les seules zones actives`() {
        assertThat(MediaStageSeek.zone(10f, 300f)).isEqualTo(Zone.Backward)
        assertThat(MediaStageSeek.zone(150f, 300f)).isEqualTo(Zone.Center)
        assertThat(MediaStageSeek.zone(250f, 300f)).isEqualTo(Zone.Forward)
    }

    @Test fun `gauche recule de dix secondes et droite avance de dix`() {
        assertThat(MediaStageSeek.resolve(10f, 300f, 30.0, 100.0)!!.to).isEqualTo(20.0)
        assertThat(MediaStageSeek.resolve(290f, 300f, 30.0, 100.0)!!.seconds).isEqualTo(10.0)
    }

    @Test fun `le centre ne fait rien pour ne pas retarder le tap simple`() {
        assertThat(MediaStageSeek.resolve(150f, 300f, 30.0, 100.0)).isNull()
    }

    @Test fun `un media sans duree laisse le double tap au zoom`() {
        assertThat(MediaStageSeek.resolve(10f, 300f, 0.0, 0.0)).isNull()
        assertThat(MediaStageSeek.resolve(10f, 300f, 0.0, Double.NaN)).isNull()
    }

    @Test fun `la cible est bornee a la duree`() {
        assertThat(MediaStageSeek.resolve(10f, 300f, 4.0, 100.0)!!.to).isEqualTo(0.0)
        assertThat(MediaStageSeek.resolve(290f, 300f, 95.0, 100.0)!!.to).isEqualTo(100.0)
    }
}
