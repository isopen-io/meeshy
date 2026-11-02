package me.meeshy.sdk.model.game

import com.google.common.truth.Truth.assertThat
import org.junit.Test
import kotlin.math.hypot

class GameMedalGeometryTest {

    @Test
    fun `sept perles dont la perle du milieu est a midi au-dessus du centre`() {
        val pearls = GameMedalGeometry.pearlCenters()
        assertThat(pearls).hasSize(7)
        val middle = pearls[3]
        assertThat(middle.x).isWithin(1e-9).of(50.0)
        assertThat(middle.y).isWithin(1e-9).of(52.0 - 35.5)
    }

    @Test
    fun `les perles sont rangees de gauche a droite sur la lunette`() {
        val xs = GameMedalGeometry.pearlCenters().map { it.x }
        assertThat(xs).isInStrictOrder()
        GameMedalGeometry.pearlCenters().forEach {
            assertThat(hypot(it.x - 50.0, it.y - 52.0)).isWithin(1e-9).of(35.5)
        }
    }

    @Test
    fun `autant de perles allumees que le rang de la matiere borne a sept`() {
        assertThat((0 until 7).map { GameMedalGeometry.isPearlLit(it, rank = 3) })
            .containsExactly(true, true, true, false, false, false, false).inOrder()
        assertThat((0 until 7).count { GameMedalGeometry.isPearlLit(it, rank = 12) }).isEqualTo(7)
        assertThat((0 until 7).count { GameMedalGeometry.isPearlLit(it, rank = 0) }).isEqualTo(0)
    }

    @Test
    fun `le ruban commence a l'or qui est le quatrieme rang`() {
        assertThat((1..7).map { GameMedalGeometry.hasRibbon(it) })
            .containsExactly(false, false, false, true, true, true, true).inOrder()
        assertThat(GameMedalGeometry.hasRibbon(0)).isFalse()
    }

    @Test
    fun `la progression est bornee et un nombre non fini vaut zero`() {
        assertThat(GameMedalGeometry.clampProgress(-1.0)).isEqualTo(0.0)
        assertThat(GameMedalGeometry.clampProgress(3.0)).isEqualTo(1.0)
        assertThat(GameMedalGeometry.clampProgress(Double.NaN)).isEqualTo(0.0)
        assertThat(GameMedalGeometry.clampProgress(Double.POSITIVE_INFINITY)).isEqualTo(0.0)
        assertThat(GameMedalGeometry.clampProgress(0.4)).isEqualTo(0.4)
    }

    @Test
    fun `l'arc part de midi et tourne dans le sens horaire`() {
        val quarter = GameMedalGeometry.arcPoints(0.25)
        assertThat(quarter.first().x).isWithin(1e-9).of(50.0)
        assertThat(quarter.first().y).isWithin(1e-9).of(52.0 - 41.0)
        assertThat(quarter.last().x).isWithin(1e-9).of(50.0 + 41.0)
        assertThat(quarter.last().y).isWithin(1e-9).of(52.0)
    }

    @Test
    fun `l'arc est vide a zero et plein a un`() {
        assertThat(GameMedalGeometry.arcPoints(0.0)).isEmpty()
        assertThat(GameMedalGeometry.isArcComplete(1.0)).isTrue()
        assertThat(GameMedalGeometry.isArcComplete(0.99)).isFalse()
    }

    @Test
    fun `l'arc a au moins deux segments et un par centieme de tour`() {
        assertThat(GameMedalGeometry.arcPoints(0.001).size).isEqualTo(3)
        assertThat(GameMedalGeometry.arcPoints(0.5).size).isEqualTo(49)
    }

    @Test
    fun `les pastilles d'une collection partent de midi et un total nul vaut un`() {
        val dots = GameMedalGeometry.collectionDots(total = 4)
        assertThat(dots).hasSize(4)
        assertThat(dots[0].x).isWithin(1e-9).of(36.0)
        assertThat(dots[0].y).isWithin(1e-9).of(36.0 - 18.0)
        assertThat(dots[1].x).isWithin(1e-9).of(36.0 + 18.0)
        assertThat(GameMedalGeometry.collectionDots(total = 0)).hasSize(1)
    }
}
