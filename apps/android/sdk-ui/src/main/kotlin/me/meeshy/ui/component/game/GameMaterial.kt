package me.meeshy.ui.component.game

import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color

/**
 * Les huit matières du jeu (miroir de `GameMaterial.swift`) : cuivre → prisme, plus la flamme. Les
 * dégradés de la planche, stop pour stop. Une matière sert aux rangs, aux badges et aux trophées : UN type.
 */
public enum class GameMaterial(
    /** L'encre qui se grave sur la matière : sombre sur le métal clair, claire sur l'obsidienne. */
    public val ink: Color,
    /** Les arrêts du dégradé, de (0,0) à (1,1) sauf la flamme, qui monte. */
    public val stops: List<GameStop>,
    /** La couleur PLEINE d'un trait (un dégradé en boîte englobante ne peint pas un trait horizontal). */
    public val lineColor: Color,
) {
    COPPER(gameHex(0x5a2a12), pair(0xf3b48a, 0xa5552b), gameHex(0xa5552b)),
    BRONZE(gameHex(0x4a3010), pair(0xe7c08d, 0x8a5a24), gameHex(0x8a5a24)),
    SILVER(gameHex(0x3f4858), pair(0xf4f6fa, 0x8e98a8), gameHex(0x8e98a8)),
    GOLD(gameHex(0x6b4610), pair(0xfde68a, 0xb7791f), gameHex(0xb7791f)),
    PLATINUM(gameHex(0x2c4459), pair(0xe0f2fe, 0x5b7c99), gameHex(0x5b7c99)),
    OBSIDIAN(gameHex(0xd7d4f2), pair(0x55527a, 0x0e0d1a), gameHex(0x55527a)),
    PRISM(gameHex(0x1c1941), GamePalette.prismStops, gameHex(0x34d399)),
    FLAME(
        gameHex(0x7c2d12),
        listOf(0f to gameHex(0xef4444), 0.55f to gameHex(0xf97316), 1f to gameHex(0xfde047)),
        gameHex(0xf97316),
    );

    private val from: Offset get() = if (this == FLAME) Offset(0f, 1f) else Offset(0f, 0f)
    private val to: Offset get() = if (this == FLAME) Offset(0f, 0f) else Offset(1f, 1f)

    /** Le dégradé posé dans [box], à dessiner dans un `DrawScope`. */
    public fun brush(box: Rect): Brush = GamePalette.linear(stops, from, to, box)

    public companion object {
        /** Les cinq couleurs du prisme, dans l'ordre (jetons `--game-prism-0…4`). */
        public val prismColors: List<Color> get() = GamePalette.prismStops.map { it.second }
    }
}

private fun pair(from: Long, to: Long): List<GameStop> = listOf(0f to gameHex(from), 1f to gameHex(to))
