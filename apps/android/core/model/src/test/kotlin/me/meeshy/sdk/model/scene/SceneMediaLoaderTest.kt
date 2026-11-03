package me.meeshy.sdk.model.scene

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class SceneMediaLoaderTest {

    @Test
    fun `une photo de 4000 par 3000 est sous-echantillonnee par quatre`() {
        assertThat(SceneMediaLoader.sampleSize(4000, 3000)).isEqualTo(4)
    }

    @Test
    fun `une photo qui tient dans 1080 n'est pas sous-echantillonnee`() {
        assertThat(SceneMediaLoader.sampleSize(1080, 720)).isEqualTo(1)
        assertThat(SceneMediaLoader.sampleSize(720, 1080)).isEqualTo(1)
    }

    @Test
    fun `un pixel de trop sur le grand cote double le facteur`() {
        assertThat(SceneMediaLoader.sampleSize(1081, 500)).isEqualTo(2)
    }

    @Test
    fun `le grand cote decode ne depasse jamais 1080`() {
        listOf(1081 to 1, 3000 to 4000, 8000 to 6000, 12000 to 9000, 100 to 20000).forEach { (w, h) ->
            val sample = SceneMediaLoader.sampleSize(w, h)
            assertThat(maxOf(w, h) / sample).isAtMost(1080)
        }
    }

    @Test
    fun `des dimensions degenerees ne sous-echantillonnent pas`() {
        assertThat(SceneMediaLoader.sampleSize(0, 0)).isEqualTo(1)
        assertThat(SceneMediaLoader.sampleSize(-5, 100)).isEqualTo(1)
    }

    @Test
    fun `la taille finale garde le ratio et plafonne le grand cote`() {
        assertThat(SceneMediaLoader.boundedSize(4000, 3000)).isEqualTo(1080 to 810)
        assertThat(SceneMediaLoader.boundedSize(3000, 4000)).isEqualTo(810 to 1080)
    }

    @Test
    fun `la taille finale d'une photo qui tient est inchangee`() {
        assertThat(SceneMediaLoader.boundedSize(800, 600)).isEqualTo(800 to 600)
    }

    @Test
    fun `une video portrait stockee en paysage est mesuree debout`() {
        val measure = SceneVideoMeasure.of(1920, 1080, 90, 12_500)!!
        assertThat(measure.width).isEqualTo(1080)
        assertThat(measure.height).isEqualTo(1920)
        assertThat(measure.aspectRatio).isWithin(1e-9).of(1080.0 / 1920.0)
        assertThat(measure.durationSeconds).isEqualTo(12.5)
    }

    @Test
    fun `une rotation de 270 ou negative echange aussi les dimensions et 180 non`() {
        assertThat(SceneVideoMeasure.of(1920, 1080, 270, null)!!.width).isEqualTo(1080)
        assertThat(SceneVideoMeasure.of(1920, 1080, -90, null)!!.width).isEqualTo(1080)
        assertThat(SceneVideoMeasure.of(1920, 1080, 180, null)!!.width).isEqualTo(1920)
        assertThat(SceneVideoMeasure.of(1920, 1080, null, null)!!.width).isEqualTo(1920)
    }

    @Test
    fun `une video sans dimensions n'a pas de mesure et une duree nulle est inconnue`() {
        assertThat(SceneVideoMeasure.of(null, 1080, 0, 1000)).isNull()
        assertThat(SceneVideoMeasure.of(0, 1080, 0, 1000)).isNull()
        assertThat(SceneVideoMeasure.of(1920, 1080, 0, 0)!!.durationSeconds).isNull()
    }
}
