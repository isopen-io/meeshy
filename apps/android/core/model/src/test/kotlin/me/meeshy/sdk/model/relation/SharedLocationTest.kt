package me.meeshy.sdk.model.relation

import com.google.common.truth.Truth.assertThat
import java.time.Instant
import kotlinx.serialization.json.Json
import org.junit.Test

/**
 * La lecture Kotlin de `location:share-changed` et de `GET /relations/locations` (#16985) — iso
 * `SharedLocationTests.swift`. La passerelle a déjà tronqué chaque position pour ce lecteur : le décodeur ne garde que
 * les champs du contrat, bornés comme le serveur les borne.
 */
class SharedLocationTest {
    private val json = Json { ignoreUnknownKeys = true; isLenient = true; explicitNulls = false; coerceInputValues = true }

    private fun wire(
        userId: String? = "u2",
        latitude: Double? = 48.85,
        longitude: Double? = 2.35,
        precision: String? = "city",
        radiusMeters: Double? = 12_000.0,
        circle: String? = "CLOSE",
        updatedAt: String? = "2026-11-13T18:00:00Z",
        expiresAt: String? = "2026-11-13T19:00:00Z",
    ) = SharedLocationChangedWire(userId, latitude, longitude, precision, radiusMeters, circle, updatedAt, expiresAt)

    private fun millis(iso: String) = Instant.parse(iso).toEpochMilli()

    @Test
    fun `une position servie se lit telle quelle, son cercle compris`() {
        val served = wire().served()

        assertThat(served).isEqualTo(
            SharedLocation(
                userId = "u2",
                latitude = 48.85,
                longitude = 2.35,
                precision = SharedLocationPrecision.CITY,
                radiusMeters = 12_000.0,
                circle = SharedLocationCircle.CLOSE,
                updatedAtMillis = millis("2026-11-13T18:00:00Z"),
                expiresAtMillis = millis("2026-11-13T19:00:00Z"),
            ),
        )
    }

    @Test
    fun `la precision reelle de l'appareil emetteur n'a aucun champ ou se poser`() {
        val decoded = json.decodeFromString(
            SharedLocationChangedWire.serializer(),
            """{"userId":"u2","latitude":1.0,"longitude":2.0,"precision":"exact","radiusMeters":30,"accuracy":3,"recipients":["u9"],"updatedAt":"2026-11-13T18:00:00Z","expiresAt":"2026-11-13T19:00:00Z"}""",
        ).served()

        assertThat(decoded).isNotNull()
        assertThat(SharedLocation::class.java.declaredFields.map { it.name }).containsNoneOf("accuracy", "recipients")
    }

    @Test
    fun `un cercle absent ou inconnu se lit neutre, sans faire tomber la position`() {
        assertThat(wire(circle = null).served()?.circle).isNull()
        assertThat(wire(circle = "ACQUAINTANCE").served()?.circle).isNull()
        assertThat(wire(circle = "BLOOD").served()?.circle).isEqualTo(SharedLocationCircle.BLOOD)
    }

    @Test
    fun `une coordonnee hors du globe ou absente n'atteint jamais la carte`() {
        assertThat(wire(latitude = 90.5).served()).isNull()
        assertThat(wire(longitude = -180.1).served()).isNull()
        assertThat(wire(latitude = Double.NaN).served()).isNull()
        assertThat(wire(longitude = null).served()).isNull()
    }

    @Test
    fun `une precision inconnue, un rayon illisible, un instant illisible ou une personne vide sont refuses`() {
        assertThat(wire(precision = "street").served()).isNull()
        assertThat(wire(radiusMeters = -1.0).served()).isNull()
        assertThat(wire(radiusMeters = Double.POSITIVE_INFINITY).served()).isNull()
        assertThat(wire(updatedAt = "hier").served()).isNull()
        assertThat(wire(expiresAt = null).served()).isNull()
        assertThat(wire(userId = "  ").served()).isNull()
    }

