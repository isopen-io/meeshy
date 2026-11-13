package me.meeshy.sdk.model.relation

import java.math.BigDecimal
import java.time.Instant
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement

/**
 * LE PARTAGE TEMPORAIRE DE POSITION À DES PERSONNES (#14109, #16980), côté RÉCEPTION sur Android (#16985) — la lecture
 * Kotlin de `packages/shared/types/shared-location.ts`, iso `Relations/SharedLocation.swift` du SDK iOS.
 *
 * La passerelle a déjà tronqué chaque position à la précision que son émetteur m'a donnée (exacte, quartier, ville) :
 * un flou arrive posé au centre de sa maille, avec le rayon du cercle à dessiner. Ce décodeur ne garde que les champs du
 * contrat, bornés comme le serveur les borne : une coordonnée hors du globe, une précision inconnue ou un rayon absurde
 * ne traversent jamais jusqu'à la carte, et la précision réelle de l'appareil émetteur n'a pas de champ où se poser.
 */
public object SharedLocationContract {
    /** `SHARED_LOCATION_DURATIONS_MINUTES` : un partage dure au plus 8 h ; une échéance plus lointaine est bornée. */
    public const val MAX_LIFETIME_MS: Long = 8L * 3_600_000L

    /** `SHARED_LOCATION_EXACT_MIN_RADIUS_METERS` : même `exact`, le cercle ne descend pas sous 10 m. */
    public const val EXACT_MIN_RADIUS_METERS: Double = 10.0

    /** `sharedLocationPositionSchema.accuracy` : au-delà, le rayon servi n'a plus de sens. */
    public const val MAX_RADIUS_METERS: Double = 100_000.0
}

/** `SHARED_LOCATION_PRECISIONS` : ce que l'émetteur a choisi de me montrer. */
public enum class SharedLocationPrecision(public val wire: String) {
    EXACT("exact"),
    NEIGHBORHOOD("neighborhood"),
    CITY("city");

    public companion object {
        public fun of(wire: String?): SharedLocationPrecision? = entries.firstOrNull { it.wire == wire }
    }
}

/**
 * `SHARED_LOCATION_CIRCLES` (#17013, #17966) : le cercle d'où vient la personne, tel que la loi d'accès l'a jugé pour
 * MOI. ADDITIF : un serveur antérieur ne le sert pas, et un cercle inconnu se lit absent — le marqueur est alors neutre.
 */
public enum class SharedLocationCircle {
    FRIEND,
    CLOSE,
    BLOOD;

    public companion object {
        public fun of(wire: String?): SharedLocationCircle? = entries.firstOrNull { it.name == wire }
    }
}

/** `location:share-changed` — la position d'UNE personne, déjà tronquée pour MOI, bornée par le contrat. */
public data class SharedLocation(
    val userId: String,
    val latitude: Double,
    val longitude: Double,
    val precision: SharedLocationPrecision,
    val radiusMeters: Double,
    val circle: SharedLocationCircle?,
    val updatedAtMillis: Long,
    val expiresAtMillis: Long,
) {
    /** La durée de vie servie, bornée par le contrat : une échéance absurde ne garde jamais une position affichée. */
    val lifetimeMillis: Long
        get() = (expiresAtMillis - updatedAtMillis).coerceIn(0L, SharedLocationContract.MAX_LIFETIME_MS)
}

/**
 * La charge telle qu'elle voyage. Chaque champ est optionnel au décodage pour qu'un élément fautif d'un rattrapage soit
 * ÉCARTÉ par [served] au lieu de faire tomber toute la liste ; rien d'autre que le contrat n'y a de place.
 */
