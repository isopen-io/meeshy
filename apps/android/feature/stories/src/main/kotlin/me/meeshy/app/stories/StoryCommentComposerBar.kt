package me.meeshy.app.stories

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.clickable
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.story.StoryCommentComposerState
import me.meeshy.sdk.model.story.StoryComposerFold
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.role
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.sdk.model.story.StoryCommentPiece
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyMediaChromeColors
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.hexColor

internal const val STORY_COMMENT_BAR_TAG = "story.comment.bar"
internal const val STORY_COMMENT_REPLY_BANNER_TAG = "story.comment.replyBanner"
internal const val STORY_COMMENT_REPLY_CANCEL_TAG = "story.comment.replyCancel"
internal const val STORY_COMMENT_FIELD_TAG = "story.comment.field"
internal const val STORY_COMMENT_SEND_TAG = "story.comment.send"
internal const val STORY_COMMENT_ATTACH_TAG = "story.comment.attach"
internal const val STORY_COMMENT_PIECE_TAG = "story.comment.piece"
internal const val STORY_COMMENT_PIECE_REMOVE_TAG = "story.comment.pieceRemove"

/**
 * **L'unique barre de saisie du lecteur de story** (iOS `StoryComposerBarView`) : un champ, un bouton d'envoi, et — quand
 * on répond à un commentaire — la bannière « Réponse à X » au-dessus du champ, avec son annulation. L'accent et son second
 * arrêt viennent de [state] (commentaire visé, sinon story), jamais d'une couleur écrite ici. Sans état propre : le texte
 * et les gestes remontent à l'hôte, qui tient le brouillon par story ([StoryCommentDraftStore]).
 */
