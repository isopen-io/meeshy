package me.meeshy.sdk.model.game

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class GameMytheTest {

    @Test
    fun `une emission illisible n'a pas de Signature`() {
        assertThat(GameMythe.signature(0)).isNull()
        assertThat(GameMythe.signature(-3)).isNull()
    }

    @Test
    fun `la Signature d'une emission est deterministe`() {
        assertThat(GameMythe.signature(1234)).isEqualTo(GameMythe.signature(1234))
    }

    @Test
    fun `la dizaine fixe les rayons l'unite la gemme et le numero est grave`() {
        val first = GameMythe.signature(1)!!
        assertThat(first.rays).hasSize(12)
        assertThat(first.gem.angle).isEqualTo(18)
        assertThat(first.numeral).isEqualTo("1")
        assertThat(first.beads).isEmpty()
        assertThat(first.rays.first()).isEqualTo(MythicSignatureLine(512.0, 132.0, 512.0, 82.0))
        val last = GameMythe.signature(100)!!
        assertThat(last.rays).hasSize(30)
        assertThat(last.gem.angle).isEqualTo(342)
        assertThat(GameMythe.signature(101)!!.rays).hasSize(12)
    }

    @Test
    fun `l'anneau allume une perle par bit`() {
        assertThat(GameMythe.signature(100)!!.beads).isEmpty()
        assertThat(GameMythe.signature(101)!!.beads.map { it.slot }).containsExactly(1 - 1)
        assertThat(GameMythe.signature(301)!!.beads.map { it.slot }).containsExactly(0, 1).inOrder()
        assertThat(GameMythe.signature(409_600)!!.beads).hasSize(12)
        assertThat(GameMythe.signature(409_601)!!.beads).isEmpty()
    }

    @Test
    fun `la teinte avance de l'angle d'or en entiers`() {
        assertThat(GameMythe.hue(1)).isEqualTo(0)
        assertThat(GameMythe.hue(2)).isEqualTo(138)
        assertThat(GameMythe.hue(Int.MAX_VALUE)).isIn(0..359)
    }

    @Test
    fun `la gemme ne touche jamais le halo`() {
        GameMythe.signatures(360).forEach { design ->
            val reach = design.halo.outer + design.halo.strokeWidth / 2
            assertThat(design.gem.orbit - design.gem.r).isGreaterThan(reach)
        }
    }

    @Test
    fun `cent Signatures sont deux a deux distinctes`() {
        val seen = GameMythe.signatures().map { Triple(it.rays.size, it.gem.angle, it.beads.map { b -> b.slot }) }
        assertThat(seen.toSet()).hasSize(100)
        assertThat(GameMythe.signatures(0)).isEmpty()
    }

    @Test
    fun `une Gloire d'un million ouvre droit a une place`() {
        assertThat(GameMythe.reachesMythe(999_999)).isFalse()
        assertThat(GameMythe.reachesMythe(1_000_000)).isTrue()
    }

    @Test
    fun `la prochaine place est la plus petite libre`() {
        assertThat(GameMythe.nextNumber(emptyList())).isEqualTo(1)
        assertThat(GameMythe.nextNumber(listOf(1, 2, 4))).isEqualTo(3)
        assertThat(GameMythe.nextNumber((1..100).toList())).isNull()
        assertThat(GameMythe.freeNumbers(listOf(0, 101, 5)).size).isEqualTo(99)
    }

    @Test
    fun `le franchissement est le premier instant ou le total atteint le million`() {
        val gains = listOf(
            GloryGain(500_000, "2027-01-02T00:00:00.000Z"),
            GloryGain(600_000, "2027-03-01T00:00:00.000Z"),
            GloryGain(500_000, "2026-12-01T00:00:00.000Z"),
        )
        assertThat(GameMythe.crossedAt(gains)).isEqualTo("2027-01-02T00:00:00.000Z")
        assertThat(GameMythe.crossedAt(listOf(GloryGain(999_999, "2027-01-01T00:00:00.000Z")))).isNull()
    }

    @Test
    fun `les places vont dans l'ordre d'arrivee sans doubler un compte deja assis`() {
        val at = "2027-01-02T00:00:00.000Z"
        val grants = GameMythe.assignSeats(
            taken = listOf(1, 2, 4),
            seated = listOf("z"),
            arrivals = listOf(
                MythicArrival("b", 1_000_000, at),
                MythicArrival("a", 1_000_000, at),
                MythicArrival("c", 1_000_000, "2027-01-01T00:00:00.000Z"),
                MythicArrival("z", 1_000_000, "2027-01-01T00:00:00.000Z"),
                MythicArrival("low", 999_999, "2027-01-01T00:00:00.000Z"),
            ),
        )
        assertThat(grants).containsExactly(MythicSeatGrant("c", 3), MythicSeatGrant("a", 5), MythicSeatGrant("b", 6)).inOrder()
    }

    @Test
    fun `jamais au dela de la centieme place`() {
        val taken = (1..100).filter { it != 12 }
        val grants = GameMythe.assignSeats(
            taken,
            emptyList(),
            listOf(
                MythicArrival("late", 1_000_000, "2027-01-05T00:00:00.000Z"),
                MythicArrival("early", 1_000_000, "2027-01-02T00:00:00.000Z"),
            ),
        )
        assertThat(grants).containsExactly(MythicSeatGrant("early", 12))
    }
}
