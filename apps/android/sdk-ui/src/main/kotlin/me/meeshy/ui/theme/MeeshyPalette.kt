package me.meeshy.ui.theme

import androidx.compose.ui.graphics.Color

/**
 * Meeshy brand palette — the Indigo identity.
 * See packages/MeeshySDK/CLAUDE.md "Visual Identity — Indigo Brand".
 */
object MeeshyPalette {
    val Indigo50 = Color(0xFFEEF2FF)
    val Indigo100 = Color(0xFFE0E7FF)
    val Indigo200 = Color(0xFFC7D2FE)
    val Indigo300 = Color(0xFFA5B4FC)
    val Indigo400 = Color(0xFF818CF8)
    val Indigo500 = Color(0xFF6366F1) // primary
    val Indigo600 = Color(0xFF4F46E5)
    val Indigo700 = Color(0xFF4338CA) // primary deep
    val Indigo800 = Color(0xFF3730A3)
    val Indigo900 = Color(0xFF312E81)
    val Indigo950 = Color(0xFF1E1B4B)

    val Success = Color(0xFF34D399)
    val Error = Color(0xFFF87171)
    val Warning = Color(0xFFFBBF24)
    val Info = Color(0xFF60A5FA)

    val White = Color(0xFFFFFFFF)
    val Ink = Color(0xFF09090B)

    /** THE signature gradient — always Indigo500 → Indigo700. */
    val BrandGradient = listOf(Indigo500, Indigo700)
    val BrandGradientLight = listOf(Indigo400, Indigo500)
}
