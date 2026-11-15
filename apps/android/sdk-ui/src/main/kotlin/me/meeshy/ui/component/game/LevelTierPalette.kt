package me.meeshy.ui.component.game

import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color

/**
 * Les vingt couleurs de palier (miroir de `LevelTierPalette`), du rouge Étincelle au prisme de Galaxie,
 * puis le ciel profond jusqu'à Singularité. Le palier se désigne par son RANG de 1 (Étincelle) à 20
 * (Singularité) : c'est l'ordre des cas de `LevelTierKey`.
 */
public object LevelTierPalette {

    public const val TIER_COUNT: Int = 20
    public const val GALAXIE: Int = 10
    public const val SINGULARITE: Int = 20

    private val colors: List<Color> = listOf(
        0xf87171L, // 1 étincelle
        0xfb923cL, // 2 lueur
        0xfbbf24L, // 3 lumière
        0xa3e635L, // 4 éclat
        0x34d399L, // 5 rayon
        0x22d3eeL, // 6 aurore
        0x60a5faL, // 7 comète
        0x818cf8L, // 8 étoile
        0xa855f7L, // 9 constellation
        0xa855f7L, // 10 galaxie (prisme)
        0xf472b6L, // 11 nébuleuse
        0x38bdf8L, // 12 pulsar
        0x818cf8L, // 13 quasar
        0xfbbf24L, // 14 supernova
        0xe879f9L, // 15 magnétar
        0x2dd4bfL, // 16 amas
        0x60a5faL, // 17 superamas
        0xc084fcL, // 18 cosmos
        0xf0abfcL, // 19 infini
        0xa855f7L, // 20 singularité (prisme, comme galaxie)
    ).map(::gameHex)

    private fun clamp(tier: Int): Int = tier.coerceIn(1, TIER_COUNT)

    public fun color(tier: Int): Color = colors[clamp(tier) - 1]

    /** Galaxie et Singularité sont des spectres : elles se peignent au prisme. */
    public fun isSpectral(tier: Int): Boolean = clamp(tier).let { it == GALAXIE || it == SINGULARITE }

    /** Le trait de l'arc : une couleur franche, ou le prisme tournant (balayage) des spectres. */
    public fun brush(tier: Int, center: Offset): Brush =
        if (isSpectral(tier)) {
            Brush.sweepGradient(*GamePalette.prismStops.toTypedArray(), center = center)
        } else {
            Brush.linearGradient(listOf(color(tier), color(tier)))
        }
}
