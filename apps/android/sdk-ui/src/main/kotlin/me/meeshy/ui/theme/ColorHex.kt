package me.meeshy.ui.theme

import androidx.compose.ui.graphics.Color

/**
 * Parse a Meeshy hex color string ("3498DB" or "#3498DB") into a Compose [Color].
 * Used to bridge [me.meeshy.sdk.theme.DynamicColorGenerator] (hex strings) into Compose.
 */
fun hexColor(hex: String): Color {
    val clean = hex.trim().removePrefix("#")
    if (clean.length != 6) return Color.Unspecified
    val value = clean.toLongOrNull(16) ?: return Color.Unspecified
    return Color(
        red = ((value shr 16) and 0xFF).toInt(),
        green = ((value shr 8) and 0xFF).toInt(),
        blue = (value and 0xFF).toInt(),
    )
}
