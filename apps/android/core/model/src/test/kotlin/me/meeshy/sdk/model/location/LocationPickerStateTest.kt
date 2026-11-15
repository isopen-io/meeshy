package me.meeshy.sdk.model.location

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.LocationPrecision
import me.meeshy.sdk.model.PlaceCoarseNames
import org.junit.Test

class LocationPickerStateTest {
    private val paris = GeoPoint(48.8566, 2.3522)
    private val lyon = GeoPoint(45.7640, 4.8357)

    @Test
    fun `deplacer la carte choisit un point et lance le geocodage`() {
        val s = LocationPickerState().moved(paris)
        assertThat(s.selected).isEqualTo(paris)
        assertThat(s.isGeocoding).isTrue()
    }

    @Test
    fun `republier le meme centre ne change rien`() {
        val s = LocationPickerState().moved(paris).geocoded(paris, "Paris", PlaceCoarseNames.EMPTY)
        assertThat(s.moved(GeoPoint(paris.latitude + 1e-9, paris.longitude))).isSameInstanceAs(s)
    }

    @Test
    fun `quitter un resultat nomme abandonne son nom`() {
        val chosen = LocationPickerState().chosen(LocationSearchResult(paris, "Tour Eiffel", "Paris", "landmark"))
        val moved = chosen.moved(lyon)
        assertThat(moved.name).isNull()
        assertThat(moved.category).isNull()
        assertThat(moved.address).isNull()
    }

    @Test
    fun `un resultat choisi vide la liste et garde nom et categorie`() {
        val withResults = LocationPickerState().withResults(
            List(12) { LocationSearchResult(paris, "n$it", null) },
        )
        assertThat(withResults.results).hasSize(LocationSearchPlan.MAX_RESULTS)
        val chosen = withResults.chosen(LocationSearchResult(paris, "Tour Eiffel", "Paris", "landmark"))
        assertThat(chosen.results).isEmpty()
        assertThat(chosen.rawPlace?.name).isEqualTo("Tour Eiffel")
        assertThat(chosen.rawPlace?.category).isEqualTo("landmark")
    }

    @Test
    fun `une reponse de geocodage perimee est ignoree`() {
        val s = LocationPickerState().moved(paris).moved(lyon)
        val stale = s.geocoded(paris, "Paris", PlaceCoarseNames.EMPTY)
        assertThat(stale.address).isNull()
        assertThat(stale.isGeocoding).isTrue()
        assertThat(s.geocoded(lyon, "Lyon", PlaceCoarseNames.EMPTY).address).isEqualTo("Lyon")
    }

    @Test
    fun `un echec de geocodage cesse d'attendre sans adresse`() {
        val s = LocationPickerState().moved(paris).geocodeFailed(paris)
        assertThat(s.isGeocoding).isFalse()
        assertThat(s.selected).isEqualTo(paris)
    }

    @Test
    fun `le premier releve centre le selecteur sans ecraser un point deja choisi`() {
        assertThat(LocationPickerState().userFixed(paris).selected).isEqualTo(paris)
        val already = LocationPickerState().moved(lyon).userFixed(paris)
        assertThat(already.selected).isEqualTo(lyon)
        assertThat(already.userLocation).isEqualTo(paris)
        assertThat(already.access).isEqualTo(LocationAccess.GRANTED)
    }

    @Test
    fun `la precision est appliquee au lieu partage`() {
        val s = LocationPickerState().moved(GeoPoint(48.85661, 2.35222))
        val exact = s.place(LocationPrecision.EXACT)
        val city = s.place(LocationPrecision.CITY)
        assertThat(exact?.latitude).isEqualTo(48.85661)
        assertThat(city?.latitude).isEqualTo(48.9)
    }

    @Test
    fun `un lieu nomme confirme a environ 100 m ne livre ni son nom ni sa rue ni sa categorie`() {
        val names = PlaceCoarseNames(subLocality = "Gros-Caillou", locality = "Paris", country = "France")
        val s = LocationPickerState()
            .chosen(LocationSearchResult(paris, "Chez Marcel", "12 rue Cler, 75007 Paris", "restaurant"))
            .geocoded(paris, "12 rue Cler, 75007 Paris", names)

        val sent = s.place(LocationPrecision.AROUND)!!

        assertThat(sent.name).isEqualTo("Gros-Caillou")
        assertThat(sent.address).isEqualTo("Paris, France")
        assertThat(sent.category).isNull()
    }

    @Test
    fun `sans point choisi il n'y a rien a envoyer`() {
        assertThat(LocationPickerState().place(LocationPrecision.EXACT)).isNull()
    }

    @Test
    fun `un refus est expose`() {
        assertThat(LocationPickerState().withAccess(LocationAccess.DENIED).isLocationRefused).isTrue()
        assertThat(LocationPickerState().isLocationRefused).isFalse()
    }
}
