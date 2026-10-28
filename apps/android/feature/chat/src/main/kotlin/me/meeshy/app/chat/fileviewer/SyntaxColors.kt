package me.meeshy.app.chat.fileviewer

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.graphics.Color
import me.meeshy.sdk.model.fileviewer.CodeToken
import me.meeshy.ui.theme.MeeshyTheme

/** La palette de coloration, le thème « GitHub » de `SyntaxTheme` (iOS), clair et sombre. */
internal data class SyntaxColors(
    val background: Color,
    val plain: Color,
    val keyword: Color,
    val string: Color,
    val comment: Color,
    val number: Color,
    val lineNumber: Color,
) {
    fun of(kind: CodeToken.Kind): Color = when (kind) {
        CodeToken.Kind.PLAIN -> plain
        CodeToken.Kind.KEYWORD -> keyword
        CodeToken.Kind.STRING -> string
        CodeToken.Kind.COMMENT -> comment
        CodeToken.Kind.NUMBER -> number
    }

    companion object {
        val Dark = SyntaxColors(
            background = Color(0xFF0D1117), plain = Color(0xFFE6EDF3), keyword = Color(0xFFFF7B72),
            string = Color(0xFFA5D6FF), comment = Color(0xFF8B949E), number = Color(0xFF79C0FF), lineNumber = Color(0xFF6E7681),
        )
        val Light = SyntaxColors(
            background = Color(0xFFFFFFFF), plain = Color(0xFF1F2328), keyword = Color(0xFFCF222E),
            string = Color(0xFF0A3069), comment = Color(0xFF6E7781), number = Color(0xFF0550AE), lineNumber = Color(0xFF8C959F),
        )
    }
}

@Composable
internal fun rememberSyntaxColors(): SyntaxColors {
    val dark = MeeshyTheme.isDark
    return remember(dark) { if (dark) SyntaxColors.Dark else SyntaxColors.Light }
}
