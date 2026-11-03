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
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.withLink
import me.meeshy.sdk.model.MessageSegment
import me.meeshy.sdk.model.MessageTextParser
import me.meeshy.sdk.model.TextStyles
import me.meeshy.sdk.model.text.LinkDisplayLaw
import me.meeshy.sdk.model.text.RainbowLetters
import me.meeshy.sdk.model.text.TextBlocks

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
    mentionColor: Color = linkColor,
    hashtagColor: Color = linkColor,
    validUsernames: Set<String>? = null,
    rainbowSeed: String? = null,
    onHashtagClick: ((String) -> Unit)? = null,
    onMentionClick: ((String) -> Unit)? = null,
    /** Budget de lignes du texte simple (la citation plate en offre deux) ; les blocs structurés ne le portent pas. */
    maxLines: Int = Int.MAX_VALUE,
) {
    val rich = RichTextSpec(
        look = RichTextLook(
            color = color,
            linkColor = linkColor,
            mentionColor = mentionColor,
            hashtagColor = hashtagColor,
            highlightColor = highlightColor,
            highlightTerm = highlightTerm,
            mentionDisplayNames = mentionDisplayNames,
            validUsernames = validUsernames,
            trackedLinks = trackedLinks,
            rainbowSeed = rainbowSeed,
        ),
        onHashtagClick = onHashtagClick,
        onMentionClick = onMentionClick,
    )
    if (TextBlocks.hasBlockSyntax(text)) {
        RichTextBlocks(text = text, spec = rich, style = style, modifier = modifier)
    } else {
        val annotated = rememberRichAnnotated(text, rich)
        Text(
            text = annotated,
            color = color,
            style = style,
            modifier = modifier,
            maxLines = maxLines,
            overflow = if (maxLines == Int.MAX_VALUE) TextOverflow.Clip else TextOverflow.Ellipsis,
        )
    }
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
    mentionColor: Color = linkColor,
    hashtagColor: Color = linkColor,
    rainbowSeed: String? = null,
    rainbowPalette: List<Color> = emptyList(),
    onHashtagClick: ((String) -> Unit)? = null,
    onMentionClick: ((String) -> Unit)? = null,
): AnnotatedString {
    val segmentStarts = IntArray(segments.size)
    val styled = buildAnnotatedString {
        segments.forEachIndexed { position, segment ->
            segmentStarts[position] = length
            when (segment) {
                is MessageSegment.Text -> {
                    val start = length
                    append(segment.text)
                    addStyle(spanStyleFor(segment.styles, baseColor), start, length)
                }
                is MessageSegment.MentionLink ->
                    if (onMentionClick != null) {
                        appendAction(segment.display, mentionColor, FontWeight.SemiBold) { onMentionClick(segment.username) }
                    } else {
                        appendLink(segment.display, segment.url, mentionColor, FontWeight.SemiBold)
                    }
                is MessageSegment.MeeshyTokenLink ->
                    appendLink(segment.display, segment.url, linkColor, FontWeight.Medium)
                is MessageSegment.Code -> {
                    val start = length
                    append(segment.text)
                    addStyle(spanStyleFor(segment.styles, baseColor).copy(fontFamily = FontFamily.Monospace), start, length)
                }
                is MessageSegment.HashtagLink ->
                    if (onHashtagClick != null) {
                        appendAction(segment.display, hashtagColor, FontWeight.SemiBold) { onHashtagClick(segment.tag) }
                    } else {
                        appendLink(segment.display, segment.url, hashtagColor, FontWeight.SemiBold)
                    }
                is MessageSegment.Link -> {
                    val shown = LinkDisplayLaw.resolve(segment.written, trackedLinks)
                    appendLink(shown.text, shown.url, linkColor, FontWeight.Medium)
                    if (shown.remainder.isNotEmpty()) {
                        val start = length
                        append(shown.remainder)
                        addStyle(SpanStyle(color = baseColor), start, length)
                    }
                }
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

    val painted = paintRainbow(styled, segments, segmentStarts, rainbowSeed, rainbowPalette)
    if (highlightTerm.isNullOrEmpty() || highlightColor == Color.Unspecified) return painted
    val ranges = MessageTextParser.highlightRanges(painted.text, highlightTerm)
    if (ranges.isEmpty()) return painted
    return buildAnnotatedString {
        append(painted)
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

private fun AnnotatedString.Builder.appendAction(
    display: String,
    color: Color,
    weight: FontWeight,
    onClick: () -> Unit,
) {
    withLink(
        LinkAnnotation.Clickable(
            tag = display,
            styles = TextLinkStyles(
                style = SpanStyle(color = color, fontWeight = weight, textDecoration = TextDecoration.Underline),
            ),
            linkInteractionListener = { onClick() },
        ),
    ) {
        append(display)
    }
}

/** Lettres arc-en-ciel : seules les lettres ordinaires prennent une couleur, jamais un lien. */
private fun paintRainbow(
    styled: AnnotatedString,
    segments: List<MessageSegment>,
    starts: IntArray,
    seed: String?,
    palette: List<Color>,
): AnnotatedString {
    if (seed == null || palette.isEmpty()) return styled
    val letters = RainbowLetters.letters(segments, seed, palette.size)
    if (letters.isEmpty()) return styled
    return buildAnnotatedString {
        append(styled)
        letters.forEach { letter ->
            val base = starts[letter.segment]
            addStyle(SpanStyle(color = palette[letter.colorIndex]), base + letter.start, base + letter.end)
        }
    }
}
