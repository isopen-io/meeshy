package me.meeshy.sdk.model.location

import me.meeshy.sdk.model.SharedMapStyle
import kotlin.math.PI
import kotlin.math.atan
import kotlin.math.floor
import kotlin.math.ln
import kotlin.math.pow
import kotlin.math.sinh

/** Un point géographique en degrés. */
data class GeoPoint(val latitude: Double, val longitude: Double)

/** Une tuile à poser dans la fenêtre : son index monde et son décalage en pixels depuis le coin haut-gauche. */
data class TilePlacement(val x: Int, val y: Int, val zoom: Int, val offsetX: Int, val offsetY: Int) {
    fun url(style: SharedMapStyle = SharedMapStyle.STANDARD): String = SlippyMap.tileUrl(x, y, zoom, style)
}

/**
 * Mathématique des tuiles « slippy map » (projection Web Mercator, tuiles 256 px) — le choix
 * de carte d'Android : aucune clé d'API ni SDK, la carte est composée de tuiles rasters que
 * l'écran déplace lui-même. Fonctions pures, testées sur la JVM.
 */
object SlippyMap {
    const val TILE_SIZE: Int = 256
    const val MIN_ZOOM: Int = 2
    const val MAX_ZOOM: Int = 19
    const val MAX_LATITUDE: Double = 85.0511287798

    /**
     * Plan = OpenStreetMap. Hybride et satellite = imagerie Esri (le plan à étiquettes de l'un ne
     * se superpose pas sans SDK : l'hybride sert donc l'imagerie, écart consigné en issue).
     */
    fun tileUrl(x: Int, y: Int, zoom: Int, style: SharedMapStyle = SharedMapStyle.STANDARD): String = when (style) {
        SharedMapStyle.STANDARD -> "https://tile.openstreetmap.org/$zoom/$x/$y.png"
        SharedMapStyle.HYBRID, SharedMapStyle.IMAGERY ->
            "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/$zoom/$y/$x"
    }

    /** Mention d'attribution exigée par les fournisseurs de tuiles — un nom propre, pas un libellé traduit. */
    fun attribution(style: SharedMapStyle): String = when (style) {
        SharedMapStyle.STANDARD -> "© OpenStreetMap"
        SharedMapStyle.HYBRID, SharedMapStyle.IMAGERY -> "© Esri, Maxar"
    }

    fun clampZoom(zoom: Int): Int = zoom.coerceIn(MIN_ZOOM, MAX_ZOOM)

    private fun worldSize(zoom: Int, tileSize: Int): Double = tileSize * 2.0.pow(zoom)

    /** Position du point sur le monde projeté à ce zoom, en pixels. */
    fun worldPixel(point: GeoPoint, zoom: Int, tileSize: Int = TILE_SIZE): Pair<Double, Double> {
        val lat = point.latitude.coerceIn(-MAX_LATITUDE, MAX_LATITUDE)
        val size = worldSize(zoom, tileSize)
        val x = (point.longitude + 180.0) / 360.0 * size
        val sinLat = kotlin.math.sin(Math.toRadians(lat))
        val y = (0.5 - ln((1 + sinLat) / (1 - sinLat)) / (4 * PI)) * size
        return x to y
    }

    /** Inverse de [worldPixel]. */
    fun point(worldX: Double, worldY: Double, zoom: Int, tileSize: Int = TILE_SIZE): GeoPoint {
        val size = worldSize(zoom, tileSize)
        val lon = worldX / size * 360.0 - 180.0
        val n = PI - 2 * PI * worldY / size
        val lat = Math.toDegrees(atan(sinh(n)))
        return GeoPoint(lat.coerceIn(-MAX_LATITUDE, MAX_LATITUDE), wrapLongitude(lon))
    }

    /** Le point sous le doigt qui a glissé de ([dx], [dy]) pixels : la carte suit le doigt, le centre part en sens inverse. */
    fun panned(center: GeoPoint, dx: Double, dy: Double, zoom: Int, tileSize: Int = TILE_SIZE): GeoPoint {
        val (wx, wy) = worldPixel(center, zoom, tileSize)
        val size = worldSize(zoom, tileSize)
        return point(wx - dx, (wy - dy).coerceIn(0.0, size), zoom, tileSize)
    }

    /** Les tuiles qui couvrent une fenêtre de [widthPx] x [heightPx] centrée sur [center]. */
    fun tilesCovering(center: GeoPoint, zoom: Int, widthPx: Int, heightPx: Int, tileSize: Int = TILE_SIZE): List<TilePlacement> {
        if (widthPx <= 0 || heightPx <= 0) return emptyList()
        val (cx, cy) = worldPixel(center, zoom, tileSize)
        val left = cx - widthPx / 2.0
        val top = cy - heightPx / 2.0
        val perAxis = 1 shl zoom
        val firstX = floor(left / tileSize).toInt()
        val lastX = floor((left + widthPx - 1) / tileSize).toInt()
        val firstY = floor(top / tileSize).toInt()
        val lastY = floor((top + heightPx - 1) / tileSize).toInt()
        return buildList {
            for (ty in firstY..lastY) {
                if (ty < 0 || ty >= perAxis) continue
                for (tx in firstX..lastX) {
                    val wrapped = ((tx % perAxis) + perAxis) % perAxis
                    add(
                        TilePlacement(
                            x = wrapped,
                            y = ty,
                            zoom = zoom,
                            offsetX = floor(tx * tileSize - left).toInt(),
                            offsetY = floor(ty * tileSize - top).toInt(),
                        ),
                    )
                }
            }
        }
    }

    private fun wrapLongitude(lon: Double): Double {
        var v = lon
        while (v > 180.0) v -= 360.0
        while (v < -180.0) v += 360.0
        return v
    }
}
