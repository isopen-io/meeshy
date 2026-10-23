package me.meeshy.sdk.model.game

import com.google.common.truth.Truth.assertThat
import org.junit.Test
import kotlin.math.floor

class GameRankCrestTest {

    private fun fmt(v: Double): String = if (v == floor(v)) v.toLong().toString() else v.toString()

    private fun nums(vararg v: Double): String = v.joinToString(",") { fmt(it) }

    private fun tone(t: CrestTone): String = t.name.lowercase()

    private fun describe(rank: GloryRank, piece: CrestPiece): String {
        val name = rank.name.lowercase()
        return when (piece) {
            is CrestPiece.Line -> "$name|line|${nums(piece.x1, piece.y1, piece.x2, piece.y2, piece.width)}|${tone(piece.tone)}"
            is CrestPiece.Arc ->
                "$name|arc|${nums(piece.cx, piece.cy, piece.r, piece.from, piece.to, piece.width)}|${tone(piece.tone)}"
            is CrestPiece.Curve -> {
                val segments = piece.segments.joinToString("/") { nums(it.c1x, it.c1y, it.c2x, it.c2y, it.x, it.y) }
                "$name|curve|${nums(piece.x, piece.y, piece.width)};$segments|${tone(piece.tone)}"
            }
            is CrestPiece.Leaf ->
                "$name|leaf|${nums(piece.x1, piece.y1, piece.x2, piece.y2, piece.bulge)}|${tone(piece.tone)}"
            is CrestPiece.Dot -> "$name|dot|${nums(piece.cx, piece.cy, piece.r)}|${tone(piece.tone)}"
        }
    }

    private fun describeNotches(division: Int): String =
        "notches|$division|" + GameRankCrest.notches(division).joinToString("/") {
            "${nums(it.x, it.y1, it.y2, it.width)},${it.on}"
        }

    private fun describeHalo(edition: Int?): String {
        val h = GameRankCrest.mythicHalo(edition)
        val rays = h.rays.joinToString("/") { nums(it.x1, it.y1, it.x2, it.y2) }
        val gem = h.gem?.joinToString("/") { "${fmt(it.x)},${fmt(it.y)}" } ?: ""
        val beads = h.beads.joinToString("/") { nums(it.cx, it.cy, it.r) }
        val numeral = h.numeral?.let { "${it.text},${fmt(it.x)},${fmt(it.y)},${fmt(it.size)}" } ?: ""
        return "halo|${edition ?: "null"}|${h.edition ?: "null"}|${h.hue ?: "null"}|${fmt(h.rayWidth)}" +
            "|rays=$rays|gem=$gem|beads=$beads|num=$numeral"
    }

    private fun computedLines(): List<String> =
        GloryRank.entries.flatMap { rank -> GameRankCrest.pieces(rank).map { describe(rank, it) } } +
            (1..5).map(::describeNotches) +
            listOf(null, 1, 2, 10, 11, 100, 101, 137, 250, 4096).map(::describeHalo)

    private fun goldenLines(): List<String> =
        checkNotNull(javaClass.getResourceAsStream("rank-crest-golden.txt")) { "golden manquant" }
            .bufferedReader().readLines().filter { it.isNotBlank() }

    @Test
    fun `la table des pieces, des encoches et du halo est identique a rank-crest ts coordonnee pour coordonnee`() {
        val computed = computedLines()
        val golden = goldenLines()
        assertThat(computed).hasSize(golden.size)
        computed.zip(golden).forEach { (mine, web) -> assertThat(mine).isEqualTo(web) }
    }

    @Test
    fun `le nombre de pieces ne descend jamais d'un rang au suivant jusqu'a Legende`() {
        val counts = GloryRank.entries.filter { it != GloryRank.Mythe }.map { GameRankCrest.pieces(it).size }
        assertThat(counts).isInOrder()
        assertThat(GameRankCrest.pieces(GloryRank.Mythe)).isEmpty()
    }

    @Test
    fun `cinq encoches, autant de pleines que 6 moins la division, les vides en creux`() {
        (1..5).forEach { division ->
            val notches = GameRankCrest.notches(division)
            assertThat(notches).hasSize(5)
            assertThat(notches.count { it.on }).isEqualTo(6 - division)
            assertThat(notches.map { it.on }).isEqualTo(notches.map { it.on }.sortedByDescending { it })
        }
        assertThat(GameRankCrest.notches(null)).isEmpty()
        assertThat(GameRankCrest.notches(0)).isEmpty()
        assertThat(GameRankCrest.notches(5).map { it.x }).containsExactly(82.0, 91.0, 100.0, 109.0, 118.0).inOrder()
    }

    @Test
    fun `le corps de la gravure se resserre avec les chiffres du niveau`() {
        assertThat(listOf(7, 34, 100, 1000, 10000).map(GameRankCrest::levelEngravingSize))
            .containsExactly(15.0, 15.0, 12.0, 9.5, 8.0).inOrder()
    }

    @Test
    fun `sans emission lisible le halo a douze rayons et rien d'autre`() {
        val halo = GameRankCrest.mythicHalo(0)
        assertThat(halo.rays).hasSize(12)
        assertThat(halo.gem).isNull()
        assertThat(halo.numeral).isNull()
        assertThat(halo.beads).isEmpty()
    }

    @Test
    fun `le cadre compact garde la proportion du cadre entier`() {
        val ratio = GameRankCrest.fullFrame.height / GameRankCrest.fullFrame.width
        assertThat(GameRankCrest.compactFrame.height / GameRankCrest.compactFrame.width).isWithin(1e-9).of(ratio)
        assertThat(GameRankCrest.compactMythicFrame.height / GameRankCrest.compactMythicFrame.width).isWithin(1e-9).of(ratio)
    }
}
