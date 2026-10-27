package me.meeshy.sdk.model.location

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
    val url: String get() = SlippyMap.tileUrl(x, y, zoom)
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

    fun tileUrl(x: Int, y: Int, zoom: Int): String = "https://tile.openstreetmap.org/$zoom/$x/$y.png"

    fun clampZoom(zoom: Int): Int = zoom.coerceIn(MIN_ZOOM, MAX_ZOOM)

    private fun worldSize(zoom: Int): Double = TILE_SIZE * 2.0.pow(zoom)

    /** Position du point sur le monde projeté à ce zoom, en pixels. */
    fun worldPixel(point: GeoPoint, zoom: Int): Pair<Double, Double> {
        val lat = point.latitude.coerceIn(-MAX_LATITUDE, MAX_LATITUDE)
        val size = worldSize(zoom)
        val x = (point.longitude + 180.0) / 360.0 * size
        val sinLat = kotlin.math.sin(Math.toRadians(lat))
        val y = (0.5 - ln((1 + sinLat) / (1 - sinLat)) / (4 * PI)) * size
        return x to y
    }

    /** Inverse de [worldPixel]. */
    fun point(worldX: Double, worldY: Double, zoom: Int): GeoPoint {
        val size = worldSize(zoom)
        val lon = worldX / size * 360.0 - 180.0
        val n = PI - 2 * PI * worldY / size
        val lat = Math.toDegrees(atan(sinh(n)))
        return GeoPoint(lat.coerceIn(-MAX_LATITUDE, MAX_LATITUDE), wrapLongitude(lon))
    }

    /** Le point sous le doigt qui a glissé de ([dx], [dy]) pixels : la carte suit le doigt, le centre part en sens inverse. */
    fun panned(center: GeoPoint, dx: Double, dy: Double, zoom: Int): GeoPoint {
        val (wx, wy) = worldPixel(center, zoom)
        val size = worldSize(zoom)
        return point(wx - dx, (wy - dy).coerceIn(0.0, size), zoom)
    }

    /** Les tuiles qui couvrent une fenêtre de [widthPx] x [heightPx] centrée sur [center]. */
    fun tilesCovering(center: GeoPoint, zoom: Int, widthPx: Int, heightPx: Int): List<TilePlacement> {
        if (widthPx <= 0 || heightPx <= 0) return emptyList()
        val (cx, cy) = worldPixel(center, zoom)
        val left = cx - widthPx / 2.0
        val top = cy - heightPx / 2.0
        val perAxis = 1 shl zoom
        val firstX = floor(left / TILE_SIZE).toInt()
        val lastX = floor((left + widthPx - 1) / TILE_SIZE).toInt()
        val firstY = floor(top / TILE_SIZE).toInt()
        val lastY = floor((top + heightPx - 1) / TILE_SIZE).toInt()
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
                            offsetX = (tx * TILE_SIZE - left).toInt(),
                            offsetY = (ty * TILE_SIZE - top).toInt(),
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
