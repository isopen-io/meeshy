package me.meeshy.ui.component.viewer

import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.TextStyle
import me.meeshy.ui.component.bubble.RichTextLook
import me.meeshy.ui.component.bubble.buildRichAnnotatedString
import me.meeshy.ui.theme.MeeshyAdaptiveColors
import me.meeshy.ui.theme.MeeshyPalette

/** Ce que la légende peint, liens compris : lisible sans monter l'écran (miroir de `MediaCaptionRichText.attributed`). */
internal fun mediaCaptionAnnotated(
    text: String,
    trackedLinks: Map<String, String>?,
    validUsernames: Set<String>?,
    onHashtagClick: ((String) -> Unit)? = null,
    onMentionClick: ((String) -> Unit)? = null,
): AnnotatedString = buildRichAnnotatedString(
    text = text,
    look = captionLook(trackedLinks, validUsernames),
    isDark = true,
    onHashtagClick = onHashtagClick,
    onMentionClick = onMentionClick,
)

/** Une légende pose sur une scène sombre : les variantes SOMBRES des couleurs de mention et de hashtag, toujours. */
private fun captionLook(trackedLinks: Map<String, String>?, validUsernames: Set<String>?) = RichTextLook(
    color = MeeshyPalette.White,
    linkColor = MeeshyPalette.White,
    mentionColor = MeeshyAdaptiveColors.mentionColor(isDark = true),
    hashtagColor = MeeshyAdaptiveColors.hashtagColor(isDark = true),
    trackedLinks = trackedLinks?.takeIf { it.isNotEmpty() },
    validUsernames = validUsernames,
)

/**
 * Le rendu riche d'une légende de média : adresses, mentions et hashtags cliquables en blanc sur
 * la scène. Les adresses de [trackedLinks] s'ouvrent par le lien suivi tout en affichant l'adresse
 * écrite ; une `@mention` hors [validUsernames] reste du texte. Le texte reste sélectionnable.
 */
@Composable
public fun MediaCaptionRichText(
    text: String,
    style: TextStyle,
    modifier: Modifier = Modifier,
    trackedLinks: Map<String, String>? = null,
    validUsernames: Set<String>? = null,
    onHashtagClick: ((String) -> Unit)? = null,
    onMentionClick: ((String) -> Unit)? = null,
    color: Color = MeeshyPalette.White,
) {
    val hashtagTap by rememberUpdatedState(onHashtagClick)
    val mentionTap by rememberUpdatedState(onMentionClick)
    val hasHashtagTap = onHashtagClick != null
    val hasMentionTap = onMentionClick != null
    val annotated = remember(text, trackedLinks, validUsernames, hasHashtagTap, hasMentionTap) {
        mediaCaptionAnnotated(
            text = text,
            trackedLinks = trackedLinks,
            validUsernames = validUsernames,
            onHashtagClick = if (hasHashtagTap) { tag -> hashtagTap?.invoke(tag) } else null,
            onMentionClick = if (hasMentionTap) { name -> mentionTap?.invoke(name) } else null,
        )
    }
    SelectionContainer { Text(text = annotated, color = color, style = style, modifier = modifier) }
}
