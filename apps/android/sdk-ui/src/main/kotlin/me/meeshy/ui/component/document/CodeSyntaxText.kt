package me.meeshy.ui.component.document

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import me.meeshy.sdk.model.media.SyntaxToken
import me.meeshy.sdk.model.media.SyntaxTokenType
import me.meeshy.sdk.model.media.SyntaxTheme

internal fun syntaxColor(value: Long): Color = Color(value)

/** Une ligne colorée (mots-clés et directives en gras, comme `SyntaxHighlighter.highlight`, iOS) ; une ligne vide garde sa hauteur. */
internal fun highlightedLine(tokens: List<SyntaxToken>, theme: SyntaxTheme): AnnotatedString {
    if (tokens.isEmpty() || tokens.all { it.text.isEmpty() }) return AnnotatedString(" ")
    return buildAnnotatedString {
        tokens.forEach { token ->
            val bold = token.type == SyntaxTokenType.KEYWORD || token.type == SyntaxTokenType.PREPROCESSOR
            withStyle(SpanStyle(color = syntaxColor(theme.colorOf(token.type)), fontWeight = if (bold) FontWeight.SemiBold else null)) {
                append(token.text)
            }
        }
    }
}

/** Le nombre de lignes d'un source, comme `components(separatedBy: "\n")` (iOS) : un saut final ajoute une ligne vide. */
internal fun codeLineCount(text: String): Int = text.count { it == '\n' } + 1

/** Les [limit] premières lignes du source, à colorer pour l'aperçu. */
internal fun codeHead(text: String, limit: Int): String {
    var end = -1
    repeat(limit) {
        end = text.indexOf('\n', end + 1)
        if (end < 0) return text
    }
    return text.substring(0, end)
}
