package me.meeshy.ui.component.bubble

import androidx.compose.foundation.background
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.isSpecified
import androidx.compose.ui.unit.sp
import me.meeshy.sdk.model.MessageTextParser
import me.meeshy.sdk.model.text.RainbowLetters
import me.meeshy.sdk.model.text.TextBlock
import me.meeshy.sdk.model.text.TextBlocks
import me.meeshy.ui.theme.hexColor

/** Tout ce qui décide de l'APPARENCE d'un texte riche ; sans lambda, donc stable comme clé de `remember`. */
internal data class RichTextLook(
    val color: Color,
    val linkColor: Color = color,
    val mentionColor: Color = linkColor,
    val hashtagColor: Color = linkColor,
    val highlightColor: Color = Color.Unspecified,
    val highlightTerm: String? = null,
    val mentionDisplayNames: Map<String, String>? = null,
    val validUsernames: Set<String>? = null,
    val trackedLinks: Map<String, String>? = null,
    val rainbowSeed: String? = null,
)

/** L'apparence et les rappels de clic (la navigation reste aux mains de l'hôte). */
internal class RichTextSpec(
    val look: RichTextLook,
    val onHashtagClick: ((String) -> Unit)? = null,
    val onMentionClick: ((String) -> Unit)? = null,
)

@Composable
internal fun rememberRichAnnotated(text: String, spec: RichTextSpec): AnnotatedString {
    val isDark = isSystemInDarkTheme()
    val hashtagTap by rememberUpdatedState(spec.onHashtagClick)
    val mentionTap by rememberUpdatedState(spec.onMentionClick)
    val hasHashtagTap = spec.onHashtagClick != null
    val hasMentionTap = spec.onMentionClick != null
    return remember(text, spec.look, isDark, hasHashtagTap, hasMentionTap) {
        buildRichAnnotatedString(
            text = text,
            look = spec.look,
            isDark = isDark,
            onHashtagClick = if (hasHashtagTap) { tag -> hashtagTap?.invoke(tag) } else null,
            onMentionClick = if (hasMentionTap) { name -> mentionTap?.invoke(name) } else null,
        )
    }
}

internal fun buildRichAnnotatedString(
    text: String,
    look: RichTextLook,
    isDark: Boolean,
    onHashtagClick: ((String) -> Unit)? = null,
    onMentionClick: ((String) -> Unit)? = null,
): AnnotatedString = buildMessageAnnotatedString(
    segments = MessageTextParser.parse(text, look.mentionDisplayNames, look.validUsernames),
    baseColor = look.color,
    linkColor = look.linkColor,
    highlightColor = look.highlightColor,
    highlightTerm = look.highlightTerm,
    trackedLinks = look.trackedLinks,
    mentionColor = look.mentionColor,
    hashtagColor = look.hashtagColor,
    rainbowSeed = look.rainbowSeed,
    rainbowPalette = RainbowLetters.paletteHex(isDark).map { hexColor(it) },
    onHashtagClick = onHashtagClick,
    onMentionClick = onMentionClick,
)

/** Le titre se grossit par niveau : 1 → ×1,35, 2 → ×1,2, 3 → ×1,1, toujours plus gras que le corps. */
internal fun headingScale(level: Int): Float = when (level) {
    1 -> 1.35f
    2 -> 1.2f
    else -> 1.1f
}

/** Les blocs d'un message : titres, listes à retrait, citation à barre, code à chasse fixe. */
@Composable
internal fun RichTextBlocks(
    text: String,
    spec: RichTextSpec,
    style: TextStyle,
    modifier: Modifier = Modifier,
) {
    val blocks = remember(text) { TextBlocks.parse(text) }
    val look = spec.look
    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(4.dp)) {
        blocks.forEach { block ->
            when (block) {
                is TextBlock.Paragraph ->
                    Text(rememberRichAnnotated(block.text, spec), color = look.color, style = style)
                is TextBlock.Heading ->
                    Text(
                        text = rememberRichAnnotated(block.text, spec),
                        color = look.color,
                        style = style.copy(
                            fontWeight = FontWeight.ExtraBold,
                            fontSize = if (style.fontSize.isSpecified) style.fontSize * headingScale(block.level) else (16 * headingScale(block.level)).sp,
                        ),
                    )
                is TextBlock.ListBlock -> Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    block.items.forEachIndexed { index, item ->
                        Row(modifier = Modifier.padding(start = 8.dp)) {
                            Text(
                                text = if (block.ordered) "${block.start + index}." else "•",
                                color = look.color,
                                style = style,
                                modifier = Modifier.width(if (block.ordered) 24.dp else 16.dp),
                            )
                            Text(rememberRichAnnotated(item, spec), color = look.color, style = style)
                        }
                    }
                }
                is TextBlock.Quote ->
                    Row(modifier = Modifier.height(IntrinsicSize.Min)) {
                        Box(
                            Modifier
                                .width(3.dp)
                                .fillMaxHeight()
                                .background(look.linkColor.copy(alpha = 0.7f), RoundedCornerShape(2.dp)),
                        )
                        Text(
                            text = rememberRichAnnotated(block.text, spec),
                            color = look.color.copy(alpha = 0.85f),
                            style = style.copy(fontStyle = FontStyle.Italic),
                            modifier = Modifier.padding(start = 8.dp),
                        )
                    }
                is TextBlock.Code ->
                    Text(
                        text = block.text,
                        color = look.color,
                        style = style.copy(fontFamily = FontFamily.Monospace),
                        modifier = Modifier
                            .background(look.color.copy(alpha = 0.10f), RoundedCornerShape(6.dp))
                            .padding(horizontal = 8.dp, vertical = 6.dp),
                    )
            }
        }
    }
}