@Composable
internal fun StoryCommentComposerBar(
    state: StoryCommentComposerState,
    text: String,
    onTextChange: (String) -> Unit,
    onSend: () -> Unit,
    onCancelReply: () -> Unit,
    modifier: Modifier = Modifier,
    /** `null` : pas de plateau de pièces (la porte « joindre » est absente, jamais grisée). */
    onAttach: (() -> Unit)? = null,
    onRemovePiece: (String) -> Unit = {},
) {
    val accent = hexColor(state.accentHex)
    val secondary = hexColor(state.secondaryHex)
    val canSend = state.canSend(text)
    Column(modifier.fillMaxWidth().testTag(STORY_COMMENT_BAR_TAG)) {
        state.reply?.let { reply ->
            Row(
                Modifier
                    .fillMaxWidth()
                    .background(hexColor(reply.authorColorHex).copy(alpha = 0.18f))
                    .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.sm)
                    .testTag(STORY_COMMENT_REPLY_BANNER_TAG),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
            ) {
                Box(Modifier.size(width = 3.dp, height = 30.dp).clip(RoundedCornerShape(2.dp)).background(hexColor(reply.authorColorHex)))
                Column(Modifier.weight(1f)) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
                        Icon(MeeshyIcons.Reply, contentDescription = null, tint = hexColor(reply.authorColorHex), modifier = Modifier.size(12.dp))
                        Text(
                            text = stringResource(R.string.stories_reply_to, reply.authorName),
                            style = MaterialTheme.typography.labelMedium,
                            color = hexColor(reply.authorColorHex),
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                    Text(
                        text = reply.snippet,
                        style = MaterialTheme.typography.labelSmall,
                        color = MeeshyMediaChromeColors.OnMediaMuted,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                val cancelLabel = stringResource(R.string.stories_reply_cancel)
                Box(
                    Modifier
                        .size(48.dp)
                        .clip(CircleShape)
                        .clickable(onClick = onCancelReply)
                        .semantics { contentDescription = cancelLabel }
                        .testTag(STORY_COMMENT_REPLY_CANCEL_TAG),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(MeeshyIcons.Close, contentDescription = null, tint = MeeshyMediaChromeColors.OnMediaMuted, modifier = Modifier.size(14.dp))
                }
            }
        }
        state.attachments.pieces.forEach { piece ->
            StoryCommentPieceChip(piece, onRemove = { onRemovePiece(piece.id) })
        }
        Row(
            Modifier.fillMaxWidth().padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.sm),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
        ) {
            if (onAttach != null && !state.attachments.isFull) {
                val attachLabel = stringResource(R.string.stories_comment_attach)
                Box(
                    Modifier
                        .size(48.dp)
                        .clip(CircleShape)
                        .clickable(onClick = onAttach)
                        .semantics { contentDescription = attachLabel }
                        .testTag(STORY_COMMENT_ATTACH_TAG),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(MeeshyIcons.AttachFile, contentDescription = null, tint = MeeshyMediaChromeColors.OnMediaMuted, modifier = Modifier.size(22.dp))
                }
            }
            Box(
                Modifier
                    .weight(1f)
                    .heightIn(min = 48.dp)
                    .clip(RoundedCornerShape(MeeshyRadius.md))
                    .background(MeeshyMediaChromeColors.MediaFill)
                    .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.sm),
                contentAlignment = Alignment.CenterStart,
            ) {
                if (text.isEmpty()) {
                    Text(
                        text = stringResource(R.string.stories_comments_input_hint),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MeeshyMediaChromeColors.OnMediaMuted,
                    )
                }
                BasicTextField(
                    value = text,
                    onValueChange = onTextChange,
                    textStyle = TextStyle(color = MeeshyMediaChromeColors.OnMedia, fontSize = MaterialTheme.typography.bodyMedium.fontSize),
                    cursorBrush = SolidColor(accent),
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send),
                    keyboardActions = KeyboardActions(onSend = { if (canSend) onSend() }),
                    modifier = Modifier.fillMaxWidth().testTag(STORY_COMMENT_FIELD_TAG),
                )
            }
            val sendLabel = stringResource(R.string.stories_reply_send)
            Box(
                Modifier
                    .size(48.dp)
                    .clip(CircleShape)
                    .background(if (canSend) Brush.linearGradient(listOf(accent, secondary)) else SolidColor(MeeshyMediaChromeColors.MediaFill))
                    .clickable(enabled = canSend, onClick = onSend)
                    .semantics { contentDescription = sendLabel }
                    .testTag(STORY_COMMENT_SEND_TAG),
                contentAlignment = Alignment.Center,
            ) {
                Icon(MeeshyIcons.Send, contentDescription = null, tint = MeeshyMediaChromeColors.OnMedia, modifier = Modifier.size(20.dp))
            }
        }
    }
}

/** Une pièce du plateau : son nom, « envoi en cours » tant qu'elle n'a pas d'id serveur, et sa croix de retrait. */
@Composable
private fun StoryCommentPieceChip(piece: StoryCommentPiece, onRemove: () -> Unit) {
    val removeLabel = stringResource(R.string.stories_comment_attach_remove)
    Row(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = MeeshySpacing.md)
            .clip(RoundedCornerShape(MeeshyRadius.md))
            .background(MeeshyMediaChromeColors.MediaFill)
            .padding(start = MeeshySpacing.md)
            .testTag(STORY_COMMENT_PIECE_TAG),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(
                text = piece.fileName,
                style = MaterialTheme.typography.labelLarge,
                color = MeeshyMediaChromeColors.OnMedia,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            if (piece.uploadedId == null) {
                Text(
                    text = stringResource(R.string.stories_comment_attach_uploading),
                    style = MaterialTheme.typography.labelSmall,
                    color = MeeshyMediaChromeColors.OnMediaMuted,
                )
            }
        }
        Box(
            Modifier
                .size(48.dp)
                .clip(CircleShape)
                .clickable(onClick = onRemove)
                .semantics { contentDescription = removeLabel }
                .testTag(STORY_COMMENT_PIECE_REMOVE_TAG),
            contentAlignment = Alignment.Center,
        ) {
            Icon(MeeshyIcons.Close, contentDescription = null, tint = MeeshyMediaChromeColors.OnMediaMuted, modifier = Modifier.size(14.dp))
        }
    }
}

