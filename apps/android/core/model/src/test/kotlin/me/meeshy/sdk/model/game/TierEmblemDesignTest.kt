package me.meeshy.sdk.model.game

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class TierEmblemDesignTest {

    private fun emblem(tier: LevelTierKey) = TierEmblemDesign.of(tier)

    @Test
    fun `les vingt paliers ont chacun un emblème non vide`() {
        assertThat(LevelTierKey.entries).hasSize(20)
        LevelTierKey.entries.forEach { assertThat(emblem(it).shapes).isNotEmpty() }
    }

    @Test
    fun `le nombre de primitives par palier suit tier-emblem ts`() {
        val counts = LevelTierKey.entries.map { emblem(it).shapes.size }
        assertThat(counts)
            .containsExactly(2, 3, 9, 1, 5, 4, 4, 1, 9, 3, 5, 4, 4, 1, 3, 8, 12, 5, 1, 14)
            .inOrder()
    }

    @Test
    fun `le coeur est plein ou ouvert comme sur le web`() {
        val open = LevelTierKey.entries.filter { !emblem(it).filledCore }
        assertThat(open).containsExactly(
            LevelTierKey.Rayon, LevelTierKey.Aurore, LevelTierKey.Comete, LevelTierKey.Constellation,
            LevelTierKey.Galaxie, LevelTierKey.Amas, LevelTierKey.Superamas, LevelTierKey.Cosmos, LevelTierKey.Infini,
        )
    }

    @Test
    fun `les etoiles de polygone reprennent les coordonnees arrondies au dixieme`() {
        assertThat((emblem(LevelTierKey.Etoile).shapes.single() as EmblemShape.Path).d).isEqualTo(
            "M0 -46L11.2 -15.4L43.7 -14.2L18.1 5.9L27 37.2L0 19L-27 37.2L-18.1 5.9L-43.7 -14.2L-11.2 -15.4Z",
        )
        assertThat((emblem(LevelTierKey.Eclat).shapes.single() as EmblemShape.Path).d).startsWith("M0 -46L7 -26.1L23 -39.8L19.1 -19.1")
        assertThat((emblem(LevelTierKey.Supernova).shapes.single() as EmblemShape.Path).d)
            .startsWith("M0 -47L4.7 -23.5L18 -43.4L13.3 -20L33.2 -33.2")
    }

    @Test
    fun `les rayons de lumiere et de singularite sont polaires`() {
        val lumiere = emblem(LevelTierKey.Lumiere).shapes
        assertThat(lumiere[0]).isEqualTo(EmblemShape.Circle(0.0, 0.0, 17.0, EmblemPaint.Fill))
        assertThat(lumiere[2]).isEqualTo(EmblemShape.Line(19.1, 19.1, 31.1, 31.1, 5.0))
        val singularite = emblem(LevelTierKey.Singularite).shapes
        assertThat(singularite[2]).isEqualTo(EmblemShape.Line(30.0, 0.0, 47.0, 0.0, 2.5))
        assertThat(singularite[3]).isEqualTo(EmblemShape.Line(26.0, 15.0, 40.7, 23.5, 2.5))
        assertThat(singularite[1]).isEqualTo(
            EmblemShape.Path("M-42 0 A42 15 0 1 0 42 0 A42 15 0 1 0 -42 0", EmblemPaint.Stroke(3.5)),
        )
    }

    @Test
    fun `l'eventail de rayon part du pied du cadre`() {
        val lines = emblem(LevelTierKey.Rayon).shapes
        assertThat(lines[0]).isEqualTo(EmblemShape.Line(-9.2, 28.3, -47.5, -3.9, 6.0))
        assertThat(lines[2]).isEqualTo(EmblemShape.Line(0.0, 24.0, 0.0, -26.0, 6.0))
    }

    @Test
    fun `la spirale de galaxie et ses lignes de champ sont symetriques`() {
        val galaxie = emblem(LevelTierKey.Galaxie).shapes
        assertThat((galaxie[1] as EmblemShape.Path).d)
            .isEqualTo("M0 0 C-8 8 -22 6 -26 -6 C-30 -22 -8 -36 12 -30 C36 -22 40 8 22 28 C6 44 -24 46 -40 28")
        val magnetar = emblem(LevelTierKey.Magnetar).shapes
        assertThat((magnetar[2] as EmblemShape.Path).d).isEqualTo("M0 16 C-34 46 -34 -46 0 -16")
    }

    @Test
    fun `la constellation relie cinq points puis les marque`() {
        val shapes = emblem(LevelTierKey.Constellation).shapes
        assertThat(shapes[0]).isEqualTo(EmblemShape.Line(-34.0, 18.0, -14.0, -14.0, 3.0))
        assertThat(shapes[3]).isEqualTo(EmblemShape.Line(32.0, -26.0, 36.0, 24.0, 3.0))
        assertThat(shapes[4]).isEqualTo(EmblemShape.Circle(-34.0, 18.0, 6.0, EmblemPaint.Fill))
    }

    @Test
    fun `les chiffres romains vont de I a XX`() {
        assertThat(TierEmblemDesign.roman(LevelTierKey.Etincelle)).isEqualTo("I")
        assertThat(TierEmblemDesign.roman(LevelTierKey.Galaxie)).isEqualTo("X")
        assertThat(TierEmblemDesign.roman(LevelTierKey.Singularite)).isEqualTo("XX")
    }
}
