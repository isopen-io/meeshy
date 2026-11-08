package me.meeshy.ui.component.focal

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import me.meeshy.sdk.model.reading.focal.FocalQuotedReplyPresentation
import me.meeshy.sdk.model.reading.focal.FocalQuotedReplyPresentation.Author
import me.meeshy.sdk.theme.DynamicColorGenerator
import me.meeshy.ui.R
import me.meeshy.ui.component.bubble.RichMessageText
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.hexColor

/**
 * Ce que la citation de la rangée plate dessine : un instantané immuable, projeté depuis le message
 * par l'hôte (le texte est DÉJÀ élu par le Prisme du lecteur, rang par rang, avec l'original servi
 * quand aucune traduction ne correspond — cette vue ne résout rien).
 */
public data class FocalQuotedReply(
    val authorName: String?,
    val isMe: Boolean,
    val isMood: Boolean,
    val previewText: String,
    /** Libellé court du média cité (« Photo », « Pièce jointe »), repli de l'aperçu vide. */
    val mediaLabel: String?,
    val thumbnailUrl: String?,
)

/**
 * **La citation NUE de la rangée plate** (iOS `FocalQuotedReplyView`), au retrait de la colonne du nom :
 * un filet arrondi de 2,5 (l'accent pour soi, la couleur de l'auteur sinon), le nom (« Vous »,
 * « Humeur » ou l'auteur) sur UNE ligne, le texte cité sur DEUX avec ses mentions, et la miniature
 * du média cité dessous. Le filet prend la hauteur du contenu (mesure intrinsèque), il ne s'étire pas.
 *
 * Gestes — la loi des zones d'iOS : la MINIATURE ouvre le média ([onMediaTap]), le NOM ouvre le
 * profil de l'auteur ([onAuthorTap], armé seulement s'il y a un profil à ouvrir), TOUT LE RESTE saute
 * au message d'origine ([onJump]). TalkBack reçoit les mêmes capacités en actions nommées par la
 * rangée ; ici la citation n'est qu'un nœud fusionné.
 */
@Composable
public fun FocalQuotedReplyView(
    reply: FocalQuotedReply,
    accentColor: Color,
    modifier: Modifier = Modifier,
    mentionDisplayNames: Map<String, String>? = null,
    onJump: (() -> Unit)? = null,
    onAuthorTap: (() -> Unit)? = null,
    onMediaTap: (() -> Unit)? = null,
) {
    val tokens = MeeshyTheme.tokens
    val author = FocalQuotedReplyPresentation.author(reply.isMe, reply.authorName, reply.isMood)
    val authorLabel = when (author) {
        Author.You -> stringResource(R.string.bubble_reply_you)
        Author.Mood -> stringResource(R.string.bubble_reply_mood)
        is Author.Named -> author.name
        Author.Anonymous -> ""
    }
    val railColor = remember(reply.isMe, reply.authorName, accentColor) {
        val name = reply.authorName?.takeIf { it.isNotBlank() }
        if (FocalQuotedReplyPresentation.railIsAccent(reply.isMe) || name == null) {
            accentColor
        } else {
            hexColor(DynamicColorGenerator.colorForName(name), accentColor)
        }
    }
    val fallback = reply.mediaLabel ?: stringResource(R.string.bubble_reply_media)
    val preview = FocalQuotedReplyPresentation.previewOrFallback(reply.previewText, fallback)
    val title = FocalQuotedReplyPresentation.title(authorLabel)
    val authorHint = stringResource(R.string.bubble_reply_author_hint)
    val mediaAction = stringResource(R.string.bubble_reply_open_media)
    Row(
        horizontalArrangement = Arrangement.spacedBy(FocalQuoteRailMetrics.spacing),
        modifier = modifier
            .height(IntrinsicSize.Min)
            .clickable(enabled = onJump != null, onClick = { onJump?.invoke() }),
    ) {
        FocalQuoteRail(color = railColor)
        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
            if (title.isNotEmpty()) {
                Text(
                    text = title,
                    style = TextStyle(fontSize = 12.sp, fontWeight = FontWeight.SemiBold),
                    color = tokens.textPrimary.copy(alpha = 0.85f),
                    maxLines = FocalQuotedReplyPresentation.TITLE_LINE_LIMIT,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier
                        .defaultMinSize(minHeight = 1.dp)
                        .then(if (onAuthorTap == null) Modifier else Modifier.clickable(onClickLabel = authorHint, onClick = onAuthorTap)),
                )
            }
            RichMessageText(
                text = preview,
                color = tokens.textSecondary,
                style = TextStyle(fontSize = 12.sp),
                linkColor = tokens.textSecondary,
                mentionDisplayNames = mentionDisplayNames,
                maxLines = FocalQuotedReplyPresentation.PREVIEW_LINE_LIMIT,
            )
            if (reply.thumbnailUrl != null) {
                AsyncImage(
                    model = reply.thumbnailUrl,
                    contentDescription = null,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier
                        .size(36.dp)
                        .clip(RoundedCornerShape(6.dp))
                        .clickable(enabled = onMediaTap != null, onClickLabel = mediaAction, onClick = { onMediaTap?.invoke() })
                        .clearAndSetSemantics {
                            contentDescription = mediaAction
                            role = Role.Button
                        },
                )
            }
        }
    }
}