@Serializable
public data class SharedLocationChangedWire(
    val userId: String? = null,
    val latitude: Double? = null,
    val longitude: Double? = null,
    val precision: String? = null,
    val radiusMeters: Double? = null,
    val circle: String? = null,
    val updatedAt: String? = null,
    val expiresAt: String? = null,
) {
    /** La position bornée, ou `null` si la charge sort du contrat. */
    public fun served(): SharedLocation? {
        val id = userId?.trim()?.takeIf { it.isNotEmpty() } ?: return null
        val lat = latitude?.takeIf { it.isFinite() && kotlin.math.abs(it) <= 90.0 } ?: return null
        val lon = longitude?.takeIf { it.isFinite() && kotlin.math.abs(it) <= 180.0 } ?: return null
        val servedPrecision = SharedLocationPrecision.of(precision) ?: return null
        val radius = radiusMeters?.takeIf { it.isFinite() && it >= 0.0 } ?: return null
        val updated = updatedAt.epochMillis() ?: return null
        val expires = expiresAt.epochMillis() ?: return null
        return SharedLocation(
            userId = id,
            latitude = lat,
            longitude = lon,
            precision = servedPrecision,
            radiusMeters = radius.coerceIn(SharedLocationContract.EXACT_MIN_RADIUS_METERS, SharedLocationContract.MAX_RADIUS_METERS),
            circle = SharedLocationCircle.of(circle),
            updatedAtMillis = updated,
            expiresAtMillis = expires,
        )
    }

    private fun String?.epochMillis(): Long? = this?.let { runCatching { Instant.parse(it).toEpochMilli() }.getOrNull() }
}

/** `location:share-ended` — le partage de cette personne s'arrête chez moi (arrêt, baisse sous Ami, blocage, retrait). */
@Serializable
public data class SharedLocationEndedEvent(val userId: String)

/**
 * `GET /relations/locations` — les partages servis à MOI, déjà tronqués. Les éléments restent bruts jusqu'à [served] :
 * un élément illisible est écarté, il ne fait pas tomber le rattrapage.
 */
@Serializable
public data class SharedLocationSnapshotWire(val items: List<JsonElement> = emptyList()) {
    public fun served(json: Json): List<SharedLocation> = items.mapNotNull { item ->
        runCatching { json.decodeFromJsonElement(SharedLocationChangedWire.serializer(), item) }.getOrNull()?.served()
    }
}

/**
 * L'emprise visible d'une carte, au format que la passerelle lit (`bbox=minLon,minLat,maxLon,maxLat`). Normalisée à la
 * construction : une emprise inversée ou hors du globe n'existe pas ([of] rend `null`), le serveur la refuserait.
 */
public class SharedLocationBounds private constructor(
    public val minLongitude: Double,
    public val minLatitude: Double,
    public val maxLongitude: Double,
    public val maxLatitude: Double,
) {
    /** La valeur de `bbox`, dans l'ordre que lit `parseBbox` côté passerelle, jamais en notation scientifique. */
    public val queryValue: String
        get() = listOf(minLongitude, minLatitude, maxLongitude, maxLatitude)
            .joinToString(",") { BigDecimal.valueOf(it).toPlainString() }

    /** Le serveur filtre sur la position SERVIE : la même règle départage ce que le rattrapage fait foi. */
    public fun contains(latitude: Double, longitude: Double): Boolean =
        latitude in minLatitude..maxLatitude && longitude in minLongitude..maxLongitude

    override fun equals(other: Any?): Boolean =
        other is SharedLocationBounds && queryValue == other.queryValue

    override fun hashCode(): Int = queryValue.hashCode()

    override fun toString(): String = "SharedLocationBounds($queryValue)"

    public companion object {
        public fun of(minLongitude: Double, minLatitude: Double, maxLongitude: Double, maxLatitude: Double): SharedLocationBounds? {
            val finite = listOf(minLongitude, minLatitude, maxLongitude, maxLatitude).all { it.isFinite() }
            val onGlobe = kotlin.math.abs(minLatitude) <= 90.0 && kotlin.math.abs(maxLatitude) <= 90.0 &&
                kotlin.math.abs(minLongitude) <= 180.0 && kotlin.math.abs(maxLongitude) <= 180.0
            val ordered = minLatitude <= maxLatitude && minLongitude <= maxLongitude
            return if (finite && onGlobe && ordered) SharedLocationBounds(minLongitude, minLatitude, maxLongitude, maxLatitude) else null
        }
    }
}
