package me.meeshy.ui.theme

import androidx.compose.runtime.Immutable
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import me.meeshy.sdk.theme.DynamicColorGenerator

/** Une orbe d'ambiance : couleur déjà munie de son opacité, taille et décalage (dp) depuis le centre. */
@Immutable
public data class AmbientOrbSpec(val color: Color, val sizeDp: Int, val offsetXDp: Int, val offsetYDp: Int)

/**
 * Palette de surfaces teintées, fonction pure du mode (miroir d'iOS `ThemePalette`). Les feuilles
 * reçoivent `isDark` en primitif : aucune observation de singleton dans une cellule de liste.
 */
@Immutable
public class ThemePalette(public val isDark: Boolean) {

    private val mode get() = if (isDark) DynamicColorGenerator.ThemeMode.DARK else DynamicColorGenerator.ThemeMode.LIGHT

    public val backgroundPrimary: Color get() = MeeshyAdaptiveColors.backgroundPrimary(isDark)
    public val backgroundSecondary: Color get() = MeeshyAdaptiveColors.backgroundSecondary(isDark)
    public val backgroundTertiary: Color get() = MeeshyAdaptiveColors.backgroundTertiary(isDark)
    public val textPrimary: Color get() = MeeshyAdaptiveColors.textPrimary(isDark)
    public val textSecondary: Color get() = MeeshyAdaptiveColors.textSecondary(isDark)
    public val textMuted: Color get() = MeeshyAdaptiveColors.textMuted(isDark)
    public val inputBackground: Color get() = MeeshyAdaptiveColors.inputBackground(isDark)
    public val inputBorder: Color get() = MeeshyAdaptiveColors.inputBorder(isDark)

    /** Teinte à [intensity] en sombre, à la moitié en clair. */
    public fun surface(tint: String, intensity: Float = 0.15f): Color =
        hexColor(tint).let { it.copy(alpha = it.alpha * if (isDark) intensity else intensity * 0.5f) }

    public fun surfaceGradient(tint: String): Brush = MeeshyGradients.surfaceGradient(hexColor(tint), isDark)

    public fun border(tint: String, intensity: Float = 0.4f): Brush =
        MeeshyGradients.tintedBorder(hexColor(tint), isDark, intensity)

    /** Teinte lisible comme texte : luminosité ≥ 0,70 en sombre, ≤ 0,60 en clair. */
    public fun accentText(hex: String): Color = hexColor(DynamicColorGenerator.adaptedColor(hex, mode))

    public fun buttonGradient(color: String): Brush {
        val base = hexColor(color)
        return Brush.linearGradient(
            colors = listOf(base, base.copy(alpha = 0.75f)),
            start = androidx.compose.ui.geometry.Offset.Zero,
            end = androidx.compose.ui.geometry.Offset.Infinite,
        )
    }

    public fun buttonShadow(color: String): Color = hexColor(color).copy(alpha = if (isDark) 0.5f else 0.3f)

    public val backgroundGradient: Brush get() = MeeshyGradients.backgroundGradient(isDark)

    public val ambientOrbs: List<AmbientOrbSpec> get() = ambientOrbsFor(isDark)

    public companion object {
        private val orbBase = listOf(
            Triple("6366F1", 300, -100 to -200),
            Triple("4338CA", 350, 150 to 300),
            Triple("818CF8", 250, 100 to -100),
            Triple("A5B4FC", 200, -150 to 200),
        )
        private val darkOpacity = listOf(0.10f, 0.10f, 0.08f, 0.06f)
        private val lightOpacity = listOf(0.05f, 0.05f, 0.04f, 0.03f)

        public fun ambientOrbsFor(isDark: Boolean): List<AmbientOrbSpec> {
            val opacity = if (isDark) darkOpacity else lightOpacity
            return orbBase.mapIndexed { i, (hex, size, offset) ->
                AmbientOrbSpec(hexColor(hex).copy(alpha = opacity[i]), size, offset.first, offset.second)
            }
        }
    }
}
