package me.meeshy.app.conversations

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.ui.graphics.Brush
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Archive
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.NotificationsOff
import androidx.compose.material.icons.filled.PushPin
import androidx.compose.material.icons.filled.HourglassEmpty
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material.icons.filled.LocalFireDepartment
import androidx.compose.material.icons.filled.Timer
import androidx.compose.material3.Badge
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SwipeToDismissBox
import androidx.compose.material3.SwipeToDismissBoxValue
import androidx.compose.material3.Text
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.rememberSwipeToDismissBoxState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import me.meeshy.feature.conversations.R
import me.meeshy.sdk.conversation.LocalMessage
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.CategoryOption
import me.meeshy.sdk.model.ConversationDraft
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.MemberRole
import me.meeshy.sdk.model.PresenceState
import me.meeshy.sdk.model.currentUserRole
import me.meeshy.sdk.model.isMeaningful
import me.meeshy.sdk.model.resolvedLastMessagePreview
import me.meeshy.sdk.theme.DynamicColorGenerator
import me.meeshy.sdk.theme.accentColorPalette
import me.meeshy.sdk.theme.displayTitle
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.component.StoryRingState
import me.meeshy.ui.component.chrome.MeeshyGlassSurface
import me.meeshy.ui.format.RelativeTimeFormat
import me.meeshy.ui.format.rememberRelativeTimeStrings
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.hexColor
import java.time.ZoneId
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun ConversationRow(
    conversation: ApiConversation,
    currentUserId: String?,
    currentUserPrefs: MeeshyUser?,
    presence: PresenceState?,
    storyRing: StoryRingState,
    moodEmoji: String?,
    draft: ConversationDraft?,
    typingDisplayName: String?,
    categories: List<CategoryOption>,
    previewMessages: List<LocalMessage>?,
    onClick: () -> Unit,
    onTogglePin: () -> Unit,
    onToggleMute: () -> Unit,
    onToggleMentionsOnly: () -> Unit,
    onToggleArchive: () -> Unit,
    onLeaveConversation: () -> Unit,
    onDeleteForMe: () -> Unit,
    onDeleteForAll: () -> Unit,
    onRename: (String) -> Unit,
    onSetReaction: (String?) -> Unit,
    onSetTags: (List<String>) -> Unit,
    onMarkRead: () -> Unit,
    onMarkUnread: () -> Unit,
    onDiscardDraft: () -> Unit,
    onAssignCategory: (String) -> Unit,
    onCreateCategory: (String) -> Unit,
    onLoadPreview: () -> Unit,
    isLocked: Boolean,
    onLockToggle: () -> Unit,
) {
    val prefs = conversation.resolvedPreferences
    val isPinned = prefs?.isPinned == true
    val isMuted = prefs?.isMuted == true
    val mentionsOnly = prefs?.mentionsOnly == true
    val isArchived = prefs?.isArchived == true

    // Swipe snaps back after firing the action (non-destructive) — the visual
    // outcome is the row re-sorting/re-filtering itself once the cache mutates.
    val dismissState = rememberSwipeToDismissBoxState(
        confirmValueChange = { value ->
            when (value) {
                SwipeToDismissBoxValue.StartToEnd -> onTogglePin()
                SwipeToDismissBoxValue.EndToStart -> onToggleArchive()
                SwipeToDismissBoxValue.Settled -> Unit
            }
            false
        },
    )

    SwipeToDismissBox(
        state = dismissState,
        backgroundContent = {
            SwipeActionBackground(
                direction = dismissState.dismissDirection,
                isPinned = isPinned,
                isArchived = isArchived,
            )
        },
    ) {
        ConversationRowContent(
            conversation = conversation,
            currentUserId = currentUserId,
            currentUserPrefs = currentUserPrefs,
            presence = presence,
            storyRing = storyRing,
            moodEmoji = moodEmoji,
            draft = draft,
            typingDisplayName = typingDisplayName,
            isPinned = isPinned,
            isMuted = isMuted,
            mentionsOnly = mentionsOnly,
            isArchived = isArchived,
            categories = categories,
            currentCategoryId = prefs?.categoryId,
            previewMessages = previewMessages,
            onClick = onClick,
            onTogglePin = onTogglePin,
            onToggleMute = onToggleMute,
            onToggleMentionsOnly = onToggleMentionsOnly,
            onToggleArchive = onToggleArchive,
            onLeaveConversation = onLeaveConversation,
            onDeleteForMe = onDeleteForMe,
            onDeleteForAll = onDeleteForAll,
            onRename = onRename,
            currentCustomName = prefs?.customName,
            onSetReaction = onSetReaction,
            currentReaction = prefs?.reaction,
            onSetTags = onSetTags,
            currentTags = prefs?.tags.orEmpty(),
            onMarkRead = onMarkRead,
            onMarkUnread = onMarkUnread,
            onDiscardDraft = onDiscardDraft,
            onAssignCategory = onAssignCategory,
            onCreateCategory = onCreateCategory,
            onLoadPreview = onLoadPreview,
            isLocked = isLocked,
            onLockToggle = onLockToggle,
        )
    }
}

