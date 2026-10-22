package me.meeshy.ui.component.game

import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color

/** Un arrêt de dégradé : position de 0 à 1 et couleur. */
public typealias GameStop = Pair<Float, Color>

internal fun gameHex(rgb: Long): Color = Color(0xFF000000L or rgb)

/**
 * Les dégradés et couleurs de la planche, nommés une fois (miroir de `GamePalette`). Les valeurs sont les
 * jetons `--game-*` du web, transcrits stop pour stop.
 */
public object GamePalette {

    public val prismStops: List<GameStop> = listOf(
        0f to gameHex(0xf87171),
        0.25f to gameHex(0xfbbf24),
        0.5f to gameHex(0x34d399),
        0.75f to gameHex(0x60a5fa),
        1f to gameHex(0xa855f7),
    )

    public val coinSilver: List<GameStop> = listOf(
        0f to gameHex(0xf3f5f9), 0.45f to gameHex(0xa8b1bf), 1f to gameHex(0x5f6a7d),
    )
    public val coinSilverInner: List<GameStop> = listOf(0f to gameHex(0xe3e7ee), 1f to gameHex(0x8f99aa))
    public val coinGold: List<GameStop> = listOf(
        0f to gameHex(0xfff1b8), 0.5f to gameHex(0xe2a72e), 1f to gameHex(0x8a5a10),
    )
    public val coinGoldInner: List<GameStop> = listOf(
        0f to gameHex(0xffeaa6), 0.55f to gameHex(0xe3a935), 1f to gameHex(0xa86f14),
    )
    public val coinDiamondInner: List<GameStop> = listOf(
        0f to gameHex(0xfff3c8), 0.3f to gameHex(0xf6fbff), 0.62f to gameHex(0xe8b545), 1f to gameHex(0xa2701a),
    )
    public val diamond: List<GameStop> = listOf(
        0f to gameHex(0xffffff), 0.5f to gameHex(0xd7efff), 1f to gameHex(0x8fb6de),
    )
    public val indigo: List<GameStop> = listOf(0f to gameHex(0x6366f1), 1f to gameHex(0x312e81))

    public val coinGoldInk: Color = gameHex(0x5e3c0b)
    public val coinDiamondInk: Color = gameHex(0x5a3a0c)
    public val coinVein: Color = gameHex(0xd6a93c)
    public val sparkles: List<Color> =
        listOf(0xffffffL, 0xcdeeffL, 0xffd6f2L, 0xd8ffe9L, 0xfff3c4L).map(::gameHex)
    public val glint: Color = Color.White

    public val ink: Color = gameHex(0x1c1941)
    public val coinInk: Color = gameHex(0x3f4858)
    public val coinRim: Color = gameHex(0x5f6a7d)
    public val coinHighlight: Color = gameHex(0xf3f5f9)
    public val violet: Color = gameHex(0x8b5cf6)
    public val gold: Color = gameHex(0xfbbf24)
    public val laurel: Color = gameHex(0x10b981)

    /** L'ombre portée de la Signature frappée ou gravée. */
    public val signatureShadow: Color = gameHex(0x2b3342)

    /**
     * Le dégradé tel que SVG le pose dans la boîte englobante de la forme (`objectBoundingBox`) : [from] et
     * [to] sont des points unitaires de [box].
     */
    public fun linear(stops: List<GameStop>, from: Offset, to: Offset, box: Rect): Brush =
        Brush.linearGradient(
            *stops.toTypedArray(),
            start = Offset(box.left + from.x * box.width, box.top + from.y * box.height),
            end = Offset(box.left + to.x * box.width, box.top + to.y * box.height),
        )

    /** (0,0) → (1,1), la direction par défaut de SVG pour ces dégradés. */
    public fun diagonal(stops: List<GameStop>, box: Rect): Brush =
        linear(stops, Offset(0f, 0f), Offset(1f, 1f), box)
}
