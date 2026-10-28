package me.meeshy.app.chat.fileviewer

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.graphics.Color
import me.meeshy.sdk.model.fileviewer.CodeToken
import me.meeshy.ui.theme.MeeshySyntaxColors
import me.meeshy.ui.theme.MeeshyTheme

internal fun MeeshySyntaxColors.of(kind: CodeToken.Kind): Color = when (kind) {
    CodeToken.Kind.PLAIN -> plain
    CodeToken.Kind.KEYWORD -> keyword
    CodeToken.Kind.STRING -> string
    CodeToken.Kind.COMMENT -> comment
    CodeToken.Kind.NUMBER -> number
}

@Composable
internal fun rememberSyntaxColors(): MeeshySyntaxColors {
    val dark = MeeshyTheme.isDark
    return remember(dark) { MeeshySyntaxColors.of(dark) }
}
