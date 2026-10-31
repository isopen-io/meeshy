package me.meeshy.sdk.model.game

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import java.io.File
import kotlin.math.abs
import me.meeshy.sdk.model.game.MeeshCoinGeometry.Decor
import me.meeshy.sdk.model.game.MeeshCoinLayout.Point
import org.junit.Test

/**
 * LA MEESH, UNE SEULE PIÈCE (#11176, Android #13892) : Android rejoue `packages/shared/design/meesh-coin.json`, le
 * fichier que le web lit et qu'iOS rejoue. Ce témoin DÉCODE le fichier partagé et exige la même valeur, puis compare les
 * formes calculées aux valeurs relevées sur le web — les mêmes que `MeeshCoinGeometryTests` (iOS) : une coordonnée, une
 * formule ou un arrondi changé d'un seul côté le rougit.
 */
class MeeshCoinGeometryTest {

    private fun sharedFile(): File {
        var dir: File? = File("").absoluteFile
        while (dir != null) {
            val candidate = File(dir, "packages/shared/design/meesh-coin.json")
            if (candidate.isFile) return candidate
            dir = dir.parentFile
        }
        error("meesh-coin.json introuvable en remontant depuis ${File("").absolutePath}")
    }

    private fun near(actual: Point, x: Double, y: Double) {
        assertWithMessage("$actual ≈ ($x, $y)").that(abs(actual.x - x) < 0.0011 && abs(actual.y - y) < 0.0011).isTrue()
    }

    private val geometry = MeeshCoinGeometry.shared

    @Test
    fun `la geometrie d'Android est celle du fichier partage, champ pour champ`() {
        assertThat(MeeshCoinGeometry.decode(sharedFile().readText())).isEqualTo(MeeshCoinGeometry.shared)
    }

    @Test
    fun `la couronne de l'avers est universelle, deux fois, jamais traduite`() {
        val layout = MeeshCoinLayout.inscription()
        assertThat(layout.map { it.glyph }.joinToString("")).isEqualTo("MEESHY·1MEESH·MEESHY·1MEESH·")
        assertThat(layout.count { it.isSeparator }).isEqualTo(4)
        near(layout.first().point, 15.0, 60.0)
        assertThat(layout.first().rotate).isEqualTo(270.0)
        near(layout[1].point, 15.614, 52.593)
        assertThat(abs(layout[1].rotate - 279.474)).isLessThan(0.0011)
        assertThat(layout[6].index).isEqualTo(7)
        near(layout[6].point, 41.924, 18.79)
        assertThat(layout.last().index).isEqualTo(36)
        near(layout.last().point, 17.438, 74.611)
    }

    @Test
    fun `le revers porte l'oiseau de son edition, Mee et Meo face a face au prisme`() {
        assertThat(geometry.edition(MeeshEdition.Silver).birds.map { it.bird }).containsExactly(GameEngravedBird.MeeJoy)
        assertThat(geometry.edition(MeeshEdition.Gold).birds.map { it.bird }).containsExactly(GameEngravedBird.MeoOpen)
        assertThat(geometry.edition(MeeshEdition.Prism).birds.map { it.bird })
            .containsExactly(GameEngravedBird.MeeJoy, GameEngravedBird.MeoOpen).inOrder()
        assertThat(geometry.edition(MeeshEdition.Prism).birds.map { it.flip }).containsExactly(false, true).inOrder()
    }

    @Test
    fun `les decors - argent sobre, or raffine, prisme royal`() {
        assertThat(geometry.edition(MeeshEdition.Silver).decor.obverse).containsExactly(Decor.Veins)
        assertThat(geometry.edition(MeeshEdition.Gold).separator).isEqualTo(MeeshCoinGeometry.Separator.Star)
        assertThat(geometry.edition(MeeshEdition.Gold).decor.reverse).contains(Decor.Laurels)
        assertThat(geometry.edition(MeeshEdition.Gold).field).isEqualTo(MeeshCoinGeometry.Paint.CoinGoldIn)
        assertThat(geometry.edition(MeeshEdition.Prism).decor.reverse).contains(Decor.Crown)
        assertThat(geometry.edition(MeeshEdition.Prism).decor.obverse).contains(Decor.Sparkles)
        assertThat(geometry.edition(MeeshEdition.Prism).flute).isEqualTo(MeeshCoinGeometry.Flute.Iris)
    }

