package me.meeshy.sdk.model.relation

import kotlin.math.PI
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.roundToInt
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * LES RÈGLES DE LA CARTE DES POSITIONS PARTAGÉES, SUR ANDROID (#18890) — iso `LocationMapRules.swift` (#18872). Des
 * fonctions pures sur ce que la passerelle a servi : aucune ne rend une position plus fine, aucune ne garde rien. L'écran
 * les projette ; ce fichier dit seulement combien de temps il reste, à quelle distance, dans quel ordre.
 */
public object LocationMapRules {
    /** Un pas de marche moyen : 80 m par minute (4,8 km/h). */
    public const val WALKING_METERS_PER_MINUTE: Double = 80.0

    /** Au-delà, « à pied » n'a plus de sens : la carte ne dit que la distance. */
    public const val WALKING_CEILING_METERS: Double = 15_000.0

    /** Une position mise à jour depuis moins que cela se dit « en direct ». */
    public const val LIVE_FRESHNESS_MILLIS: Long = 120_000L

    private const val EARTH_RADIUS_METERS = 6_371_000.0

    /** La distance au sol entre deux points, en mètres (haversine). */
    public fun distanceMeters(fromLatitude: Double, fromLongitude: Double, toLatitude: Double, toLongitude: Double): Double {
        val radians = PI / 180
        val dLat = (toLatitude - fromLatitude) * radians
        val dLon = (toLongitude - fromLongitude) * radians
        val a = sin(dLat / 2) * sin(dLat / 2) +
            cos(fromLatitude * radians) * cos(toLatitude * radians) * sin(dLon / 2) * sin(dLon / 2)
        return EARTH_RADIUS_METERS * 2 * atan2(sqrt(a), sqrt(1 - a))
    }

    /** Les minutes à pied, arrondies, jamais sous une minute ; `null` au-delà du plafond ou sur une distance illisible. */
    public fun walkingMinutes(meters: Double): Int? {
        if (!meters.isFinite() || meters < 0 || meters > WALKING_CEILING_METERS) return null
        return maxOf(1, (meters / WALKING_METERS_PER_MINUTE).roundToInt())
    }
}

/** Le temps qui reste à un partage reçu, et sur quelle durée il a été ouvert (1 h ou 8 h : les deux seules servies). */
public data class SharedLocationWindow(val remainingMillis: Long, val totalMillis: Long) {
    /** La part qui reste, de 1 (vient de commencer) à 0 (échu). */
    public val fraction: Double get() = if (totalMillis > 0) remainingMillis.toDouble() / totalMillis else 0.0

    public val isOver: Boolean get() = remainingMillis <= 0

    /** Les minutes restantes, arrondies au-dessus : « encore 1 min » tant qu'une seconde reste. */
    public val remainingMinutes: Int get() = ((remainingMillis + MINUTE - 1) / MINUTE).toInt()

    public companion object {
        private const val MINUTE = 60_000L
        private val DURATIONS_MILLIS = SharedLocationShareDuration.entries.map { it.millis }.sorted()

        public fun of(deadlineMillis: Long, nowMillis: Long): SharedLocationWindow {
            val remaining = (deadlineMillis - nowMillis).coerceIn(0L, SharedLocationContract.MAX_LIFETIME_MS)
            val total = DURATIONS_MILLIS.firstOrNull { remaining <= it } ?: SharedLocationContract.MAX_LIFETIME_MS
            return SharedLocationWindow(remaining, total)
        }
    }
}

/** La fraîcheur d'une position reçue : « en direct » sous deux minutes, sinon depuis combien de minutes. */
public sealed interface SharedLocationFreshness {
    public data class Live(val secondsAgo: Int) : SharedLocationFreshness
    public data class Stale(val minutesAgo: Int) : SharedLocationFreshness

    public companion object {
        public fun of(updatedAtMillis: Long, nowMillis: Long): SharedLocationFreshness {
            val elapsed = maxOf(0L, nowMillis - updatedAtMillis)
            return if (elapsed < LocationMapRules.LIVE_FRESHNESS_MILLIS) Live((elapsed / 1_000L).toInt()) else Stale((elapsed / 60_000L).toInt())
        }
    }
}

/** Les puces de la carte de mes proches : tous, ou un seul cercle (Ami, Proche, Sang). */
public enum class NearbyCircleFilter(public val circle: SharedLocationCircle?) {
    ALL(null),
    FRIEND(SharedLocationCircle.FRIEND),
    CLOSE(SharedLocationCircle.CLOSE),
    BLOOD(SharedLocationCircle.BLOOD),
    ;

    /** Un cercle non servi n'entre que dans « Tous » : on ne range personne dans un cercle qu'on ne connaît pas. */
    public fun admits(other: SharedLocationCircle?): Boolean = circle == null || other == circle
}

/** Une personne de la carte, telle que les règles la rangent : son cercle servi et sa distance à moi (si je la connais). */
public class NearbyPlacement(
    public val id: String,
    public val circle: SharedLocationCircle?,
    distanceMeters: Double?,
    remainingMillis: Long? = null,
) {
    public val distanceMeters: Double? = distanceMeters?.takeIf { it.isFinite() && it >= 0 }
    public val remainingMillis: Long? = remainingMillis?.takeIf { it >= 0 }
}

/** L'ordre de « Autour de toi » : du plus près, la fin la plus proche d'abord, ou par cercle (Sang, Proche, Ami). */
public enum class NearbySort { NEAREST, ENDING_SOON, BY_CIRCLE }

public object NearbyRules {
    public fun arranged(
        people: List<NearbyPlacement>,
        filter: NearbyCircleFilter,
        sort: NearbySort = NearbySort.NEAREST,
    ): List<NearbyPlacement> = people.filter { filter.admits(it.circle) }.sortedWith(comparator(sort))

    /** Le compte de chaque puce, « Tous » compris. */
    public fun counts(people: List<NearbyPlacement>): Map<NearbyCircleFilter, Int> =
        NearbyCircleFilter.entries.associateWith { filter -> people.count { filter.admits(it.circle) } }

    private fun comparator(sort: NearbySort): Comparator<NearbyPlacement> = when (sort) {
        NearbySort.NEAREST -> NEAREST
        NearbySort.ENDING_SOON -> compareBy<NearbyPlacement, Long?>(unknownLast<Long>()) { it.remainingMillis }.then(NEAREST)
        NearbySort.BY_CIRCLE -> compareBy<NearbyPlacement> { circleRank(it.circle) }.then(NEAREST)
    }

    private val NEAREST: Comparator<NearbyPlacement> =
        compareBy<NearbyPlacement, Double?>(unknownLast<Double>()) { it.distanceMeters }.thenBy { it.id }

    private fun <T : Comparable<T>> unknownLast(): Comparator<T?> = Comparator { a, b ->
        when {
            a == null && b == null -> 0
            a == null -> 1
            b == null -> -1
            else -> a.compareTo(b)
        }
    }

    private fun circleRank(circle: SharedLocationCircle?): Int = when (circle) {
        SharedLocationCircle.BLOOD -> 0
        SharedLocationCircle.CLOSE -> 1
        SharedLocationCircle.FRIEND -> 2
        null -> 3
    }
}

/**
 * Ce que dit mon épingle : ma position ne part vers personne, elle part, ou elle part vers la personne regardée. Sur la
 * carte d'une personne, une position partagée avec d'autres qu'elle reste « non partagée » pour elle.
 */
public enum class LocationMapOwnShare {
    NOT_SHARED,
    SHARED,
    SHARED_WITH_THEM,
    ;

    public companion object {
        public fun resolve(recipientIds: List<String>, focusedUserId: String?): LocationMapOwnShare = when {
            focusedUserId == null -> if (recipientIds.isEmpty()) NOT_SHARED else SHARED
            focusedUserId in recipientIds -> SHARED_WITH_THEM
            else -> NOT_SHARED
        }
    }
}
