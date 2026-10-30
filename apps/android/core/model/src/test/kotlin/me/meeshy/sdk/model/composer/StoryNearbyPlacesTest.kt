package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.location.AddressParts
import me.meeshy.sdk.model.location.GeoPoint
import org.junit.Test

/** Les lieux alentour (#13846, iOS `StickerNearbyPlaces`) : cinq lieux dans 400 m, l'endroit exact en tête, rien sans position. */
class StoryNearbyPlacesTest {

    private val origin = GeoPoint(48.8566, 2.3522)

    private fun at(metersNorth: Double, name: String?, street: String? = "Rue de Rivoli", locality: String? = "Paris") = NearbyAddress(
        point = GeoPoint(origin.latitude + metersNorth / 111_320.0, origin.longitude),
        parts = AddressParts(featureName = name, thoroughfare = street, locality = locality),
    )

    @Test
    fun `without a position nothing is proposed`() {
        assertThat(StoryNearbyPlaces.places(origin = null, around = listOf(at(10.0, "Café")), hereName = "Ma position")).isEmpty()
    }

    @Test
    fun `the exact place comes first, named by its number and street, located by its town`() {
        val places = StoryNearbyPlaces.places(origin, listOf(at(0.0, "12", street = "Rue de Rivoli")), hereName = "Ma position")
        assertThat(places.first().name).isEqualTo("12 Rue de Rivoli")
        assertThat(places.first().address).isEqualTo("Paris")
        assertThat(places.first().latitude).isEqualTo(origin.latitude)
    }

    @Test
    fun `without a known street the exact place is called my position`() {
        val places = StoryNearbyPlaces.places(origin, emptyList(), hereName = "Ma position")
        assertThat(places.map { it.name }).containsExactly("Ma position")
        assertThat(places.single().address).isNull()
    }

    @Test
    fun `five named places within 400 m, nearest first, the far and the nameless left out`() {
        val around = listOf(
            at(0.0, "1"),
            at(350.0, "Louvre"),
            at(50.0, "Café"),
            at(390.0, "Musée"),
            at(120.0, "Square"),
            at(200.0, "Pont"),
            at(300.0, "Gare"),
            at(500.0, "Trop loin"),
            at(80.0, "Paris"),
            at(90.0, "café"),
        )
        val names = StoryNearbyPlaces.places(origin, around, hereName = "Ma position").map { it.name }
        assertThat(names).containsExactly("1 Rue de Rivoli", "Café", "Square", "Pont", "Gare", "Louvre").inOrder()
        assertThat(names.drop(1)).hasSize(StoryNearbyPlaces.MAX_PLACES)
    }

    @Test
    fun `a nearby place reads its street and town as its address`() {
        val place = StoryNearbyPlaces.places(origin, listOf(at(60.0, "Café")), hereName = "Ma position")[1]
        assertThat(place.address).isEqualTo("Rue de Rivoli, Paris")
    }
}
