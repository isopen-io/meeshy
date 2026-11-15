package me.meeshy.app.stories

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.StoryComment
import me.meeshy.sdk.model.StoryCommentMenuAction
import me.meeshy.sdk.model.canShowOriginal
import me.meeshy.sdk.model.displayedText
import me.meeshy.sdk.theme.DynamicColorGenerator
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.profile.opensProfile
import me.meeshy.sdk.model.profile.ProfileSheetUser
import me.meeshy.sdk.model.profile.ofAuthor
import me.meeshy.ui.theme.MeeshyMediaChromeColors
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.hexColor
import me.meeshy.ui.icons.MeeshyIcons

/** Ce que la rangée peut déclencher ; une seule instance par overlay, donc stable pour les rangées. */
@Immutable
internal class StoryCommentRowCallbacks(
    val onReply: (StoryComment) -> Unit,
    val onToggleLike: (String) -> Unit,
    val onToggleOriginal: (String) -> Unit,
    val onCommitEdit: (commentId: String, text: String) -> Unit,
    val onDelete: (String) -> Unit,
    val onRequestRemove: (StoryComment) -> Unit,
    val onRequestReport: (StoryComment) -> Unit,
)

private val LegibleShadow = Shadow(color = Color.Black.copy(alpha = 0.55f), blurRadius = 6f)
private const val SWIPE_TO_REPLY_DP = 56

/**
 * La ligne d'un commentaire de story (iOS `StoryCommentRowView`) : PLATE, sans boîte — un liseré de 3 dp à la couleur
 * de l'auteur, son avatar, puis l'en-tête, le corps (texte, média unique, lieu) et la rangée d'actions. Un glissé vers
 * la droite répond, comme le bouton.
 */
@Composable
internal fun StoryCommentRow(
    comment: StoryComment,
    showOriginal: Boolean,
    menu: List<StoryCommentMenuAction>,
    callbacks: StoryCommentRowCallbacks,
    modifier: Modifier = Modifier,
) {
    val authorColor = remember(comment.authorName) { hexColor(DynamicColorGenerator.colorForName(comment.authorName)) }
    var editing by remember(comment.id) { mutableStateOf(false) }
    val threshold = with(LocalDensity.current) { SWIPE_TO_REPLY_DP.dp.toPx() }
    Row(
        modifier = modifier
            .fillMaxWidth()
            .height(IntrinsicSize.Min)
            .pointerInput(comment.id) {
                var travelled = 0f
                detectHorizontalDragGestures(
                    onDragStart = { travelled = 0f },
                    onDragEnd = { if (travelled > threshold) callbacks.onReply(comment) },
                    onDragCancel = { travelled = 0f },
                    onHorizontalDrag = { _, delta -> travelled += delta },
                )
            }
            .padding(vertical = MeeshySpacing.sm),
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.smPlus),
    ) {
        Box(
            Modifier
                .padding(vertical = MeeshySpacing.xsPlus)
                .width(3.dp)
                .fillMaxHeight()
                .clip(CircleShape)
                .background(authorColor),
        )
        val author = remember(comment.authorId, comment.authorName, comment.avatarUrl) {
            comment.authorId?.let { ProfileSheetUser.ofAuthor(it, displayName = comment.authorName, avatarUrl = comment.avatarUrl) }
        }
        MeeshyAvatar(name = comment.authorName, size = 32.dp, containerColor = authorColor, imageUrl = comment.avatarUrl, modifier = Modifier.opensProfile(author))
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
            StoryCommentHeader(comment, showOriginal, authorColor, callbacks)
            if (editing && StoryCommentMenuAction.EDIT in menu) {
                StoryCommentEditor(
                    original = comment.originalContent,
                    onCancel = { editing = false },
                    onSave = { text ->
                        editing = false
                        callbacks.onCommitEdit(comment.id, text)
                    },
                )
            } else {
                Text(
                    text = comment.displayedText(showOriginal),
                    style = TextStyle(color = MeeshyMediaChromeColors.OnMedia, fontSize = 13.5.sp, shadow = LegibleShadow),
                    maxLines = 6,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            StoryCommentMedia(comment)
            comment.location?.let { place -> StoryCommentPlace(place.name ?: place.address.orEmpty()) }
            StoryCommentActions(comment, menu, authorColor, callbacks, onEdit = { editing = true })
        }
    }
}

