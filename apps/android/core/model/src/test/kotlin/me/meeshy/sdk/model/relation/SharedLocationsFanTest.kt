package me.meeshy.sdk.model.relation

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.location.GeoPoint
import me.meeshy.sdk.model.location.SlippyMap
import org.junit.Test
import kotlin.math.hypot

/**
 * L'éventail des épingles qui se recouvrent (#19884), iso `LocationMapFan.spread` (iOS) et `spreadPins` (web, #19883) : à la
 * précision « ville », toutes les positions servies tombent au même centre, et une seule épingle restait visible.
 */
class SharedLocationsFanTest {
    private fun distance(a: ScreenPoint, b: ScreenPoint): Double = hypot(a.x - b.x, a.y - b.y)

    @Test
    fun `quatre personnes au meme point ont quatre places distinctes, aucune ne cache l'autre`() {
        val placed = SharedLocationsFan.spread(listOf("a", "b", "c", "d").map { it to ScreenPoint(100.0, 100.0) }, 40.0)

        assertThat(placed.keys).containsExactly("a", "b", "c", "d")
        val points = placed.values.toList()
        points.forEachIndexed { i, p ->
            points.drop(i + 1).forEach { q -> assertThat(distance(p, q)).isAtLeast(39.9) }
        }
    }

    @Test
    fun `une epingle seule reste a sa position servie`() {
        val placed = SharedLocationsFan.spread(
            listOf("a" to ScreenPoint(10.0, 10.0), "b" to ScreenPoint(300.0, 300.0)),
            40.0,
        )

        assertThat(placed["a"]).isEqualTo(ScreenPoint(10.0, 10.0))
        assertThat(placed["b"]).isEqualTo(ScreenPoint(300.0, 300.0))
    }

    @Test
    fun `l'eventail est centre sur le point partage et ne depend pas de l'ordre servi`() {
        val points = listOf("b", "a", "c").map { it to ScreenPoint(50.0, 80.0) }
        val placed = SharedLocationsFan.spread(points, 40.0)

        assertThat(placed.values.sumOf { it.x } / 3).isWithin(1e-6).of(50.0)
        assertThat(placed.values.sumOf { it.y } / 3).isWithin(1e-6).of(80.0)
        assertThat(SharedLocationsFan.spread(points.reversed(), 40.0)).isEqualTo(placed)
        assertThat(placed.getValue("a").y).isLessThan(80.0)
    }

    @Test
    fun `deux epingles proches sans etre confondues s'ecartent aussi`() {
        val placed = SharedLocationsFan.spread(
            listOf("a" to ScreenPoint(100.0, 100.0), "b" to ScreenPoint(110.0, 100.0)),
            40.0,
        )

        assertThat(distance(placed.getValue("a"), placed.getValue("b"))).isAtLeast(39.9)
    }

    @Test
    fun `sur la carte, quatre positions servies au meme centre rendent quatre points distincts a l'ecran`() {
        val paris = GeoPoint(48.85, 2.35)
        val zoom = 12
        val placed = SharedLocationsFan.place(
            points = listOf("u1", "u2", "u3", "u4").map { it to paris },
            zoom = zoom,
            tileSize = SlippyMap.TILE_SIZE,
            minimumDistance = 60.0,
        )

        assertThat(placed.keys).containsExactly("u1", "u2", "u3", "u4")
        val screen = placed.values.map { SlippyMap.worldPixel(it, zoom, SlippyMap.TILE_SIZE).let { (x, y) -> ScreenPoint(x, y) } }
        screen.forEachIndexed { i, p ->
            screen.drop(i + 1).forEach { q -> assertThat(distance(p, q)).isAtLeast(59.9) }
        }
    }

    @Test
    fun `sur la carte, une personne seule reste exactement a la position servie`() {
        val paris = GeoPoint(48.85, 2.35)
        val lyon = GeoPoint(45.76, 4.84)

        val placed = SharedLocationsFan.place(listOf("u1" to paris, "u2" to lyon), 12, SlippyMap.TILE_SIZE, 60.0)

        assertThat(placed["u1"]).isEqualTo(paris)
        assertThat(placed["u2"]).isEqualTo(lyon)
    }
}
