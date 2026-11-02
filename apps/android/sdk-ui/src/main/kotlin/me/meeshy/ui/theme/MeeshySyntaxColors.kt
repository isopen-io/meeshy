package me.meeshy.ui.theme

import androidx.compose.runtime.Immutable
import androidx.compose.ui.graphics.Color

/**
 * La palette de coloration du code (le thème « GitHub » de `SyntaxTheme`, iOS), clair et sombre. Un jeton du thème :
 * les visionneuses de code n'écrivent aucun littéral de couleur.
 */
@Immutable
public data class MeeshySyntaxColors(
    val background: Color,
    val plain: Color,
    val keyword: Color,
    val string: Color,
    val comment: Color,
    val number: Color,
    val lineNumber: Color,
) {
    public companion object {
        public val Dark: MeeshySyntaxColors = MeeshySyntaxColors(
            background = Color(0xFF0D1117), plain = Color(0xFFE6EDF3), keyword = Color(0xFFFF7B72),
            string = Color(0xFFA5D6FF), comment = Color(0xFF8B949E), number = Color(0xFF79C0FF), lineNumber = Color(0xFF6E7681),
        )
        public val Light: MeeshySyntaxColors = MeeshySyntaxColors(
            background = Color(0xFFFFFFFF), plain = Color(0xFF1F2328), keyword = Color(0xFFCF222E),
            string = Color(0xFF0A3069), comment = Color(0xFF6E7781), number = Color(0xFF0550AE), lineNumber = Color(0xFF8C959F),
        )

        public fun of(isDark: Boolean): MeeshySyntaxColors = if (isDark) Dark else Light
    }
}
