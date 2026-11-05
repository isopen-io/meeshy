package me.meeshy.sdk.model.fullscreen

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.fullscreen.MediaStageFraming.Corridors
import me.meeshy.sdk.model.fullscreen.MediaStageFraming.Input
import me.meeshy.sdk.model.fullscreen.MediaStageFraming.Presentation
import me.meeshy.sdk.model.fullscreen.MediaStageFraming.Size
import org.junit.Test

class MediaStageFramingTest {
    private val corridors = Corridors(safeTop = 40f, top = 56f, rail = FilmstripLayout.RESERVED_HEIGHT_DP, transport = 48f, safeBottom = 20f, gutter = 12f)
    private fun input(ratio: Float, p: Presentation = Presentation.Carded, minH: Float = 0f, minW: Float = 0f, c: Corridors = corridors) =
        Input(Size(400f, 800f), ratio, c, p, 24f, minH, minW)

    @Test fun `la pellicule reserve 80 dp`() {
        assertThat(FilmstripLayout.RESERVED_HEIGHT_DP).isEqualTo(80f)
    }

    @Test fun `les couloirs sont reserves avant le cadre`() {
        val r = MediaStageFraming.resolve(input(1f))
        assertThat(r.frame.height).isAtMost(800f - corridors.reservedHeight)
        assertThat(r.cornerRadius).isEqualTo(24f)
    }

    @Test fun `le plein cadre prend tout le viewport a coins droits`() {
        val r = MediaStageFraming.resolve(input(1f, Presentation.Full))
        assertThat(r.frame).isEqualTo(Size(400f, 800f))
        assertThat(r.media).isEqualTo(Size(400f, 400f))
        assertThat(r.cornerRadius).isEqualTo(0f)
    }

    @Test fun `les planchers ne touchent que le cadre et restent bornes a la region`() {
        val r = MediaStageFraming.resolve(input(4f, minH = 300f, minW = 100f))
        assertThat(r.media.height).isLessThan(300f)
        assertThat(r.frame.height).isEqualTo(300f)
        val tight = MediaStageFraming.resolve(input(4f, minH = 9999f))
        assertThat(tight.frame.height).isEqualTo(800f - corridors.reservedHeight)
    }

    @Test fun `la region reservee ne depend pas du ratio`() {
        val region = 800f - corridors.reservedHeight
        listOf(0.5f, 1f, 2f).forEach { ratio ->
            val r = MediaStageFraming.resolve(input(ratio, minH = 9999f, minW = 9999f))
            assertThat(r.frame).isEqualTo(Size(400f - 24f, region))
        }
    }

    @Test fun `un ratio ou un viewport nul ne rend rien`() {
        assertThat(MediaStageFraming.resolve(input(0f))).isEqualTo(MediaStageFraming.Zero)
        assertThat(MediaStageFraming.resolve(input(1f, c = corridors.copy(top = 5000f)))).isEqualTo(MediaStageFraming.Zero)
    }

    @Test fun `fitted plie le cadre au conteneur mesure sans agrandir le media`() {
        val r = MediaStageFraming.resolve(input(1f, Presentation.Full)).fitted(Size(200f, 800f))
        assertThat(r.frame).isEqualTo(Size(200f, 800f))
        assertThat(r.media).isEqualTo(Size(200f, 200f))
    }

    @Test fun `coverScale ne descend jamais sous un`() {
        assertThat(MediaStageFraming.coverScale(Size(100f, 100f), Size(200f, 200f))).isEqualTo(1f)
        assertThat(MediaStageFraming.coverScale(Size(400f, 400f), Size(400f, 200f))).isEqualTo(2f)
    }
}