internal const val STORY_COMPOSER_FOLD_TAG = "story.composer.fold"
internal const val STORY_COMPOSER_UNFOLD_TAG = "story.composer.unfold"
internal const val STORY_COMPOSER_BADGE_TAG = "story.composer.unfold.badge"

/** Le chevron qui replie le composeur en bulle (iOS `composerFoldControl`) : visible par défaut, cible de 48 dp. */
@Composable
internal fun StoryComposerFoldChevron(onFold: () -> Unit, modifier: Modifier = Modifier) {
    val label = stringResource(R.string.story_composer_fold)
    val hint = stringResource(R.string.story_composer_fold_hint)
    Box(
        modifier
            .size(48.dp)
            .clip(CircleShape)
            .clickable(onClick = onFold)
            .semantics {
                role = Role.Button
                contentDescription = "$label. $hint"
            }
            .testTag(STORY_COMPOSER_FOLD_TAG),
        contentAlignment = Alignment.Center,
    ) {
        Icon(MeeshyIcons.ChevronDown, contentDescription = null, tint = MeeshyMediaChromeColors.OnMediaMuted, modifier = Modifier.size(20.dp))
    }
}

/**
 * La bulle de réouverture (iOS `composerUnfoldButton`) : centrée, à l'icône de commentaire, elle rouvre le composeur sans
 * rouvrir le clavier et signale ce que le repli garde — une prise en cours (pastille rouge) ou une réponse (flèche).
 */
@Composable
internal fun StoryComposerUnfoldBubble(
    badge: StoryComposerFold.BubbleBadge,
    onUnfold: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val label = stringResource(R.string.story_composer_unfold)
    val hint = stringResource(R.string.story_composer_unfold_hint)
    val value = when (badge) {
        StoryComposerFold.BubbleBadge.NONE -> ""
        StoryComposerFold.BubbleBadge.RECORDING -> stringResource(R.string.story_composer_unfold_recording)
        StoryComposerFold.BubbleBadge.REPLY -> stringResource(R.string.story_composer_unfold_replying)
    }
    Box(modifier.fillMaxWidth().padding(vertical = MeeshySpacing.sm), contentAlignment = Alignment.Center) {
        Box(
            Modifier
                .size(48.dp)
                .clip(CircleShape)
                .background(MeeshyMediaChromeColors.MediaFill)
                .clickable(onClick = onUnfold)
                .semantics {
                    role = Role.Button
                    contentDescription = "$label. $hint"
                    if (value.isNotEmpty()) stateDescription = value
                }
                .testTag(STORY_COMPOSER_UNFOLD_TAG),
            contentAlignment = Alignment.Center,
        ) {
            Icon(MeeshyIcons.ChatBubble, contentDescription = null, tint = MeeshyMediaChromeColors.OnMedia, modifier = Modifier.size(22.dp))
            when (badge) {
                StoryComposerFold.BubbleBadge.NONE -> Unit
                StoryComposerFold.BubbleBadge.RECORDING -> Box(
                    Modifier
                        .align(Alignment.TopEnd)
                        .padding(6.dp)
                        .size(10.dp)
                        .clip(CircleShape)
                        .background(MeeshyPalette.Error)
                        .testTag(STORY_COMPOSER_BADGE_TAG),
                )
                StoryComposerFold.BubbleBadge.REPLY -> Icon(
                    MeeshyIcons.Reply,
                    contentDescription = null,
                    tint = MeeshyMediaChromeColors.OnMedia,
                    modifier = Modifier.align(Alignment.TopEnd).padding(4.dp).size(12.dp).testTag(STORY_COMPOSER_BADGE_TAG),
                )
            }
        }
    }
}