/**
 * The conversation row's trailing timestamp as a compact relative label ("5 min", "2 h", "3 j",
 * …) — the Android parity of iOS `ThemedConversationRow`'s
 * `RelativeTimeFormatter.shortString(for: conversation.lastMessageAt)`. Returns null when the
 * conversation carries no parseable timestamp, so a brand-new row with no activity shows no label
 * rather than a placeholder. The [rememberRelativeTimeStrings] read stays before the early return
 * to keep the composable-call graph unconditional.
 */
@Composable
private fun conversationRowRelativeTime(conversation: ApiConversation): String? {
    val strings = rememberRelativeTimeStrings()
    val millis = ConversationRowTime.epochMillis(conversation) ?: return null
    return RelativeTimeFormat.short(
        epochMillis = millis,
        referenceMillis = System.currentTimeMillis(),
        zone = ZoneId.systemDefault(),
        locale = Locale.getDefault(),
        strings = strings,
    )
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalFoundationApi::class)
@Composable
private fun ConversationRowContent(
    conversation: ApiConversation,
    currentUserId: String?,
    currentUserPrefs: MeeshyUser?,
    presence: PresenceState?,
    storyRing: StoryRingState,
    moodEmoji: String?,
    draft: ConversationDraft?,
    typingDisplayName: String?,
    isPinned: Boolean,
    isMuted: Boolean,
    mentionsOnly: Boolean,
    isArchived: Boolean,
    categories: List<CategoryOption>,
    currentCategoryId: String?,
    previewMessages: List<LocalMessage>?,
    onClick: () -> Unit,
    onTogglePin: () -> Unit,
    onToggleMute: () -> Unit,
    onToggleMentionsOnly: () -> Unit,
    onToggleArchive: () -> Unit,
    onLeaveConversation: () -> Unit,
    onDeleteForMe: () -> Unit,
    onDeleteForAll: () -> Unit,
    onRename: (String) -> Unit,
    currentCustomName: String?,
    onSetReaction: (String?) -> Unit,
    currentReaction: String?,
    onSetTags: (List<String>) -> Unit,
    currentTags: List<String>,
    onMarkRead: () -> Unit,
    onMarkUnread: () -> Unit,
    onDiscardDraft: () -> Unit,
    onAssignCategory: (String) -> Unit,
    onCreateCategory: (String) -> Unit,
    onLoadPreview: () -> Unit,
    isLocked: Boolean,
    onLockToggle: () -> Unit,
) {
    val title = conversation.displayTitle(currentUserId)
    val isCreator = conversation.currentUserRole(currentUserId) == MemberRole.CREATOR
    var menuExpanded by remember { mutableStateOf(false) }
    val previewLabels = LastMessagePreviewLabels(
        photo = stringResource(R.string.conversations_preview_photo),
        video = stringResource(R.string.conversations_preview_video),
        voice = stringResource(R.string.conversations_preview_voice),
        file = stringResource(R.string.conversations_preview_file),
        location = stringResource(R.string.conversations_preview_location),
        none = stringResource(R.string.conversations_no_messages),
        you = stringResource(R.string.conversations_preview_you),
        senderFormat = stringResource(R.string.conversations_preview_sender_format),
        draftPrefix = stringResource(R.string.conversations_preview_draft_prefix),
        expired = stringResource(R.string.conversations_preview_expired),
        hidden = stringResource(R.string.conversations_preview_hidden),
        viewOnce = stringResource(R.string.conversations_preview_view_once),
    )
    val draftLine = draftPreview(draft, previewLabels)
    val typingLine = typingPreview(
        typingDisplayName,
        stringResource(R.string.conversations_preview_typing),
    )
    val rowPreview = conversationRowPreview(
        typingLine = typingLine,
        draftLine = draftLine,
        summary = messageSummaryLine(
            message = conversation.lastMessage,
            currentUserId = currentUserId,
            showSender = conversation.type != "direct",
            labels = previewLabels,
            nowMillis = System.currentTimeMillis(),
            // Prisme Linguistique on the row itself. The hard-press preview card two
            // hundred lines below already resolved it per message from this very
            // `currentUserPrefs`; the row behind it rendered the sender's language.
            // `null` prefs (session not hydrated yet) ⇒ empty prism ⇒ the raw preview,
            // which is exactly what the row showed before.
            resolvedContent = conversation.resolvedLastMessagePreview(
                currentUserPrefs
                    ?.let(LanguageResolver::preferredContentLanguages)
                    .orEmpty(),
            ),
        ),
    )
    // Deterministic per-conversation palette — computed once so the avatar's primary fill
    // and the row's heat-gradient tint (secondary → primary, parity iOS `heatBackground`)
    // never re-derive it. Pre-parsed hex → Color, so the row body reads plain Color values.
    val palette = remember(conversation) { conversation.accentColorPalette() }
    val primaryAccent = hexColor(palette.primary)
    val secondaryAccent = hexColor(palette.secondary)
    val heat = ConversationActivityHeat.of(conversation, System.currentTimeMillis())
    val gradient = ConversationActivityHeat.gradient(heat, isDark = MeeshyTheme.isDark)
    val heatBrush = Brush.linearGradient(
        colors = listOf(
            primaryAccent.copy(alpha = gradient.topOpacity),
            secondaryAccent.copy(alpha = gradient.bottomOpacity),
        ),
    )
    Box {
        MeeshyGlassSurface(
            shape = RoundedCornerShape(MeeshyRadius.xl),
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.xs)
                .combinedClickable(
                    onClick = onClick,
                    onLongClick = {
                        onLoadPreview()
                        menuExpanded = true
                    },
                )
                .semantics { role = Role.Button; contentDescription = title },
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(heatBrush)
                    .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.md),
                verticalAlignment = Alignment.CenterVertically,
            ) {
            MeeshyAvatar(
                name = title,
                containerColor = primaryAccent,
                presence = presence,
                storyRing = storyRing,
                moodEmoji = moodEmoji,
            )
            Column(
                modifier = Modifier
                    .weight(1f)
                    .padding(horizontal = MeeshySpacing.md),
            ) {
                ConversationTagsRow(currentTags)
                Row(verticalAlignment = Alignment.CenterVertically) {
                    if (isPinned) {
                        Icon(
                            imageVector = Icons.Filled.PushPin,
                            contentDescription = stringResource(R.string.conversations_badge_pinned),
                            tint = MeeshyTheme.tokens.textSecondary,
                            modifier = Modifier
                                .size(14.dp)
                                .padding(end = MeeshySpacing.xs),
                        )
                    }
                    Text(
                        text = title,
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.SemiBold,
                        color = MeeshyTheme.tokens.textPrimary,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f, fill = false),
                    )
                    if (isMuted) {
                        Icon(
                            imageVector = Icons.Filled.NotificationsOff,
                            contentDescription = stringResource(R.string.conversations_badge_muted),
                            tint = MeeshyTheme.tokens.textSecondary,
                            modifier = Modifier
                                .size(14.dp)
                                .padding(start = MeeshySpacing.xs),
                        )
                    }
                    if (isLocked) {
                        Icon(
                            imageVector = Icons.Filled.Lock,
                            contentDescription = stringResource(R.string.conversations_badge_locked),
                            tint = MeeshyTheme.tokens.textSecondary,
                            modifier = Modifier
                                .size(14.dp)
                                .padding(start = MeeshySpacing.xs),
                        )
                    }
                }
                ConversationRowPreviewLine(
                    preview = rowPreview,
                    primaryAccent = primaryAccent,
                )
            }
            Column(
                horizontalAlignment = Alignment.End,
                verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
            ) {
                conversationRowRelativeTime(conversation)?.let { relativeTime ->
                    Text(
                        text = relativeTime,
                        style = MaterialTheme.typography.labelSmall,
                        color = if (conversation.unreadCount > 0) {
                            MeeshyTheme.tokens.error
                        } else {
                            primaryAccent
                        },
                        maxLines = 1,
                    )
                }
                if (conversation.unreadCount > 0) {
                    Badge { Text(conversation.unreadCount.coerceAtMost(99).toString()) }
                }
            }
            }
        }

        ConversationContextMenu(
            expanded = menuExpanded,
            onDismiss = { menuExpanded = false },
            title = title,
            isPinned = isPinned,
            isMuted = isMuted,
            mentionsOnly = mentionsOnly,
            isArchived = isArchived,
            hasUnread = conversation.unreadCount > 0,
            hasDraft = draft?.isMeaningful == true,
            categories = categories,
            currentCategoryId = currentCategoryId,
            previewMessages = previewMessages,
            previewShowSender = conversation.type != "direct",
            currentUserId = currentUserId,
            currentUserPrefs = currentUserPrefs,
            previewLabels = previewLabels,
            isCreator = isCreator,
            onTogglePin = onTogglePin,
            onToggleMute = onToggleMute,
            onToggleMentionsOnly = onToggleMentionsOnly,
            onToggleArchive = onToggleArchive,
            onLeaveConversation = onLeaveConversation,
            onDeleteForMe = onDeleteForMe,
            onDeleteForAll = onDeleteForAll,
            onRename = onRename,
            currentCustomName = currentCustomName,
            onSetReaction = onSetReaction,
            currentReaction = currentReaction,
            onSetTags = onSetTags,
            currentTags = currentTags,
            onMarkRead = onMarkRead,
            onMarkUnread = onMarkUnread,
            onDiscardDraft = onDiscardDraft,
            onAssignCategory = onAssignCategory,
            onCreateCategory = onCreateCategory,
            isLocked = isLocked,
            onLockToggle = onLockToggle,
        )
    }
}