@Composable
private fun StoryCommentHeader(comment: StoryComment, showOriginal: Boolean, authorColor: Color, callbacks: StoryCommentRowCallbacks) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xsPlus)) {
        Text(
            text = comment.authorName,
            style = TextStyle(color = legibleAuthorColor(authorColor), fontSize = 13.sp, fontWeight = FontWeight.SemiBold, shadow = LegibleShadow),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.widthIn(max = 160.dp).opensProfile(
                comment.authorId?.let { ProfileSheetUser.ofAuthor(it, displayName = comment.authorName, avatarUrl = comment.avatarUrl) },
                minTarget = false,
            ),
        )
        comment.createdAt?.let { iso ->
            Text(
                text = storyCommentRelativeTime(iso),
                style = TextStyle(color = MeeshyMediaChromeColors.OnMediaMuted, fontSize = 11.sp, shadow = LegibleShadow),
            )
        }
        if (comment.canShowOriginal) {
            val label = stringResource(if (showOriginal) R.string.stories_comments_overlay_show_translated else R.string.stories_comments_overlay_show_original)
            Box(
                Modifier
                    .heightIn(min = 48.dp)
                    .clickable(role = Role.Button, onClickLabel = label) { callbacks.onToggleOriginal(comment.id) },
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = MeeshyIcons.Translate,
                    contentDescription = label,
                    tint = if (showOriginal) MeeshyMediaChromeColors.OnMediaMuted else MeeshyMediaChromeColors.OnMedia,
                    modifier = Modifier.size(14.dp),
                )
            }
        }
    }
}

@Composable
private fun StoryCommentMedia(comment: StoryComment) {
    val media = comment.media.firstOrNull() ?: return
    val url = media.thumbnailUrl ?: media.fileUrl.takeIf { media.mimeType?.startsWith("image") == true } ?: return
    AsyncImage(
        model = url,
        contentDescription = media.alt ?: stringResource(R.string.stories_comments_overlay_media),
        contentScale = ContentScale.Crop,
        modifier = Modifier
            .padding(top = MeeshySpacing.xxs)
            .widthIn(max = 220.dp)
            .heightIn(max = 180.dp)
            .clip(RoundedCornerShape(12.dp)),
    )
}

@Composable
private fun StoryCommentPlace(name: String) {
    if (name.isBlank()) return
    Row(
        Modifier
            .padding(top = MeeshySpacing.xxs)
            .clip(CircleShape)
            .background(MeeshyMediaChromeColors.ChromeFill)
            .padding(horizontal = MeeshySpacing.sm, vertical = MeeshySpacing.xs),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
    ) {
        Icon(MeeshyIcons.LocationFilled, contentDescription = null, tint = MeeshyMediaChromeColors.OnMedia, modifier = Modifier.size(12.dp))
        Text(name, style = TextStyle(color = MeeshyMediaChromeColors.OnMedia, fontSize = 11.sp), maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

@Composable
private fun StoryCommentActions(
    comment: StoryComment,
    menu: List<StoryCommentMenuAction>,
    authorColor: Color,
    callbacks: StoryCommentRowCallbacks,
    onEdit: () -> Unit,
) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.lg)) {
        val likeLabel = stringResource(if (comment.likedByMe) R.string.stories_comments_overlay_unlike else R.string.stories_comments_overlay_like)
        Row(
            Modifier
                .heightIn(min = 48.dp)
                .semantics { stateDescription = comment.likeCount.toString() }
                .clickable(role = Role.Button, onClickLabel = likeLabel) { callbacks.onToggleLike(comment.id) },
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xxs),
        ) {
            Icon(
                imageVector = if (comment.likedByMe) MeeshyIcons.HeartFilled else MeeshyIcons.FavoriteBorder,
                contentDescription = likeLabel,
                tint = if (comment.likedByMe) MeeshyPalette.Error else MeeshyMediaChromeColors.OnMediaSecondary,
                modifier = Modifier.size(16.dp),
            )
            if (comment.likeCount > 0) {
                Text(
                    comment.likeCount.toString(),
                    style = TextStyle(
                        color = if (comment.likedByMe) MeeshyPalette.Error else MeeshyMediaChromeColors.OnMediaSecondary,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.SemiBold,
                        shadow = LegibleShadow,
                    ),
                )
            }
        }
        val replyLabel = stringResource(R.string.stories_comments_overlay_reply)
        Row(
            Modifier
                .heightIn(min = 48.dp)
                .clickable(role = Role.Button) { callbacks.onReply(comment) },
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xxs),
        ) {
            Icon(MeeshyIcons.Reply, contentDescription = null, tint = MeeshyMediaChromeColors.OnMediaSecondary, modifier = Modifier.size(14.dp))
            Text(replyLabel, style = TextStyle(color = MeeshyMediaChromeColors.OnMediaSecondary, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, shadow = LegibleShadow))
        }
        Spacer(Modifier.weight(1f))
        StoryCommentMoreMenu(comment = comment, actions = menu, callbacks = callbacks, onEdit = onEdit)
    }
}

/** Les auteurs très sombres sont mélangés vers le blanc pour ne jamais disparaître sur une story sombre (iOS `legibleAuthorColor`). */
internal fun legibleAuthorColor(base: Color): Color {
    val luminance = 0.2126f * base.red + 0.7152f * base.green + 0.0722f * base.blue
    if (luminance >= 0.4f) return base
    val f = 0.55f
    return Color(base.red + (1 - base.red) * f, base.green + (1 - base.green) * f, base.blue + (1 - base.blue) * f)
}
