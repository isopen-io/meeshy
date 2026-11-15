package me.meeshy.sdk.model.composer

import me.meeshy.sdk.model.SharedPlace
import me.meeshy.sdk.model.location.AddressParts
import me.meeshy.sdk.model.location.GeoPoint
import kotlin.math.asin
import kotlin.math.cos
import kotlin.math.pow
import kotlin.math.sin
import kotlin.math.sqrt

/** Une adresse que le géocodeur de l'appareil rend autour d'un point : sa position et ses composants. */
data class NearbyAddress(val point: GeoPoint, val parts: AddressParts)

/**
 * Les lieux ALENTOUR d'une story (#13846, miroir de `StickerNearbyPlaces` iOS) : l'endroit exact d'abord, puis les lieux
 * nommés à moins de [RADIUS_METERS], du plus proche au plus lointain, [MAX_PLACES] au plus. Sans position, rien : on ne
 * propose jamais un lieu où l'auteur n'est pas.
 */
object StoryNearbyPlaces {

    const val MAX_PLACES: Int = 5

    /** La distance à laquelle « je suis ici » reste vrai. */
    const val RADIUS_METERS: Double = 400.0

    private const val EARTH_RADIUS_METERS = 6_371_000.0

    fun places(origin: GeoPoint?, around: List<NearbyAddress>, hereName: String): List<SharedPlace> {
        if (origin == null) return emptyList()
        val exact = exactPlace(origin, around.firstOrNull()?.parts, hereName)
        val nearby = around
            .mapNotNull { address -> named(address)?.let { it to distanceMeters(origin, address.point) } }
            .filter { (_, meters) -> meters <= RADIUS_METERS }
            .sortedBy { (_, meters) -> meters }
            .map { (place, _) -> place }
            .filterNot { it.name.equals(exact.name, ignoreCase = true) }
            .distinctBy { it.name?.lowercase() }
            .take(MAX_PLACES)
        return listOf(exact) + nearby
    }

    /** L'endroit exact, sans arrondi : nommé par son numéro et sa rue, situé par sa ville ; sans rue connue, [hereName]. */
    fun exactPlace(origin: GeoPoint, parts: AddressParts?, hereName: String): SharedPlace {
        val street = parts?.thoroughfare?.trim()?.takeIf { it.isNotEmpty() }
        val number = parts?.featureName?.trim()?.takeIf { it.isNotEmpty() && it.all(Char::isDigit) }
        return SharedPlace(
            latitude = origin.latitude,
            longitude = origin.longitude,
            name = street?.let { listOfNotNull(number, it).joinToString(" ") } ?: hereName,
            address = parts?.locality?.trim()?.takeIf { it.isNotEmpty() },
        )
    }

    fun distanceMeters(a: GeoPoint, b: GeoPoint): Double {
        val dLat = Math.toRadians(b.latitude - a.latitude)
        val dLon = Math.toRadians(b.longitude - a.longitude)
        val h = sin(dLat / 2).pow(2) + cos(Math.toRadians(a.latitude)) * cos(Math.toRadians(b.latitude)) * sin(dLon / 2).pow(2)
        return 2 * EARTH_RADIUS_METERS * asin(sqrt(h))
    }

    /** Un lieu a un NOM : ni un numéro de rue, ni la simple répétition de la ville. */
    private fun named(address: NearbyAddress): SharedPlace? {
        val parts = address.parts
        val name = parts.featureName?.trim()
            ?.takeUnless { it.isEmpty() || it.all(Char::isDigit) || it.equals(parts.locality, ignoreCase = true) }
            ?: return null
        val located = listOfNotNull(parts.thoroughfare, parts.locality).map(String::trim).filter(String::isNotEmpty)
        return SharedPlace(
            latitude = address.point.latitude,
            longitude = address.point.longitude,
            name = name,
            address = located.joinToString(", ").ifEmpty { null },
        )
    }
}