    @Test
    fun `le grenetis, les cabochons, la rosace et le soleil tombent aux points du web`() {
        near(MeeshCoinLayout.beads(geometry.decor.beads.prism[0])[1], 109.328, 65.185)

        val cabochons = MeeshCoinLayout.cabochons()
        assertThat(cabochons).hasSize(8)
        near(cabochons.first().center, 108.966, 80.282)
        near(cabochons.first().outer[0], 110.734, 82.05)
        near(cabochons.first().outer[7], 111.466, 80.282)
        near(cabochons.first().table[0], 109.85, 81.166)

        near(MeeshCoinLayout.rosetteCenters()[1], 72.557, 63.365)

        val rays = MeeshCoinLayout.sunburst(fieldRadius = 45.0)
        assertThat(rays).hasSize(64)
        near(rays[0].from, 64.0, 60.0)
        near(rays[0].to, 103.0, 60.0)
        near(rays[1].from, 63.981, 60.392)
        near(rays[1].to, 92.702, 63.221)
    }

    @Test
    fun `les etoiles de l'or, les eclats du prisme et les lauriers tombent aux points du web`() {
        val star = MeeshCoinLayout.star(MeeshCoinLayout.inscription()[6])
        assertThat(star).hasSize(10)
        near(star[0], 41.08, 16.867)
        near(star[9], 41.19, 18.361)

        val sparkle = MeeshCoinLayout.sparkle(geometry.decor.sparkles.points[1])
        near(sparkle[0], 82.0, 27.4)
        near(sparkle[1], 82.572, 29.428)
        near(sparkle[6], 79.4, 30.0)

        val leaf = MeeshCoinLayout.leaf(geometry.decor.laurels.leaves[0])
        near(leaf.outerControl, 39.902, 98.501)
        near(leaf.tip, 37.314, 97.875)
        near(leaf.innerControl, 38.842, 95.694)
    }

    @Test
    fun `les eclats scintillent comme gameTwinkle - petits et pales au repos, pleins au milieu`() {
        val rest = MeeshCoinLayout.twinkle(0.0)
        val peak = MeeshCoinLayout.twinkle(1.2)
        assertThat(abs(rest.scale - 0.6)).isLessThan(0.001)
        assertThat(abs(rest.opacity - 0.35)).isLessThan(0.001)
        assertThat(abs(peak.scale - 1.15)).isLessThan(0.001)
        assertThat(abs(peak.opacity - 1.0)).isLessThan(0.001)
        assertWithMessage("un délai négatif reste dans la période").that(abs(MeeshCoinLayout.twinkle(-1.2).scale - 1.15)).isLessThan(0.001)
    }

    @Test
    fun `seuls les eclats du prisme scintillent, jamais sous reduire les animations ni hors ecran`() {
        val prism = geometry.edition(MeeshEdition.Prism).decor.obverse
        val silver = geometry.edition(MeeshEdition.Silver).decor.obverse
        assertThat(MeeshCoinLayout.twinkles(prism, reduceMotion = false, onScreen = true)).isTrue()
        assertThat(MeeshCoinLayout.twinkles(prism, reduceMotion = true, onScreen = true)).isFalse()
        assertThat(MeeshCoinLayout.twinkles(prism, reduceMotion = false, onScreen = false)).isFalse()
        assertThat(MeeshCoinLayout.twinkles(silver, reduceMotion = false, onScreen = true)).isFalse()
    }

    @Test
    fun `le flan et l'avers lisent les decors de l'avers, le revers ceux du revers`() {
        assertThat(MeeshCoinFace.Blank.decor(geometry.edition(MeeshEdition.Prism))).doesNotContain(Decor.Crown)
        assertThat(MeeshCoinFace.Obverse.decor(geometry.edition(MeeshEdition.Prism))).doesNotContain(Decor.Crown)
        assertThat(MeeshCoinFace.Reverse(number = 1000, year = 2026).decor(geometry.edition(MeeshEdition.Prism)))
            .contains(Decor.Crown)
    }

    @Test
    fun `Mee et Meo sont graves trait pour trait, leurs reflets hors de la silhouette`() {
        assertThat(GameEngravedBirdShapes.meeJoy).hasSize(21)
        assertThat(GameEngravedBirdShapes.meoOpen).hasSize(29)
        assertThat(GameEngravedBirdShapes.meeJoy.count { it.isHighlight }).isEqualTo(2)
        val body = GameEngravedBirdShapes.meoOpen[6]
        assertThat(body.geometry).isEqualTo(GameEngravedBirdShapes.Geometry.Circle(70.0, 80.0, 40.0))
        assertThat(GameEngravedBirdShapes.shapes(GameEngravedBird.MeoOpen).first().geometry)
            .isEqualTo(GameEngravedBirdShapes.Geometry.Ellipse(26.0, 70.0, 13.0, 24.0, -34.0))
    }
}
