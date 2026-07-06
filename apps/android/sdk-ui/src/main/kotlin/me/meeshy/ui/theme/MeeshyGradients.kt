package me.meeshy.ui.theme

import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color

/**
 * Theme-aware signature gradients as Compose [Brush]es — the port of iOS
 * `MeeshyColors` gradients (parity plan §3.4). All run top-leading → bottom-trailing
 * (Offset.Zero → Offset.Infinite) to match SwiftUI's `.topLeading`/`.bottomTrailing`.
 */
object MeeshyGradients {
    private val topLeading = Offset.Zero
    private val bottomTrailing = Offset.Infinite

    /** Fond de tous les écrans racine. Dark: #09090B→#13111C→#1E1B4B. */
    fun mainBackground(dark: Boolean): Brush = Brush.linearGradient(
        colors = if (dark) {
            listOf(Color(0xFF09090B), Color(0xFF13111C), Color(0xFF1E1B4B))
        } else {
            listOf(Color(0xFFFFFFFF), Color(0xFFF8F7FF), Color(0xFFEEF2FF))
        },
        start = topLeading, end = bottomTrailing,
    )

    /** Bordure des surfaces glass. Dark: indigo400@30%→indigo700@10%. */
    fun glassBorder(dark: Boolean): Brush = Brush.linearGradient(
        colors = if (dark) {
            listOf(MeeshyPalette.Indigo400.copy(alpha = 0.30f), MeeshyPalette.Indigo700.copy(alpha = 0.10f))
        } else {
            listOf(MeeshyPalette.Indigo900.copy(alpha = 0.08f), MeeshyPalette.Indigo700.copy(alpha = 0.03f))
        },
        start = topLeading, end = bottomTrailing,
    )

    /** THE signature — CTAs, logo, FAB. */
    val brand: Brush = Brush.linearGradient(MeeshyPalette.BrandGradient, topLeading, bottomTrailing)
    val brandLight: Brush = Brush.linearGradient(MeeshyPalette.BrandGradientLight, topLeading, bottomTrailing)

    /** Anneau des story rings. */
    val avatarRing: Brush = Brush.linearGradient(MeeshyPalette.AvatarRingGradient, topLeading, bottomTrailing)
    val accent: Brush = Brush.linearGradient(MeeshyPalette.AccentGradient, topLeading, bottomTrailing)
}
