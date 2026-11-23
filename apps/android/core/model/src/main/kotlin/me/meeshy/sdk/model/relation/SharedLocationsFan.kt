package me.meeshy.sdk.model.relation

import me.meeshy.sdk.model.location.GeoPoint
import me.meeshy.sdk.model.location.SlippyMap
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.sin

/** Un point à l'écran, dans l'unité de la carte (dp pour `TileMapView`). */
public data class ScreenPoint(val x: Double, val y: Double)

/**
 * L'ÉVENTAIL DES ÉPINGLES QUI SE RECOUVRENT (#19884), iso `LocationMapFan.spread` (iOS, #19851) et `spreadPins` (web, #19883).
 * À la précision « ville », toutes les positions servies tombent au même centre : les épingles plus proches que
 * `minimumDistance` forment un groupe, posé en cercle autour de son centre, la première en haut. Une épingle seule garde son
 * point servi. L'ordre des identifiants fixe l'éventail : la même charge, servie dans un autre ordre, ne bouge pas.
 */
public object SharedLocationsFan {
    public fun spread(points: List<Pair<String, ScreenPoint>>, minimumDistance: Double): Map<String, ScreenPoint> =
        groupsOf(points, minimumDistance).flatMap { fanned(it, minimumDistance) }.toMap()

    /** L'éventail posé sur la carte : chaque personne reçoit le point géographique où son épingle se dessine à ce zoom. */
    public fun place(
        points: List<Pair<String, GeoPoint>>,
        zoom: Int,
        tileSize: Int,
        minimumDistance: Double,
    ): Map<String, GeoPoint> {
        val screen = points.map { (id, point) ->
            id to SlippyMap.worldPixel(point, zoom, tileSize).let { (x, y) -> ScreenPoint(x, y) }
        }
        val served = points.toMap()
        val origin = screen.toMap()
        return spread(screen, minimumDistance).mapValues { (id, placed) ->
            if (placed == origin[id]) served.getValue(id) else SlippyMap.point(placed.x, placed.y, zoom, tileSize)
        }
    }

    private fun distance(a: ScreenPoint, b: ScreenPoint): Double = hypot(a.x - b.x, a.y - b.y)

    private fun groupsOf(points: List<Pair<String, ScreenPoint>>, minimumDistance: Double): List<List<Pair<String, ScreenPoint>>> =
        points.sortedBy { it.first }.fold(emptyList()) { groups, entry ->
            val index = groups.indexOfFirst { group -> group.any { distance(it.second, entry.second) < minimumDistance } }
            if (index == -1) groups + listOf(listOf(entry)) else groups.mapIndexed { i, group -> if (i == index) group + entry else group }
        }

    private fun fanned(group: List<Pair<String, ScreenPoint>>, minimumDistance: Double): List<Pair<String, ScreenPoint>> {
        if (group.size == 1) return group
        val n = group.size.toDouble()
        val centre = ScreenPoint(group.sumOf { it.second.x } / n, group.sumOf { it.second.y } / n)
        val radius = max(minimumDistance * 0.6, minimumDistance / (2 * sin(PI / n)))
        return group.mapIndexed { index, (id, _) ->
            val angle = -PI / 2 + 2 * PI * index / n
            id to ScreenPoint(centre.x + radius * cos(angle), centre.y + radius * sin(angle))
        }
    }
}
