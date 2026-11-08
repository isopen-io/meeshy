package me.meeshy.ui.component.chrome

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import me.meeshy.sdk.model.PostViewerEngagement
import me.meeshy.sdk.model.PostViewerEngagement.Mark
import me.meeshy.ui.R
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * La rangée compacte des marques d'une personne sur un contenu (iOS `ViewerEngagementStrip`) : les emojis de
 * ses réactions, puis glyphe + nombre pour commentaires, réponses, republications et partages. Un compteur à
 * zéro ne se dessine pas ([PostViewerEngagement.marks]) ; rien du tout si aucune marque. Décorative pour
 * TalkBack : la rangée porteuse lit la phrase complète ([viewerMarkSentence]).
 */
@Composable
public fun ViewerEngagementStrip(engagement: PostViewerEngagement, modifier: Modifier = Modifier) {
    val marks = engagement.marks
    if (marks.isEmpty()) return
    val ink = MeeshyTheme.tokens.textSecondary
    val style = TextStyle(fontSize = 13.sp, fontWeight = FontWeight.Medium, color = ink)
    Row(
        modifier = modifier.clearAndSetSemantics { },
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        marks.forEach { mark ->
            when (mark) {
                is Mark.Reactions -> Text(text = mark.emojis.joinToString(" "), style = style.copy(color = androidx.compose.ui.graphics.Color.Unspecified), maxLines = 1)
                is Mark.Comments -> CountedMark(MeeshyIcons.Chat, mark.count, style, ink)
                is Mark.Replies -> CountedMark(MeeshyIcons.Reply, mark.count, style, ink)
                is Mark.Reposts -> CountedMark(MeeshyIcons.Repeat, mark.count, style, ink)
                is Mark.Shares -> CountedMark(MeeshyIcons.Share, mark.count, style, ink)
            }
        }
    }
}

@Composable
private fun CountedMark(icon: ImageVector, count: Int, style: TextStyle, ink: androidx.compose.ui.graphics.Color) {
    Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xxs), verticalAlignment = Alignment.CenterVertically) {
        Icon(icon, contentDescription = null, tint = ink, modifier = Modifier.size(12.dp))
        Text(text = count.toString(), style = style, maxLines = 1)
    }
}

/** La phrase d'une marque, en toutes lettres (iOS `ViewerEngagementWording.sentence`) : « 3 commentaires ». */
@Composable
public fun viewerMarkSentence(mark: Mark): String = when (mark) {
    is Mark.Reactions -> stringResource(R.string.viewer_engagement_reactions, mark.emojis.joinToString(" "))
    is Mark.Comments -> counted(mark.count, R.string.viewer_engagement_comments_one, R.string.viewer_engagement_comments_other)
    is Mark.Replies -> counted(mark.count, R.string.viewer_engagement_replies_one, R.string.viewer_engagement_replies_other)
    is Mark.Reposts -> counted(mark.count, R.string.viewer_engagement_reposts_one, R.string.viewer_engagement_reposts_other)
    is Mark.Shares -> counted(mark.count, R.string.viewer_engagement_shares_one, R.string.viewer_engagement_shares_other)
}

@Composable
private fun counted(count: Int, one: Int, other: Int): String = stringResource(if (count == 1) one else other, count)
