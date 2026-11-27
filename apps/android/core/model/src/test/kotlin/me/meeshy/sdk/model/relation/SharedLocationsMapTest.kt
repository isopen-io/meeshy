package me.meeshy.sdk.model.relation

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.location.GeoPoint
import me.meeshy.sdk.model.location.SlippyMap
import org.junit.Test

/**
 * La carte des positions qu'on me partage, sur Android (#16985) — la projection PURE, iso `SharedLocationsMapViewModel.swift`
 * (#16983) et `shared-locations-map.tsx` (#16984). Une épingle ne rend jamais rien de plus fin que ce que le serveur a servi.
 */
class SharedLocationsMapTest {
    private val t0 = 1_800_000_000_000L

    private fun entry(
        latitude: Double = 48.85,
        longitude: Double = 2.35,
        precision: SharedLocationPrecision = SharedLocationPrecision.CITY,
        radiusMeters: Double = 12_000.0,
        circle: SharedLocationCircle? = SharedLocationCircle.FRIEND,
        deadline: Long = t0 + 3_600_000L,
    ) = SharedLocationEntry(latitude, longitude, precision, radiusMeters, circle, t0, deadline)

    @Test
    fun `une epingle pose la position, le rayon et la precision servis, jamais plus fins`() {
        val pins = SharedLocationsMap.pins(
            byUser = mapOf("u2" to entry()),
            people = mapOf("u2" to CirclePerson(id = "u2", name = "Awa Diop")),
        )

        assertThat(pins).containsExactly(
            SharedLocationPin(
                userId = "u2",
                point = GeoPoint(48.85, 2.35),
                radiusMeters = 12_000.0,
                precision = SharedLocationPrecision.CITY,
                circle = SharedLocationCircle.FRIEND,
                name = "Awa Diop",
                initials = "AD",
                deadlineMillis = t0 + 3_600_000L,
            ),
        )
    }

    @Test
    fun `une personne que l'annuaire ne connait pas reste sans nom, et se range apres les noms connus`() {
        val pins = SharedLocationsMap.pins(
            byUser = mapOf("zz" to entry(), "u3" to entry(), "u2" to entry()),
            people = mapOf("u3" to CirclePerson(id = "u3", name = "Bruno"), "u2" to CirclePerson(id = "u2", name = "awa")),
        )

        assertThat(pins.map { it.userId }).containsExactly("u2", "u3", "zz").inOrder()
        assertThat(pins.last().name).isNull()
        assertThat(pins.last().initials).isEqualTo("?")
    }

    @Test
    fun `les initiales prennent les deux premiers mots, en majuscules`() {
        assertThat(SharedLocationsMap.initials("jean paul sartre")).isEqualTo("JP")
        assertThat(SharedLocationsMap.initials("  ")).isEqualTo("?")
        assertThat(SharedLocationsMap.initials("Zoé")).isEqualTo("Z")
    }

    @Test
    fun `l'emprise visible se dit au format de la passerelle, et une emprise qui franchit l'antimeridien couvre le monde`() {
        val paris = SharedLocationsMap.viewport(GeoPoint(48.85, 2.35), zoom = 10, widthPx = 400, heightPx = 240, tileSize = 256)
        val pacific = SharedLocationsMap.viewport(GeoPoint(0.0, 179.9), zoom = 5, widthPx = 400, heightPx = 240, tileSize = 256)

        assertThat(paris).isNotNull()
        assertThat(paris!!.contains(48.85, 2.35)).isTrue()
        assertThat(paris.contains(48.85, 3.0)).isFalse()
        assertThat(pacific).isNull()
    }

    @Test
    fun `le cadrage d'une seule epingle s'y centre, celui de plusieurs les montre toutes`() {
        val one = SharedLocationsMap.fit(listOf(GeoPoint(48.85, 2.35)), widthPx = 400, heightPx = 240, tileSize = 256)
        val many = SharedLocationsMap.fit(
            listOf(GeoPoint(48.85, 2.35), GeoPoint(45.76, 4.83)),
            widthPx = 400,
            heightPx = 240,
            tileSize = 256,
        )

        assertThat(one).isEqualTo(GeoPoint(48.85, 2.35) to SharedLocationsMap.SINGLE_PIN_ZOOM)
        val bounds = checkNotNull(SharedLocationsMap.viewport(many!!.first, many.second, 400, 240, 256))
        assertThat(bounds.contains(48.85, 2.35)).isTrue()
        assertThat(bounds.contains(45.76, 4.83)).isTrue()
        assertThat(many.second).isEqualTo(5)
        assertThat(SharedLocationsMap.fit(emptyList(), 400, 240, 256)).isNull()
    }

    @Test
    fun `le cercle de flou se mesure en metres sur le sol, donc grandit avec le zoom`() {
        val equatorZoom0 = SharedLocationsMap.radiusPixels(radiusMeters = 40_075_016.686 / 256, latitude = 0.0, zoom = 0, tileSize = 256)
        val city = SharedLocationsMap.radiusPixels(12_000.0, 48.85, zoom = 10, tileSize = 256)
        val cityCloser = SharedLocationsMap.radiusPixels(12_000.0, 48.85, zoom = 11, tileSize = 256)

        assertThat(equatorZoom0).isWithin(1e-6).of(1.0)
        assertThat(cityCloser).isWithin(1e-6).of(city * 2)
        assertThat(SlippyMap.clampZoom(SharedLocationsMap.SINGLE_PIN_ZOOM)).isEqualTo(SharedLocationsMap.SINGLE_PIN_ZOOM)
    }
}
