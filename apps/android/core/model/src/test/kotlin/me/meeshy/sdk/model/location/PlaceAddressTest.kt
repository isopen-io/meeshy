package me.meeshy.sdk.model.location

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class PlaceAddressTest {
    @Test
    fun `l'adresse joint nom voie localite pays sans doublon`() {
        val a = PlaceAddress.compose(AddressParts("Tour Eiffel", "Avenue Anatole France", locality = "Paris", country = "France"))
        assertThat(a.text).isEqualTo("Tour Eiffel, Avenue Anatole France, Paris, France")
        val dup = PlaceAddress.compose(AddressParts("Paris", locality = "Paris", country = "France"))
        assertThat(dup.text).isEqualTo("Paris, France")
    }

    @Test
    fun `un numero de rue n'est pas un nom`() {
        assertThat(PlaceAddress.compose(AddressParts("12", "Rue de la Paix", locality = "Paris")).text)
            .isEqualTo("Rue de la Paix, Paris")
    }

    @Test
    fun `les composants restent separes pour la degradation`() {
        val c = PlaceAddress.compose(AddressParts(subLocality = "Gros-Caillou", locality = "Paris", administrativeArea = "IdF", country = "France")).coarse
        assertThat(c.subLocality).isEqualTo("Gros-Caillou")
        assertThat(c.administrativeArea).isEqualTo("IdF")
    }

    @Test
    fun `sans rien il n'y a pas d'adresse`() {
        assertThat(PlaceAddress.compose(AddressParts()).text).isNull()
    }

    @Test
    fun `un resultat de recherche garde un vrai nom et la ligne complete`() {
        val p = GeoPoint(1.0, 2.0)
        val r = PlaceAddress.searchResult(p, AddressParts("Louvre", locality = "Paris", addressLines = listOf("Rue de Rivoli", "75001 Paris")))
        assertThat(r.name).isEqualTo("Louvre")
        assertThat(r.address).isEqualTo("Rue de Rivoli, 75001 Paris")
        assertThat(PlaceAddress.searchResult(p, AddressParts("Paris", locality = "Paris")).name).isNull()
        assertThat(PlaceAddress.searchResult(p, AddressParts("7")).name).isNull()
    }
}
