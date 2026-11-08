package me.meeshy.app.conversations

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import me.meeshy.feature.conversations.R
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.HighlightSegment
import me.meeshy.sdk.model.PresenceState
import me.meeshy.sdk.model.displayedAvatar
import me.meeshy.sdk.model.resolvedLastMessagePreview
import me.meeshy.sdk.net.api.UserSearchResult
import me.meeshy.sdk.search.MessageSearchHit
import me.meeshy.sdk.theme.accentColorPalette
import me.meeshy.sdk.theme.displayTitle
import me.meeshy.sdk.theme.otherParticipantUserId
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.component.chrome.MeeshyGlassSurface
import me.meeshy.ui.component.rememberPresence
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.hexColor

@Composable
internal fun ResultCard(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    description: String? = null,
    hint: String? = null,
    content: @Composable RowScope.() -> Unit,
) {
    MeeshyGlassSurface(
        shape = RoundedCornerShape(MeeshyRadius.lg),
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(MeeshyRadius.lg))
            .clickable(onClickLabel = hint, role = Role.Button, onClick = onClick)
            .semantics(mergeDescendants = true) { if (description != null) contentDescription = description },
    ) {
        Row(
            modifier = Modifier.padding(MeeshySpacing.md),
            verticalAlignment = Alignment.CenterVertically,
        ) { content() }
    }
}

@Composable
internal fun MessageHitRow(
    hit: MessageSearchHit,
    identity: MessageHitIdentity,
    resultsQuery: String,
    onClick: () -> Unit,
) {
    val sender = hit.message.sender?.displayName ?: hit.message.sender?.username.orEmpty()
    val title = identity.title.ifBlank { sender }
    val excerpt = hit.excerpt
    val description = GlobalSearchRows.messageLabel(
        template = stringResource(R.string.global_search_message_label),
        sender = sender,
        conversation = title,
        excerpt = excerpt,
        veiledLabel = stringResource(R.string.global_search_message_blurred),
        mediaLabel = mediaTranscriptLabel(),
    )
    ResultCard(
        onClick = onClick,
        description = description,
        hint = stringResource(R.string.global_search_open_conversation_hint),
    ) {
        MeeshyAvatar(name = title, size = 40.dp, imageUrl = identity.avatarUrl)
        Spacer(Modifier.width(MeeshySpacing.md))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = title,
                style = MaterialTheme.typography.titleSmall,
                color = MeeshyTheme.tokens.textPrimary,
                maxLines = 1,
            )
            if (sender.isNotBlank()) {
                Text(
                    text = sender,
                    style = MaterialTheme.typography.labelMedium,
                    color = MeeshyPalette.Indigo500,
                    maxLines = 1,
                )
            }
            MessageHitExcerpt(excerpt = excerpt, resultsQuery = resultsQuery)
        }
    }
}

/** Colle uniquement le lavis sur les segments surlignes ; la decision de correspondance vit dans `MessageTextParser`. */
internal fun washed(segments: List<HighlightSegment>, wash: Color): AnnotatedString =
    buildAnnotatedString {
        segments.forEach { segment ->
            if (segment.highlighted) {
                withStyle(SpanStyle(background = wash)) { append(segment.text) }
            } else {
                append(segment.text)
            }
        }
    }

internal val SEARCH_HIGHLIGHT_WASH = MeeshyPalette.Warning.copy(alpha = 0.45f)

private fun typeIcon(type: String): ImageVector = when (type.lowercase()) {
    "direct", "bot" -> MeeshyIcons.PersonFilled
    "group" -> MeeshyIcons.GroupFilled
    else -> MeeshyIcons.Public
}

