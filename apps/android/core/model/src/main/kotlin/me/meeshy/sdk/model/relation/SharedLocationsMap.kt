package me.meeshy.sdk.model.relation

import me.meeshy.sdk.model.location.GeoPoint
import me.meeshy.sdk.model.location.SlippyMap
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.pow

/**
 * Une épingle de la carte des positions qu'on me partage : la position TELLE QUE SERVIE (jamais plus fine), le rayon du
 * cercle de flou servi, la personne nommée par l'annuaire des cercles (`null` ⇒ l'écran dit « Quelqu'un »).
 */
public data class SharedLocationPin(
    val userId: String,
    val point: GeoPoint,
    val radiusMeters: Double,
    val precision: SharedLocationPrecision,
    val circle: SharedLocationCircle?,
    val name: String?,
    val initials: String,
    val deadlineMillis: Long,
)

/**
 * LA CARTE DES POSITIONS QU'ON ME PARTAGE, SUR ANDROID (#16985) — la projection PURE, iso `SharedLocationsMapViewModel.swift`
 * (#16983) et `shared-locations-map.tsx` (#16984). Elle projette ce que le magasin garde ([SharedLocationsState]) : le
 * serveur a déjà tronqué chaque position à la précision que son émetteur m'a donnée, et rien ici ne la rend plus fine.
 *
 * La carte d'Android est la carte à tuiles du dépôt (`TileMapView`, sans SDK ni clé) : l'emprise visible, le cadrage
 * initial et le rayon du cercle de flou se calculent donc ici, sur la projection de [SlippyMap].
 */
public object SharedLocationsMap {
    /** Le zoom d'une épingle seule (ou de plusieurs au même endroit) : le quartier se lit, la rue non. */
    public const val SINGLE_PIN_ZOOM: Int = 12

    private const val FIT_PADDING_PX: Int = 48
    private const val EARTH_CIRCUMFERENCE_METERS: Double = 40_075_016.686

    /** Les épingles, triées par nom ; une personne que l'annuaire ne connaît pas vient après, par identifiant. */
    public fun pins(byUser: Map<String, SharedLocationEntry>, people: Map<String, CirclePerson>): List<SharedLocationPin> =
        byUser.map { (userId, entry) ->
            val name = people[userId]?.name?.trim()?.takeIf { it.isNotEmpty() }
            SharedLocationPin(
                userId = userId,
                point = GeoPoint(entry.latitude, entry.longitude),
                radiusMeters = entry.radiusMeters,
                precision = entry.precision,
                circle = entry.circle,
                name = name,
                initials = name?.let(::initials) ?: "?",
                deadlineMillis = entry.deadlineMillis,
            )
        }.sortedWith(compareBy<SharedLocationPin>({ it.name == null }, { it.name?.lowercase() }, { it.userId }))

    public fun initials(name: String): String {
        val letters = name.trim().split(Regex("\\s+")).filter { it.isNotEmpty() }.take(2).map { it.first().uppercase() }
        return letters.joinToString("").ifEmpty { "?" }
    }

    /**
     * L'emprise d'une fenêtre de [widthPx] x [heightPx] centrée sur [center], au format que la passerelle lit. Une emprise
     * qui franchit l'antiméridien ne se dit pas en un rectangle : elle rend `null`, et le rattrapage couvre alors le monde.
     */
    public fun viewport(center: GeoPoint, zoom: Int, widthPx: Int, heightPx: Int, tileSize: Int): SharedLocationBounds? {
        if (widthPx <= 0 || heightPx <= 0) return null
        val (cx, cy) = SlippyMap.worldPixel(center, zoom, tileSize)
        val size = tileSize * 2.0.pow(zoom)
        val west = (cx - widthPx / 2.0) / size * 360.0 - 180.0
        val east = (cx + widthPx / 2.0) / size * 360.0 - 180.0
        val north = SlippyMap.point(cx, (cy - heightPx / 2.0).coerceAtLeast(0.0), zoom, tileSize).latitude
        val south = SlippyMap.point(cx, (cy + heightPx / 2.0).coerceAtMost(size), zoom, tileSize).latitude
        return SharedLocationBounds.of(minLongitude = west, minLatitude = south, maxLongitude = east, maxLatitude = north)
    }

    /** Ma position ne cadre la carte que si son relevé a moins d'une heure (iso `LocationMapOwnPosition.lastKnown`). */
    public const val OWN_FIX_MAX_AGE_MILLIS: Long = 3_600_000L

    /** Ma dernière position, si elle est assez fraîche pour cadrer la carte ; `null` sinon. */
    public fun ownIfFresh(point: GeoPoint, atMillis: Long, nowMillis: Long): GeoPoint? =
        point.takeIf { nowMillis - atMillis < OWN_FIX_MAX_AGE_MILLIS }

    /**
     * Ce que la carte cadre : toutes les épingles sans personne ciblée ; sinon la personne ET moi (iOS `refocus` :
     * `[target, mine]`), de sorte qu'un Sang qui s'approche se voie avec moi sur la même vue (#20540). Tant que la personne
     * n'est pas servie, rien ne cadre : la carte attend son épingle au lieu de se figer sur moi seul.
     */
    public fun framed(pins: List<SharedLocationPin>, focusUserId: String?, own: GeoPoint?): List<GeoPoint> {
        if (focusUserId == null) return pins.map { it.point }
        val target = pins.filter { it.userId == focusUserId }.map { it.point }
        return if (target.isEmpty()) emptyList() else target + listOfNotNull(own)
    }

    /** Le cadrage qui montre toutes les épingles, marge comprise, au zoom le plus proche ; `null` s'il n'y a rien. */
    public fun fit(points: List<GeoPoint>, widthPx: Int, heightPx: Int, tileSize: Int): Pair<GeoPoint, Int>? {
        if (points.isEmpty()) return null
        val zoom = (SINGLE_PIN_ZOOM downTo SlippyMap.MIN_ZOOM).firstOrNull { zoom ->
            val pixels = points.map { SlippyMap.worldPixel(it, zoom, tileSize) }
            val spanX = pixels.maxOf { it.first } - pixels.minOf { it.first }
            val spanY = pixels.maxOf { it.second } - pixels.minOf { it.second }
            spanX + 2 * FIT_PADDING_PX <= widthPx && spanY + 2 * FIT_PADDING_PX <= heightPx
        } ?: SlippyMap.MIN_ZOOM
        val pixels = points.map { SlippyMap.worldPixel(it, zoom, tileSize) }
        val midX = (pixels.maxOf { it.first } + pixels.minOf { it.first }) / 2
        val midY = (pixels.maxOf { it.second } + pixels.minOf { it.second }) / 2
        val center = if (points.distinct().size == 1) points.first() else SlippyMap.point(midX, midY, zoom, tileSize)
        return center to zoom
    }

    /** Le rayon servi, en pixels de la projection à ce zoom : un cercle de flou mesure des mètres SUR LE SOL. */
    public fun radiusPixels(radiusMeters: Double, latitude: Double, zoom: Int, tileSize: Int): Double {
        val metersPerPixel = EARTH_CIRCUMFERENCE_METERS * cos(latitude * PI / 180.0) / (tileSize * 2.0.pow(zoom))
        return radiusMeters / metersPerPixel
    }
}
