package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class LocationPrecisionTest {

    private val paris = SharedPlace(
        latitude = 48.856614,
        longitude = 2.352222,
        name = "Tour Eiffel",
        address = "Champ de Mars, Paris",
        category = "monument",
    )

    @Test
    fun `les quatre niveaux annoncent leur rayon et leurs decimales`() {
        assertThat(LocationPrecision.entries.map { it.approximateRadiusMeters })
            .containsExactly(null, 100.0, 1_000.0, 10_000.0).inOrder()
        assertThat(LocationPrecision.entries.map { it.decimalPlaces })
            .containsExactly(null, 3, 2, 1).inOrder()
    }

    @Test
    fun `exact laisse le lieu intact`() {
        assertThat(LocationPrecision.EXACT.coarsen(paris)).isEqualTo(paris)
    }

    @Test
    fun `around arrondit a 3 decimales et garde nom et adresse`() {
        val out = LocationPrecision.AROUND.coarsen(paris)
        assertThat(out.latitude).isEqualTo(48.857)
        assertThat(out.longitude).isEqualTo(2.352)
        assertThat(out.name).isEqualTo("Tour Eiffel")
        assertThat(out.category).isEqualTo("monument")
    }

    @Test
    fun `neighborhood remplace nom et adresse par le quartier et vide la categorie`() {
        val names = PlaceCoarseNames(subLocality = "Gros-Caillou", locality = "Paris", country = "France")
        val out = LocationPrecision.NEIGHBORHOOD.coarsen(paris, names)
        assertThat(out.latitude).isEqualTo(48.86)
        assertThat(out.longitude).isEqualTo(2.35)
        assertThat(out.name).isEqualTo("Gros-Caillou")
        assertThat(out.address).isEqualTo("Paris, France")
        assertThat(out.category).isNull()
    }

    @Test
    fun `neighborhood sans quartier retombe sur la ville sans la repeter`() {
        val names = PlaceCoarseNames(locality = "Paris", country = "France")
        val out = LocationPrecision.NEIGHBORHOOD.coarsen(paris, names)
        assertThat(out.name).isEqualTo("Paris")
        assertThat(out.address).isEqualTo("France")
    }

    @Test
    fun `city arrondit a 1 decimale et ne garde que la zone`() {
        val names = PlaceCoarseNames(locality = "Paris", administrativeArea = "Ile-de-France", country = "France")
        val out = LocationPrecision.CITY.coarsen(paris, names)
        assertThat(out.latitude).isEqualTo(48.9)
        assertThat(out.longitude).isEqualTo(2.4)
        assertThat(out.name).isEqualTo("Paris")
        assertThat(out.address).isEqualTo("Ile-de-France, France")
        assertThat(out.category).isNull()
    }

    @Test
    fun `sans composant le resultat ne porte que les coordonnees arrondies`() {
        val out = LocationPrecision.CITY.coarsen(paris)
        assertThat(out.name).isNull()
        assertThat(out.address).isNull()
        assertThat(out.category).isNull()
    }

    @Test
    fun `l'arrondi est symetrique autour de zero`() {
        assertThat(LocationPrecision.NEIGHBORHOOD.roundCoordinate(-33.8678)).isEqualTo(-33.87)
        assertThat(LocationPrecision.NEIGHBORHOOD.roundCoordinate(33.8678)).isEqualTo(33.87)
        assertThat(LocationPrecision.CITY.roundCoordinate(-0.25)).isEqualTo(-0.3)
        assertThat(LocationPrecision.CITY.roundCoordinate(0.25)).isEqualTo(0.3)
    }

    @Test
    fun `l'erreur d'arrondi reste dans le rayon annonce`() {
        LocationPrecision.entries.drop(1).forEach { level ->
            val dLat = kotlin.math.abs(level.roundCoordinate(paris.latitude) - paris.latitude)
            assertThat(dLat * 111_000.0).isAtMost(level.approximateRadiusMeters!!)
        }
    }

    @Test
    fun `le decodage du stockage est tolerant et par defaut exact`() {
        assertThat(LocationPrecision.fromStorage("city")).isEqualTo(LocationPrecision.CITY)
        assertThat(LocationPrecision.fromStorage("zzz")).isEqualTo(LocationPrecision.EXACT)
        assertThat(LocationPrecision.fromStorage(null)).isEqualTo(LocationPrecision.EXACT)
        assertThat(SharedMapStyle.fromStorage("hybrid")).isEqualTo(SharedMapStyle.HYBRID)
        assertThat(LocationSharingPreferences().precision).isEqualTo(LocationPrecision.EXACT)
    }
}
