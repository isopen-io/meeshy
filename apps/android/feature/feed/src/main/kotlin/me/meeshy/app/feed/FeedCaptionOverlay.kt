package me.meeshy.app.feed

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.ExperimentalComposeUiApi
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.invisibleToUser
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import me.meeshy.feature.feed.R
import me.meeshy.sdk.model.FeedCaptionAbridger
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing

internal const val FEED_CAPTION_TEXT_TAG: String = "feed-caption-text"
internal const val FEED_CAPTION_TOGGLE_TAG: String = "feed-caption-toggle"

/**
 * **La légende, PAR-DESSUS l'image, dans le listing du fil** (iOS `FeedCaptionOverlay`, directive porteur 2026-09-05) : les vingt
 * premiers mots ([FeedCaptionAbridger]), suivis d'une ellipse seulement s'il reste quelque chose, et « plus… » / « moins » pour
 * déplier. Le texte lui-même ne prend aucun geste : le toucher posé dessus ouvre le média, comme partout sur la carte. Seul le
 * libellé du bouton est touchable. Le dégradé n'existe que SOUS une légende : sans elle, rien ne s'assombrit.
 *
 * Le texte est masqué à TalkBack : la description du média (texte alternatif, sinon la légende) est lue d'un bloc par la tuile.
 */
@OptIn(ExperimentalComposeUiApi::class)
@Composable
internal fun FeedCaptionOverlay(
    caption: String?,
    modifier: Modifier = Modifier,
    words: Int = FeedCaptionAbridger.WORD_COUNT,
) {
    val source = caption ?: return
    val abridged = remember(source, words) { FeedCaptionAbridger.abridged(source, words) } ?: return
    val truncated = remember(source, words) { FeedCaptionAbridger.isTruncated(source, words) }
    var expanded by rememberSaveable(source) { mutableStateOf(false) }
    val toggleLabel = stringResource(if (expanded) R.string.feed_caption_collapse else R.string.feed_caption_expand)
    Column(
        modifier = modifier
            .fillMaxWidth()
            .background(Brush.verticalGradient(listOf(Color.Transparent, Color.Black.copy(alpha = 0.72f)))),
    ) {
        Text(
            text = if (expanded) FeedCaptionAbridger.full(source) else abridged,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.Medium,
            color = MeeshyPalette.White,
            modifier = Modifier
                .padding(start = MeeshySpacing.md, end = MeeshySpacing.md, top = 28.dp, bottom = if (truncated) 0.dp else MeeshySpacing.md)
                .semantics { invisibleToUser() }
                .testTag(FEED_CAPTION_TEXT_TAG),
        )
        if (truncated) {
            Text(
                text = toggleLabel,
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.SemiBold,
                color = MeeshyPalette.White,
                modifier = Modifier
                    .heightIn(min = 48.dp)
                    .clickable(role = Role.Button, onClickLabel = toggleLabel) { expanded = !expanded }
                    .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.sm)
                    .align(Alignment.Start)
                    .testTag(FEED_CAPTION_TOGGLE_TAG),
            )
        }
    }
}
