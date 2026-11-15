package me.meeshy.sdk.model.fullscreen

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ImageViewerDismissLawTest {

    @Test
    fun `une course de plus de 200 ferme`() {
        assertThat(ImageViewerDismissLaw.outcome(travel = 201f, velocity = 0f, scale = 1f))
            .isEqualTo(ImageViewerDismissOutcome.Dismiss)
        assertThat(ImageViewerDismissLaw.outcome(travel = -201f, velocity = 0f, scale = 1f))
            .isEqualTo(ImageViewerDismissOutcome.Dismiss)
    }

    @Test
    fun `une course de 200 ou moins sans vitesse revient en ressort`() {
        assertThat(ImageViewerDismissLaw.outcome(travel = 200f, velocity = 0f, scale = 1f))
            .isEqualTo(ImageViewerDismissOutcome.SpringBack)
    }

    @Test
    fun `un geste lance ferme avant le seuil`() {
        assertThat(ImageViewerDismissLaw.outcome(travel = 90f, velocity = 2500f, scale = 1f))
            .isEqualTo(ImageViewerDismissOutcome.Dismiss)
    }

    @Test
    fun `un tremblement rapide sans course ne ferme pas`() {
        assertThat(ImageViewerDismissLaw.outcome(travel = 10f, velocity = 4000f, scale = 1f))
            .isEqualTo(ImageViewerDismissOutcome.SpringBack)
    }

    @Test
    fun `une vitesse a contresens ne ferme pas`() {
        assertThat(ImageViewerDismissLaw.outcome(travel = 90f, velocity = -2500f, scale = 1f))
            .isEqualTo(ImageViewerDismissOutcome.SpringBack)
    }

    @Test
    fun `au dela de 1,05 l image se deplace et ne ferme jamais`() {
        assertThat(ImageViewerDismissLaw.isDragEnabled(1.05f)).isTrue()
        assertThat(ImageViewerDismissLaw.isDragEnabled(1.06f)).isFalse()
        assertThat(ImageViewerDismissLaw.outcome(travel = 500f, velocity = 5000f, scale = 1.06f))
            .isEqualTo(ImageViewerDismissOutcome.SpringBack)
    }

    @Test
    fun `le fond s eclaircit avec la course sans devenir transparent`() {
        assertThat(ImageViewerDismissLaw.backdropAlpha(0f)).isEqualTo(1f)
        assertThat(ImageViewerDismissLaw.backdropAlpha(100f)).isWithin(1e-4f).of(0.7f)
        assertThat(ImageViewerDismissLaw.backdropAlpha(900f)).isWithin(1e-4f).of(0.4f)
    }

    @Test
    fun `l avancement est borne entre 0 et 1`() {
        assertThat(ImageViewerDismissLaw.progress(-100f)).isWithin(1e-4f).of(0.5f)
        assertThat(ImageViewerDismissLaw.progress(800f)).isEqualTo(1f)
    }
}