/**
 * Conversation-row tag chips with a width-based "+N" overflow badge — parity iOS
 * `ThemedConversationRow.tagsRow`. The fit decision is the pure [ConversationTagRow];
 * this Composable only supplies the real available width (via [BoxWithConstraints],
 * an improvement over iOS's hardcoded 200pt estimate) and paints the chips. Each
 * chip's colour is the deterministic [DynamicColorGenerator.colorForName] so the same
 * tag name reads the same colour everywhere.
 */
/**
 * Kind-aware preview line — the Compose surface for [RowPreview.kind]. Standard
 * typing/draft/last-message text renders as before (accent when live-activity,
 * secondary otherwise). Expired/hidden/view-once messages render italic with a
 * kind icon and a muted or accent tint that mirrors iOS
 * `ThemedConversationRow.lastMessagePreviewView`. Ephemeral-active shows the same
 * body text with a leading timer badge so a still-readable ephemeral is obvious.
 *
 * Compose glue — the kind classification (pure) is covered by [MessageSummaryKindTest]
 * / [MessageSummaryLineTest] / [ConversationRowPreviewKindTest]; the visual mapping
 * here is testable-exempt Compose per `TDD-COVERAGE.md`.
 */
@Composable
private fun ConversationRowPreviewLine(
    preview: RowPreview,
    primaryAccent: Color,
) {
    val bodySmall = MaterialTheme.typography.bodySmall
    val textSecondary = MeeshyTheme.tokens.textSecondary
    val textMuted = MeeshyTheme.tokens.textSecondary.copy(alpha = 0.65f)
    val standardColor = if (preview.isAccent) primaryAccent else textSecondary

    val (icon, contentDescriptionRes, tint, italic) = when (preview.kind) {
        MessageSummaryKind.EXPIRED -> RowPreviewKindStyle(
            icon = Icons.Filled.HourglassEmpty,
            contentDescriptionRes = R.string.conversations_preview_expired_content_description,
            tint = textMuted,
            italic = true,
        )
        MessageSummaryKind.HIDDEN -> RowPreviewKindStyle(
            icon = Icons.Filled.VisibilityOff,
            contentDescriptionRes = R.string.conversations_preview_hidden_content_description,
            tint = textSecondary,
            italic = true,
        )
        MessageSummaryKind.VIEW_ONCE -> RowPreviewKindStyle(
            icon = Icons.Filled.LocalFireDepartment,
            contentDescriptionRes = R.string.conversations_preview_view_once_content_description,
            tint = primaryAccent,
            italic = true,
        )
        MessageSummaryKind.EPHEMERAL_ACTIVE -> RowPreviewKindStyle(
            icon = Icons.Filled.Timer,
            contentDescriptionRes = R.string.conversations_preview_ephemeral_content_description,
            tint = standardColor,
            italic = false,
        )
        MessageSummaryKind.STANDARD -> RowPreviewKindStyle(
            icon = null,
            contentDescriptionRes = null,
            tint = standardColor,
            italic = false,
        )
    }

    Row(verticalAlignment = Alignment.CenterVertically) {
        if (icon != null) {
            Icon(
                imageVector = icon,
                contentDescription = contentDescriptionRes?.let { stringResource(it) },
                tint = tint,
                modifier = Modifier
                    .size(14.dp)
                    .padding(end = MeeshySpacing.xs),
            )
        }
        Text(
            text = preview.text,
            style = bodySmall,
            color = tint,
            fontStyle = if (italic) FontStyle.Italic else FontStyle.Normal,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

private data class RowPreviewKindStyle(
    val icon: androidx.compose.ui.graphics.vector.ImageVector?,
    val contentDescriptionRes: Int?,
    val tint: Color,
    val italic: Boolean,
)
@Composable
private fun ConversationTagsRow(tags: List<String>) {
    if (tags.isEmpty()) return
    BoxWithConstraints {
        val fit = ConversationTagRow.fit(tags, maxWidth.value.toDouble())
        Row(
            modifier = Modifier.padding(bottom = MeeshySpacing.xs),
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            fit.visible.forEach { tag -> ConversationTagChip(tag) }
            if (fit.remaining > 0) {
                Text(
                    text = stringResource(R.string.conversations_row_tags_overflow, fit.remaining),
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.Bold,
                    color = MeeshyTheme.tokens.textSecondary,
                    maxLines = 1,
                    modifier = Modifier
                        .clip(CircleShape)
                        .background(MeeshyTheme.tokens.textSecondary.copy(alpha = 0.10f))
                        .padding(horizontal = MeeshySpacing.sm, vertical = 2.dp),
                )
            }
        }
    }
}

@Composable
private fun ConversationTagChip(tag: String) {
    val color = hexColor(DynamicColorGenerator.colorForName(tag))
    Text(
        text = tag,
        style = MaterialTheme.typography.labelSmall,
        fontWeight = FontWeight.Medium,
        color = color,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
        modifier = Modifier
            .clip(CircleShape)
            .background(color.copy(alpha = 0.14f))
            .padding(horizontal = MeeshySpacing.sm, vertical = 2.dp),
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SwipeActionBackground(
    direction: SwipeToDismissBoxValue,
    isPinned: Boolean,
    isArchived: Boolean,
) {
    val (alignment, icon, description, background) = when (direction) {
        SwipeToDismissBoxValue.StartToEnd -> SwipeActionVisual(
            alignment = Alignment.CenterStart,
            icon = Icons.Filled.PushPin,
            description = stringResource(
                if (isPinned) R.string.conversations_action_unpin
                else R.string.conversations_action_pin,
            ),
            background = MeeshyPalette.Warning.copy(alpha = 0.20f),
        )
        SwipeToDismissBoxValue.EndToStart -> SwipeActionVisual(
            alignment = Alignment.CenterEnd,
            icon = Icons.Filled.Archive,
            description = stringResource(
                if (isArchived) R.string.conversations_action_unarchive
                else R.string.conversations_action_archive,
            ),
            background = MeeshyTheme.tokens.backgroundTertiary,
        )
        SwipeToDismissBoxValue.Settled -> SwipeActionVisual(
            alignment = Alignment.CenterStart,
            icon = Icons.Filled.PushPin,
            description = "",
            background = Color.Transparent,
        )
    }
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(background)
            .padding(horizontal = MeeshySpacing.xl),
        contentAlignment = alignment,
    ) {
        if (direction != SwipeToDismissBoxValue.Settled) {
            Icon(
                imageVector = icon,
                contentDescription = description,
                tint = MeeshyTheme.tokens.textSecondary,
            )
        }
    }
}

private data class SwipeActionVisual(
    val alignment: Alignment,
    val icon: androidx.compose.ui.graphics.vector.ImageVector,
    val description: String,
    val background: Color,
)