    @Test
    fun `le rayon est borne au plancher exact et au plafond du contrat`() {
        assertThat(wire(radiusMeters = 2.0).served()?.radiusMeters).isEqualTo(SharedLocationContract.EXACT_MIN_RADIUS_METERS)
        assertThat(wire(radiusMeters = 9e9).served()?.radiusMeters).isEqualTo(SharedLocationContract.MAX_RADIUS_METERS)
    }

    @Test
    fun `la duree de vie servie ne depasse jamais 8 h et ne devient jamais negative`() {
        assertThat(wire(expiresAt = "2026-11-14T18:00:00Z").served()?.lifetimeMillis)
            .isEqualTo(SharedLocationContract.MAX_LIFETIME_MS)
        assertThat(wire(expiresAt = "2026-11-13T17:00:00Z").served()?.lifetimeMillis).isEqualTo(0L)
        assertThat(wire().served()?.lifetimeMillis).isEqualTo(3_600_000L)
    }

    @Test
    fun `le rattrapage ecarte un element illisible sans tomber`() {
        val snapshot = json.decodeFromString(
            SharedLocationSnapshotWire.serializer(),
            """{"items":[
              {"userId":"u2","latitude":1.0,"longitude":2.0,"precision":"city","radiusMeters":12000,"updatedAt":"2026-11-13T18:00:00Z","expiresAt":"2026-11-13T19:00:00Z"},
              {"userId":"u3","latitude":"nord","longitude":2.0,"precision":"city","radiusMeters":12000,"updatedAt":"2026-11-13T18:00:00Z","expiresAt":"2026-11-13T19:00:00Z"},
              {"userId":"u4","latitude":95.0,"longitude":2.0,"precision":"city","radiusMeters":12000,"updatedAt":"2026-11-13T18:00:00Z","expiresAt":"2026-11-13T19:00:00Z"},
              42
            ]}""",
        )

        assertThat(snapshot.served(json).map { it.userId }).containsExactly("u2")
        assertThat(json.decodeFromString(SharedLocationSnapshotWire.serializer(), "{}").served(json)).isEmpty()
    }

    @Test
    fun `une emprise inversee ou hors du globe n'existe pas`() {
        assertThat(SharedLocationBounds.of(minLongitude = 3.0, minLatitude = 48.0, maxLongitude = 2.0, maxLatitude = 49.0)).isNull()
        assertThat(SharedLocationBounds.of(minLongitude = 2.0, minLatitude = 49.0, maxLongitude = 3.0, maxLatitude = 48.0)).isNull()
        assertThat(SharedLocationBounds.of(minLongitude = -181.0, minLatitude = 48.0, maxLongitude = 3.0, maxLatitude = 49.0)).isNull()
        assertThat(SharedLocationBounds.of(minLongitude = 2.0, minLatitude = Double.NaN, maxLongitude = 3.0, maxLatitude = 49.0)).isNull()
    }

    @Test
    fun `l'emprise s'ecrit dans l'ordre que lit parseBbox et contient ce qu'elle couvre`() {
        val bounds = checkNotNull(SharedLocationBounds.of(minLongitude = 2.0, minLatitude = 48.5, maxLongitude = 2.5, maxLatitude = 49.0))

        assertThat(bounds.queryValue).isEqualTo("2.0,48.5,2.5,49.0")
        assertThat(bounds.contains(latitude = 48.85, longitude = 2.35)).isTrue()
        assertThat(bounds.contains(latitude = 48.85, longitude = 2.6)).isFalse()
    }

    @Test
    fun `une emprise tres fine ne s'ecrit pas en notation scientifique`() {
        val bounds = checkNotNull(SharedLocationBounds.of(minLongitude = 0.0001, minLatitude = -0.00005, maxLongitude = 0.0002, maxLatitude = 0.0))

        assertThat(bounds.queryValue).doesNotContain("E")
        assertThat(bounds.queryValue.split(",").map { it.toDouble() }).containsExactly(0.0001, -0.00005, 0.0002, 0.0).inOrder()
    }
}
