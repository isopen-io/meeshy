package me.meeshy.ui.component.game

import androidx.compose.ui.graphics.Color
import com.google.common.truth.Truth.assertThat
import org.junit.Test

class GameMaterialTest {

    private fun hex(rgb: Long) = Color(0xFF000000L or rgb)

    @Test
    fun `les sept metaux et la flamme reprennent les degrades de la planche stop pour stop`() {
        assertThat(GameMaterial.COPPER.stops).containsExactly(0f to hex(0xf3b48a), 1f to hex(0xa5552b)).inOrder()
        assertThat(GameMaterial.BRONZE.stops).containsExactly(0f to hex(0xe7c08d), 1f to hex(0x8a5a24)).inOrder()
        assertThat(GameMaterial.SILVER.stops).containsExactly(0f to hex(0xf4f6fa), 1f to hex(0x8e98a8)).inOrder()
        assertThat(GameMaterial.GOLD.stops).containsExactly(0f to hex(0xfde68a), 1f to hex(0xb7791f)).inOrder()
        assertThat(GameMaterial.PLATINUM.stops).containsExactly(0f to hex(0xe0f2fe), 1f to hex(0x5b7c99)).inOrder()
        assertThat(GameMaterial.OBSIDIAN.stops).containsExactly(0f to hex(0x55527a), 1f to hex(0x0e0d1a)).inOrder()
        assertThat(GameMaterial.PRISM.stops).isEqualTo(GamePalette.prismStops)
        assertThat(GameMaterial.FLAME.stops).containsExactly(
            0f to hex(0xef4444), 0.55f to hex(0xf97316), 1f to hex(0xfde047),
        ).inOrder()
    }

    @Test
    fun `le prisme a cinq arrets de rouge a violet`() {
        assertThat(GamePalette.prismStops.map { it.first }).containsExactly(0f, 0.25f, 0.5f, 0.75f, 1f).inOrder()
        assertThat(GameMaterial.prismColors).hasSize(5)
        assertThat(GameMaterial.prismColors.first()).isEqualTo(hex(0xf87171))
        assertThat(GameMaterial.prismColors.last()).isEqualTo(hex(0xa855f7))
    }

    @Test
    fun `l'encre gravee est sombre sur le metal clair et claire sur l'obsidienne`() {
        assertThat(GameMaterial.COPPER.ink).isEqualTo(hex(0x5a2a12))
        assertThat(GameMaterial.GOLD.ink).isEqualTo(hex(0x6b4610))
        assertThat(GameMaterial.PRISM.ink).isEqualTo(hex(0x1c1941))
        assertThat(GameMaterial.OBSIDIAN.ink).isEqualTo(hex(0xd7d4f2))
        assertThat(GameMaterial.entries.filter { it != GameMaterial.OBSIDIAN }.all { it.ink.luminance() < 0.4f }).isTrue()
        assertThat(GameMaterial.OBSIDIAN.ink.luminance()).isGreaterThan(0.6f)
    }

    @Test
    fun `la couleur pleine d'un trait est le second arret de la matiere`() {
        listOf(
            GameMaterial.COPPER, GameMaterial.BRONZE, GameMaterial.SILVER, GameMaterial.GOLD, GameMaterial.PLATINUM,
        ).forEach { assertThat(it.lineColor).isEqualTo(it.stops.last().second) }
        assertThat(GameMaterial.OBSIDIAN.lineColor).isEqualTo(hex(0x55527a))
        assertThat(GameMaterial.PRISM.lineColor).isEqualTo(hex(0x34d399))
        assertThat(GameMaterial.FLAME.lineColor).isEqualTo(hex(0xf97316))
    }

    @Test
    fun `huit matieres`() {
        assertThat(GameMaterial.entries).hasSize(8)
    }

    @Test
    fun `les vingt paliers ont leur couleur`() {
        val expected = listOf(
            0xf87171L, 0xfb923cL, 0xfbbf24L, 0xa3e635L, 0x34d399L, 0x22d3eeL, 0x60a5faL, 0x818cf8L, 0xa855f7L, 0xa855f7L,
            0xf472b6L, 0x38bdf8L, 0x818cf8L, 0xfbbf24L, 0xe879f9L, 0x2dd4bfL, 0x60a5faL, 0xc084fcL, 0xf0abfcL, 0xa855f7L,
        )
        assertThat((1..20).map { LevelTierPalette.color(it) }).containsExactlyElementsIn(expected.map(::hex)).inOrder()
    }

    @Test
    fun `Galaxie et Singularite sont des spectres, les autres non`() {
        assertThat((1..20).filter { LevelTierPalette.isSpectral(it) }).containsExactly(10, 20).inOrder()
    }

    @Test
    fun `un palier hors bornes se ramene a l'extremite`() {
        assertThat(LevelTierPalette.color(0)).isEqualTo(LevelTierPalette.color(1))
        assertThat(LevelTierPalette.color(99)).isEqualTo(LevelTierPalette.color(20))
    }

    private fun Color.luminance(): Float = 0.2126f * red + 0.7152f * green + 0.0722f * blue
}
