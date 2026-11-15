package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class StoryViewerCardTransformTest {

    private val travel = 350f
    private val height = 2000f

    private fun frame(appear: Float = 1f, dragY: Float = 0f, dismissal: Float = 0f) =
        StoryViewerCardTransform.frame(appear, dragY, dismissal, height, travel)

    @Test
    fun `la carte s ouvre a 0,92 avec un coin de 24 dp puis grandit jusqu au plein ecran`() {
        val closed = frame(appear = 0f)
        assertThat(closed.scale).isWithin(1e-5f).of(0.92f)
        assertThat(closed.cornerDp).isWithin(1e-5f).of(24f)
        val open = frame(appear = 1f)
        assertThat(open.scale).isEqualTo(1f)
        assertThat(open.cornerDp).isEqualTo(0f)
        assertThat(open.alpha).isEqualTo(1f)
        assertThat(open.offsetY).isEqualTo(0f)
    }

    @Test
    fun `la carte suit le doigt un pour un, echelle 1 moins 0,35 p, coin jusqu a 36 dp, opacite 1 moins 0,3 p`() {
        val half = frame(dragY = 175f)
        assertThat(half.offsetY).isEqualTo(175f)
        assertThat(half.scale).isWithin(1e-5f).of(1f - 0.5f * 0.35f)
        assertThat(half.cornerDp).isWithin(1e-4f).of(18f)
        assertThat(half.alpha).isWithin(1e-5f).of(1f - 0.5f * 0.3f)
        val full = frame(dragY = 900f)
        assertThat(full.scale).isWithin(1e-5f).of(0.65f)
        assertThat(full.cornerDp).isWithin(1e-4f).of(36f)
        assertThat(full.alpha).isWithin(1e-5f).of(0.7f)
    }

    @Test
    fun `la sortie continue le geste vers le bas a 35 pour cent de la hauteur, echelle 0,12, fondu a zero`() {
        val gone = frame(dragY = 100f, dismissal = 1f)
        assertThat(gone.scale).isWithin(1e-5f).of(0.12f)
        assertThat(gone.offsetY).isWithin(1e-3f).of(700f)
        assertThat(gone.alpha).isEqualTo(0f)
        assertThat(gone.cornerDp).isEqualTo(32f)
        assertThat(frame(dismissal = 0.5f).alpha).isWithin(1e-5f).of(0.5f)
    }

    @Test
    fun `le son fond de plein a zero pendant la sortie`() {
        assertThat(StoryViewerCardTransform.audioGain(0f)).isEqualTo(1f)
        assertThat(StoryViewerCardTransform.audioGain(0.25f)).isWithin(1e-5f).of(0.75f)
        assertThat(StoryViewerCardTransform.audioGain(1f)).isEqualTo(0f)
        assertThat(StoryViewerCardTransform.AUDIO_FADE_MS).isEqualTo(400)
    }
}
