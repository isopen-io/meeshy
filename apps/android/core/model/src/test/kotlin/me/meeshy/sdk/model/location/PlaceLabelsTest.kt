package me.meeshy.sdk.model.location

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.SharedPlace
import org.junit.Test

class PlaceLabelsTest {
    @Test
    fun `nom puis adresse sans doublon`() {
        assertThat(PlaceLabels.infoLines("Louvre", "Paris")).isEqualTo("Louvre" to "Paris")
        assertThat(PlaceLabels.infoLines("Paris", "Paris")).isEqualTo("Paris" to null)
        assertThat(PlaceLabels.infoLines(null, " Rue X ")).isEqualTo("Rue X" to null)
        assertThat(PlaceLabels.infoLines("  ", null)).isEqualTo(null to null)
    }

    @Test
    fun `le titre deduplique nom et adresse`() {
        assertThat(PlaceLabels.title("Louvre", "Rue de Rivoli, Paris")).isEqualTo("Louvre · Rue de Rivoli, Paris")
        assertThat(PlaceLabels.title("Louvre", "Musée du louvre, Paris")).isEqualTo("Musée du louvre, Paris")
        assertThat(PlaceLabels.title(null, "Paris")).isEqualTo("Paris")
        assertThat(PlaceLabels.title("Louvre", null)).isEqualTo("Louvre")
        assertThat(PlaceLabels.title(null, null)).isNull()
    }

    @Test
    fun `le lien geo porte l'etiquette sans parentheses parasites`() {
        val p = SharedPlace(1.0, 2.0, name = "Chez (Paul)")
        assertThat(PlaceLabels.geoUri(p)).isEqualTo("geo:1.0,2.0?q=1.0,2.0(Chez Paul)")
        assertThat(PlaceLabels.geoUri(SharedPlace(1.0, 2.0))).isEqualTo("geo:1.0,2.0?q=1.0,2.0")
    }

    @Test
    fun `l'itineraire vise les coordonnees`() {
        assertThat(PlaceLabels.navigationUri(SharedPlace(1.5, -2.5))).isEqualTo("google.navigation:q=1.5,-2.5")
    }

    @Test
    fun `l'adresse copiable prefere le nom puis l'adresse puis les coordonnees`() {
        assertThat(PlaceLabels.copyableAddress(SharedPlace(1.0, 2.0, "N", "A"))).isEqualTo("N")
        assertThat(PlaceLabels.copyableAddress(SharedPlace(1.0, 2.0, null, "A"))).isEqualTo("A")
        assertThat(PlaceLabels.copyableAddress(SharedPlace(1.0, 2.0))).isEqualTo("1.0, 2.0")
    }

    @Test
    fun `les coordonnees suivent la precision et la locale racine`() {
        assertThat(PlaceLabels.coordinates(SharedPlace(48.9, 2.4), 1)).isEqualTo("48.9, 2.4")
        assertThat(PlaceLabels.coordinates(SharedPlace(48.9, 2.4), null)).isEqualTo("48.90000, 2.40000")
    }

    @Test
    fun `un lieu seul suffit a envoyer`() {
        assertThat(ComposerSendEligibility.canSend("  ", false, true)).isTrue()
        assertThat(ComposerSendEligibility.canSend("  ", false, false)).isFalse()
        assertThat(ComposerSendEligibility.canSend("", true, false)).isTrue()
        assertThat(ComposerSendEligibility.canSend("a", false, false)).isTrue()
    }

    @Test
    fun `le pin se soulevre pendant le geste`() {
        val rest = MapPinLift.style(false)
        val lifted = MapPinLift.style(true)
        assertThat(lifted.scale).isGreaterThan(rest.scale)
        assertThat(lifted.yOffsetDp).isLessThan(rest.yOffsetDp)
        assertThat(lifted.shadowScale).isLessThan(rest.shadowScale)
        assertThat(lifted.shadowAlpha).isLessThan(rest.shadowAlpha)
    }
}
