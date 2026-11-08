package me.meeshy.app.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import me.meeshy.feature.chat.R
import me.meeshy.sdk.model.composer.ComposerTextFormat.Style
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * Les quatre emphases à portée de doigt (iOS `ComposerFormatBar`) : gras, italique, souligné, barré,
 * dessinés dans leur style, 44 x 36 dp, fond accent léger. Elle paraît dès qu'une sélection non
 * vide existe ([ComposerFormatSelection]). L'accent arrive en paramètre.
 */
@Composable
internal fun ComposerFormatBar(
    accentColor: Color,
    onFormat: (Style) -> Unit,
    modifier: Modifier = Modifier,
) {
    val barLabel = stringResource(R.string.composer_text_format_bar)
    Row(
        modifier = modifier.semantics { contentDescription = barLabel },
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
    ) {
        Style.entries.forEach { style ->
            val label = stringResource(style.labelRes())
            Box(
                modifier = Modifier
                    .size(width = 44.dp, height = 36.dp)
                    .clip(RoundedCornerShape(MeeshyRadius.sm))
                    .background(accentColor.copy(alpha = 0.15f))
                    .clickable(role = Role.Button) { onFormat(style) }
                    .semantics { contentDescription = label },
                contentAlignment = Alignment.Center,
            ) {
                Text(text = style.letter(), style = style.letterStyle(), color = MeeshyTheme.tokens.textPrimary)
            }
        }
    }
}

private fun Style.letter(): String = when (this) {
    Style.BOLD -> "B"
    Style.ITALIC -> "I"
    Style.UNDERLINE -> "U"
    Style.STRIKETHROUGH -> "S"
}

private fun Style.labelRes(): Int = when (this) {
    Style.BOLD -> R.string.composer_text_format_bold
    Style.ITALIC -> R.string.composer_text_format_italic
    Style.UNDERLINE -> R.string.composer_text_format_underline
    Style.STRIKETHROUGH -> R.string.composer_text_format_strikethrough
}

private fun Style.letterStyle(): TextStyle = when (this) {
    Style.BOLD -> TextStyle(fontSize = 16.sp, fontWeight = FontWeight.ExtraBold)
    Style.ITALIC -> TextStyle(fontSize = 16.sp, fontStyle = FontStyle.Italic, fontFamily = FontFamily.Serif)
    Style.UNDERLINE -> TextStyle(fontSize = 16.sp, textDecoration = TextDecoration.Underline)
    Style.STRIKETHROUGH -> TextStyle(fontSize = 16.sp, textDecoration = TextDecoration.LineThrough)
}
