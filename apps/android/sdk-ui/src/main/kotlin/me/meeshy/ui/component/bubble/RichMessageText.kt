package me.meeshy.ui.component.bubble

import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.LinkAnnotation
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextLinkStyles
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.withLink
import me.meeshy.sdk.model.MessageSegment
import me.meeshy.sdk.model.MessageTextParser
import me.meeshy.sdk.model.TextStyles

/**
 * Renders a message body as rich text — markdown emphasis, `@mention` /
 * `m+token` / `http(s)` links, and optional search-term highlighting — over the
 * pure [MessageTextParser] SSOT. All treatment *decisions* live in the parser
 * (fully unit-tested); this composable only maps the resulting segments onto an
 * [AnnotatedString] and hands taps to the platform URI handler.
 *
 * @param linkColor colour for mention / token / URL runs (defaults to [color]).
 * @param highlightColor background wash for [highlightTerm] matches.
 * @param mentionDisplayNames `username → display name` for `@Display Name` links.
 * @param highlightTerm case-insensitive term to wash (e.g. the active search).
 * @param trackedLinks `rawURL → token`; a matched raw URL taps through the
 *   gateway redirect while still *displaying* the raw URL.
 */
@Composable
public fun RichMessageText(
    text: String,
    color: Color,
    modifier: Modifier = Modifier,
    style: TextStyle = LocalTextStyle.current,
    linkColor: Color = color,
    highlightColor: Color = Color.Unspecified,
    mentionDisplayNames: Map<String, String>? = null,
    highlightTerm: String? = null,
    trackedLinks: Map<String, String>? = null,
) {
    val annotated = remember(
        text, color, linkColor, highlightColor, mentionDisplayNames, highlightTerm, trackedLinks,
    ) {
        buildMessageAnnotatedString(
            segments = MessageTextParser.parse(text, mentionDisplayNames),
            baseColor = color,
            linkColor = linkColor,
            highlightColor = highlightColor,
            highlightTerm = highlightTerm,
            trackedLinks = trackedLinks,
        )
    }
    Text(text = annotated, color = color, style = style, modifier = modifier)
}

/**
 * Maps parsed [segments] onto an [AnnotatedString]. Pure mapping glue: styles
 * come straight off each [MessageSegment], and highlighting is applied against
 * the *rendered* plain text (markers already stripped) so the wash never drifts
 * off the visible characters.
 */
internal fun buildMessageAnnotatedString(
    segments: List<MessageSegment>,
    baseColor: Color,
    linkColor: Color,
    highlightColor: Color,
    highlightTerm: String?,
    trackedLinks: Map<String, String>?,
): AnnotatedString {
    val styled = buildAnnotatedString {
        segments.forEach { segment ->
            when (segment) {
                is MessageSegment.Text -> {
                    val start = length
                    append(segment.text)
                    addStyle(spanStyleFor(segment.styles, baseColor), start, length)
                }
                is MessageSegment.MentionLink ->
                    appendLink(segment.display, segment.url, linkColor, FontWeight.SemiBold)
                is MessageSegment.MeeshyTokenLink ->
                    appendLink(segment.display, segment.url, linkColor, FontWeight.Medium)
                is MessageSegment.UrlLink ->
                    appendLink(
                        segment.display,
                        MessageTextParser.resolvedLinkUrl(segment.url, trackedLinks),
                        linkColor,
                        FontWeight.Medium,
                    )
            }
        }
    }

    if (highlightTerm.isNullOrEmpty() || highlightColor == Color.Unspecified) return styled
    val ranges = MessageTextParser.highlightRanges(styled.text, highlightTerm)
    if (ranges.isEmpty()) return styled
    return buildAnnotatedString {
        append(styled)
        ranges.forEach { range ->
            addStyle(SpanStyle(background = highlightColor), range.first, range.last + 1)
        }
    }
}

private fun spanStyleFor(styles: TextStyles, baseColor: Color): SpanStyle = SpanStyle(
    color = baseColor,
    fontWeight = if (styles.bold) FontWeight.Bold else null,
    fontStyle = if (styles.italic) FontStyle.Italic else null,
    textDecoration = when {
        styles.strikethrough && styles.underline ->
            TextDecoration.combine(listOf(TextDecoration.LineThrough, TextDecoration.Underline))
        styles.strikethrough -> TextDecoration.LineThrough
        styles.underline -> TextDecoration.Underline
        else -> null
    },
)

private fun AnnotatedString.Builder.appendLink(
    display: String,
    url: String,
    linkColor: Color,
    weight: FontWeight,
) {
    withLink(
        LinkAnnotation.Url(
            url = url,
            styles = TextLinkStyles(
                style = SpanStyle(
                    color = linkColor,
                    fontWeight = weight,
                    textDecoration = TextDecoration.Underline,
                ),
            ),
        ),
    ) {
        append(display)
    }
}
