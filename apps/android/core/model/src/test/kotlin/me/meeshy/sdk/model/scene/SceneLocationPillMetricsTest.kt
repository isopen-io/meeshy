package me.meeshy.sdk.model.scene

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.SharedPlace
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

@RunWith(JUnit4::class)
class SceneLocationPillMetricsTest {

    @Test
    fun `a 1080 de large les mesures sont celles du design`() {
        val m = SceneLocationPillMetrics.measures(renderedWidth = 1080.0, scale = 1.0)
        assertThat(m.fontSize).isWithin(1e-9).of(42.0)
        assertThat(m.horizontalPadding).isWithin(1e-9).of(22.0)
        assertThat(m.verticalPadding).isWithin(1e-9).of(14.0)
        assertThat(m.gap).isWithin(1e-9).of(10.0)
        assertThat(m.pinSide).isWithin(1e-9).of(42.0)
    }

    @Test
    fun `deux largeurs rendues donnent des mesures proportionnelles`() {
        val phone = SceneLocationPillMetrics.measures(renderedWidth = 412.0, scale = 1.5)
        val tablet = SceneLocationPillMetrics.measures(renderedWidth = 824.0, scale = 1.5)
        assertThat(tablet.fontSize / phone.fontSize).isWithin(1e-9).of(2.0)
        assertThat(tablet.horizontalPadding / phone.horizontalPadding).isWithin(1e-9).of(2.0)
        assertThat(phone.fontSize).isWithin(1e-9).of(42.0 * 1.5 * 412.0 / 1080.0)
    }

    @Test
    fun `une largeur ou une echelle degenerees ne donnent jamais NaN`() {
        val m = SceneLocationPillMetrics.measures(renderedWidth = Double.NaN, scale = 1.0)
        assertThat(m.fontSize).isEqualTo(0.0)
        val s = SceneLocationPillMetrics.measures(renderedWidth = 540.0, scale = Double.NaN)
        assertThat(s.fontSize.isNaN()).isFalse()
    }

    @Test
    fun `la taille de la capsule ajoute marges epingle et espacement au texte`() {
        val m = SceneLocationPillMetrics.measures(1080.0, 1.0)
        val size = SceneLocationPillMetrics.pillSize(m, textWidth = 200.0, textHeight = 50.0, renderedWidth = 1080.0)
        assertThat(size.width).isEqualTo(Math.ceil(22.0 * 2 + 42.0 + 10.0 + 200.0))
        assertThat(size.height).isEqualTo(Math.ceil(14.0 * 2 + 50.0))
    }

    @Test
    fun `un nom long est tronque a neuf dixiemes de la scene`() {
        val m = SceneLocationPillMetrics.measures(540.0, 1.0)
        val size = SceneLocationPillMetrics.pillSize(m, textWidth = 5000.0, textHeight = 20.0, renderedWidth = 540.0)
        assertThat(size.width).isAtMost(540.0 * 0.9 + 1.0)
        val room = SceneLocationPillMetrics.maxTextWidth(m, 540.0)
        assertThat(room).isGreaterThan(0.0)
        assertThat(m.horizontalPadding * 2 + m.pinSide + m.gap + room).isWithin(1e-9).of(540.0 * 0.9)
    }

    @Test
    fun `le libelle prend le nom puis l adresse puis le repli`() {
        assertThat(SceneLocationPillMetrics.label(SharedPlace(1.0, 2.0, name = "Paris", address = "rue X"), "Ici")).isEqualTo("Paris")
        assertThat(SceneLocationPillMetrics.label(SharedPlace(1.0, 2.0, name = " ", address = "rue X"), "Ici")).isEqualTo("rue X")
        assertThat(SceneLocationPillMetrics.label(SharedPlace(1.0, 2.0), "Ici")).isEqualTo("Ici")
    }

    @Test
    fun `le gabarit de lieu du catalogue est retenu, tout autre retombe sur la capsule native`() {
        assertThat(SceneLocationPillMetrics.templateId(null)).isNull()
        assertThat(SceneLocationPillMetrics.templateId("location.postcard")).isEqualTo("location.postcard")
        assertThat(SceneLocationPillMetrics.templateId("time.digital")).isNull()
        assertThat(SceneLocationPillMetrics.templateId("location.inconnu")).isNull()
    }

    @Test
    fun `les emplacements d un gabarit portent le nom puis le detail`() {
        val slots = SceneLocationPillMetrics.slots(SharedPlace(1.0, 2.0, name = "Louvre", address = "Rue de Rivoli"), "Ici")
        assertThat(slots).containsExactly("placeName", "Louvre", "placeDetail", "Rue de Rivoli")
        val unnamed = SceneLocationPillMetrics.slots(SharedPlace(1.0, 2.0, address = "Rue de Rivoli"), "Ici")
        assertThat(unnamed).containsExactly("placeName", "Rue de Rivoli", "placeDetail", "")
        val bare = SceneLocationPillMetrics.slots(SharedPlace(1.0, 2.0), "Ici")
        assertThat(bare).containsExactly("placeName", "Ici", "placeDetail", "")
    }
}
