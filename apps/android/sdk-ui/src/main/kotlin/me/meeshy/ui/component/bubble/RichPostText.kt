package me.meeshy.ui.component.bubble

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.sizeIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.clickable
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.PostTextTruncation
import me.meeshy.sdk.model.YouTubeLinkDetector
import me.meeshy.sdk.model.text.LinkDisplayLaw
import me.meeshy.ui.R
import me.meeshy.ui.theme.LocalMeeshyTokens
import me.meeshy.ui.theme.MeeshyAdaptiveColors

/**
 * Le texte d'un post (fil, détail) : blocs, mentions validées contre la liste du post, hashtags,
 * liens suivis, abrégé en MOTS ([PostTextTruncation], donc indépendant de la taille de police) avec
 * « voir plus / voir moins », le texte restant sélectionnable. Une URL YouTube du contenu est
 * détectée une fois par texte et rendue en façade. Les clics #tag et @mention remontent à l'hôte.
 *
 * @param pinnedDark `true` sur une surface sombre épinglée (un reel) : force les variantes sombres.
 */
@Composable
public fun RichPostText(
    text: String,
    color: Color,
    postId: String,
    modifier: Modifier = Modifier,
    style: TextStyle = LocalTextStyle.current,
    maxWords: Int = PostTextTruncation.DEFAULT_MAX_WORDS,
    trackedLinks: Map<String, String>? = null,
    validUsernames: Set<String>? = null,
    mentionDisplayNames: Map<String, String>? = null,
    pinnedDark: Boolean = false,
    onHashtagClick: ((String) -> Unit)? = null,
    onMentionClick: ((String) -> Unit)? = null,
    onSeeMore: (() -> Unit)? = null,
) {
    var expanded by rememberSaveable(postId) { mutableStateOf(false) }
    val cut = remember(text, maxWords) { PostTextTruncation.cut(text, maxWords) }
    val youtube = remember(text) { YouTubeLinkDetector.detect(text) }
    val tokens = LocalMeeshyTokens.current
    val mention = if (pinnedDark) MeeshyAdaptiveColors.mentionColor(isDark = true) else tokens.mention
    val hashtag = if (pinnedDark) MeeshyAdaptiveColors.hashtagColor(isDark = true) else tokens.hashtag
    val shown = if (cut.isTruncated && !expanded) cut.text + "…" else text
    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        SelectionContainer {
            RichMessageText(
                text = shown,
                color = color,
                style = style,
                mentionColor = mention,
                hashtagColor = hashtag,
                mentionDisplayNames = mentionDisplayNames,
                validUsernames = validUsernames,
                trackedLinks = trackedLinks,
                onHashtagClick = onHashtagClick,
                onMentionClick = onMentionClick,
            )
        }
        if (cut.isTruncated) {
            Text(
                text = stringResource(if (expanded) R.string.media_caption_see_less else R.string.media_caption_see_more),
                color = mention,
                fontWeight = FontWeight.SemiBold,
                style = style,
                modifier = Modifier
                    .sizeIn(minHeight = 48.dp)
                    .clickable {
                        if (!expanded) onSeeMore?.invoke()
                        expanded = !expanded
                    }
                    .padding(vertical = 12.dp),
            )
        }
        youtube?.let { link ->
            val trackedUrl = trackedLinks?.entries
                ?.firstOrNull { YouTubeLinkDetector.detect(it.key)?.videoId == link.videoId && LinkDisplayLaw.isTrackingToken(it.value) }
                ?.let { LinkDisplayLaw.redirectUrl(it.value) }
            YouTubeFacade(link = link, trackedUrl = trackedUrl)
        }
    }
}