@Composable
internal fun ConversationHitRow(
    conversation: ApiConversation,
    currentUserId: String?,
    onClick: () -> Unit,
    readerPrism: List<String> = emptyList(),
    nowMillis: Long = 0L,
) {
    val title = conversation.displayTitle(currentUserId)
    val palette = remember(conversation.id, conversation.type, conversation.memberCount) { conversation.accentColorPalette() }
    val accent = hexColor(palette.primary)
    val protection = GlobalSearchRows.protection(conversation.lastMessage, nowMillis)
    val protectionText = protection?.let { protectionLabel(it) }
    val preview = conversation.resolvedLastMessagePreview(readerPrism)?.takeIf { it.isNotBlank() }
    val members = if (conversation.memberCount > 2) {
        pluralStringResource(R.plurals.global_search_members, conversation.memberCount, conversation.memberCount)
    } else {
        null
    }
    val lastTemplate = stringResource(R.string.global_search_last_message)
    val description = listOfNotNull(
        title,
        members,
        conversation.unreadCount.takeIf { it > 0 }?.toString(),
        (protectionText ?: preview)?.let { lastTemplate.format(it) },
    ).joinToString(", ")
    ResultCard(
        onClick = onClick,
        description = description,
        hint = stringResource(R.string.global_search_open_conversation_hint),
    ) {
        MeeshyAvatar(
            name = title,
            size = 40.dp,
            containerColor = accent,
            secondaryColor = hexColor(palette.secondary),
            imageUrl = conversation.displayedAvatar(currentUserId),
            presence = rememberPresence(conversation.otherParticipantUserId(currentUserId)),
        )
        Spacer(Modifier.width(MeeshySpacing.md))
        Column(modifier = Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    imageVector = typeIcon(conversation.type),
                    contentDescription = null,
                    tint = accent,
                    modifier = Modifier.size(14.dp),
                )
                Spacer(Modifier.width(MeeshySpacing.xs))
                Text(
                    text = title,
                    style = MaterialTheme.typography.titleSmall,
                    color = MeeshyTheme.tokens.textPrimary,
                    maxLines = 1,
                )
            }
            when {
                protection != null && protectionText != null -> ProtectionLine(protection, protectionText)
                preview != null -> Text(
                    text = preview,
                    style = MaterialTheme.typography.bodySmall,
                    color = MeeshyTheme.tokens.textSecondary,
                    maxLines = 1,
                )
            }
            if (members != null) {
                Text(
                    text = members,
                    style = MaterialTheme.typography.bodySmall,
                    color = MeeshyTheme.tokens.textMuted,
                    maxLines = 1,
                )
            }
        }
        if (conversation.unreadCount > 0) {
            Box(
                modifier = Modifier
                    .clip(CircleShape)
                    .background(MeeshyPalette.Error)
                    .padding(horizontal = 7.dp, vertical = 2.dp),
            ) {
                Text(
                    text = conversation.unreadCount.toString(),
                    style = MaterialTheme.typography.labelSmall,
                    color = MeeshyPalette.White,
                )
            }
        }
    }
}

@Composable
private fun protectionLabel(protection: RowProtection): String = stringResource(
    when (protection) {
        RowProtection.HIDDEN -> R.string.global_search_summary_hidden
        RowProtection.VIEW_ONCE -> R.string.global_search_summary_view_once
        RowProtection.EXPIRED -> R.string.global_search_summary_expired
    },
)

@Composable
private fun ProtectionLine(protection: RowProtection, text: String) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Icon(
            imageVector = when (protection) {
                RowProtection.HIDDEN -> MeeshyIcons.EyeOffFilled
                RowProtection.VIEW_ONCE -> MeeshyIcons.EyeFilled
                RowProtection.EXPIRED -> MeeshyIcons.Timer
            },
            contentDescription = null,
            tint = MeeshyTheme.tokens.textSecondary,
            modifier = Modifier.size(12.dp),
        )
        Spacer(Modifier.width(MeeshySpacing.xs))
        Text(
            text = text,
            style = MaterialTheme.typography.bodySmall,
            fontStyle = FontStyle.Italic,
            color = MeeshyTheme.tokens.textSecondary,
            maxLines = 1,
        )
    }
}

@Composable
internal fun UserHitRow(user: UserSearchResult, onClick: () -> Unit) {
    val name = user.displayName ?: user.username
    val presence = rememberPresence(user.id, user.servedPresence())
    val onlineWord = stringResource(R.string.global_search_online)
    val description = GlobalSearchRows.userLabel(
        name = name,
        username = user.username,
        online = presence == PresenceState.ONLINE,
        onlineWord = onlineWord.lowercase(),
    )
    ResultCard(
        onClick = onClick,
        description = description,
        hint = stringResource(R.string.global_search_view_profile_hint),
    ) {
        MeeshyAvatar(name = name, size = 40.dp, presence = presence, imageUrl = user.avatar)
        Spacer(Modifier.width(MeeshySpacing.md))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = name,
                style = MaterialTheme.typography.titleSmall,
                color = MeeshyTheme.tokens.textPrimary,
                maxLines = 1,
            )
            Text(
                text = "@${user.username}",
                style = MaterialTheme.typography.bodySmall,
                color = MeeshyTheme.tokens.textMuted,
                maxLines = 1,
            )
        }
        if (presence == PresenceState.ONLINE) {
            Text(
                text = onlineWord,
                style = MaterialTheme.typography.labelSmall,
                color = MeeshyPalette.Success,
            )
        }
    }
}
