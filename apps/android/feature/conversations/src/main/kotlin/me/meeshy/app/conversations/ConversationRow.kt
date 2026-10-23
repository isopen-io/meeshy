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
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import me.meeshy.feature.conversations.R
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.MemberRole
import me.meeshy.sdk.model.currentUserRole
import me.meeshy.sdk.model.isMeaningful
import me.meeshy.sdk.model.resolvedLastMessagePreview
import me.meeshy.sdk.theme.DynamicColorGenerator
import me.meeshy.sdk.theme.accentColorPalette
import me.meeshy.sdk.theme.displayTitle
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.component.MeeshyUnreadBadge
import me.meeshy.ui.component.chrome.MeeshyGlassSurface
import me.meeshy.ui.format.RelativeTimeFormat
import me.meeshy.ui.format.rememberRelativeTimeStrings
import me.meeshy.ui.theme.LentilleMetrics
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
    model: ConversationRowModel,
    actions: ConversationRowActions,
) {
    val prefs = model.conversation.resolvedPreferences
    val isPinned = prefs?.isPinned == true
    val isArchived = prefs?.isArchived == true

    // Swipe snaps back after firing the action (non-destructive) — the visual
    // outcome is the row re-sorting/re-filtering itself once the cache mutates.
    val dismissState = rememberSwipeToDismissBoxState(
        confirmValueChange = { value ->
            when (value) {
                SwipeToDismissBoxValue.StartToEnd -> actions.onTogglePin()
                SwipeToDismissBoxValue.EndToStart -> actions.onToggleArchive()
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
        ConversationRowContent(model = model, actions = actions)
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
    model: ConversationRowModel,
    actions: ConversationRowActions,
) {
    val conversation = model.conversation
    val currentUserId = model.currentUserId
    val currentUserPrefs = model.currentUserPrefs
    val draft = model.draft
    val prefs = conversation.resolvedPreferences
    val isPinned = prefs?.isPinned == true
    val isMuted = prefs?.isMuted == true
    val mentionsOnly = prefs?.mentionsOnly == true
    val isArchived = prefs?.isArchived == true
    val currentTags = prefs?.tags.orEmpty()
    val isLocked = model.isLocked
    val title = conversation.displayTitle(currentUserId)
    val isCreator = conversation.currentUserRole(currentUserId) == MemberRole.CREATOR
    var menuExpanded by remember { mutableStateOf(false) }
    val previewLabels = lastMessagePreviewLabels()
    val draftLine = draftPreview(draft, previewLabels)
    val typingLine = typingPreview(
        model.typingDisplayName,
        stringResource(R.string.conversations_preview_typing),
    )
    val rowPreview = conversationRowPreview(
        typingLine = typingLine,
        draft = draftLine,
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
                    onClick = actions.onClick,
                    onLongClick = {
                        actions.onLoadPreview()
                        menuExpanded = true
                    },
                )
                .alpha(ConversationRowAppearance.rowOpacity(isMuted))
                // Merged, never overridden: TalkBack reads the name, the pinned/muted/locked
                // badges, the preview line, the time and the spoken unread count together
                // (parity iOS `accessibilityElement(children: .combine)` + label).
                .semantics(mergeDescendants = true) { role = Role.Button },
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
                presence = model.presence,
                storyRing = model.storyRing,
                moodEmoji = model.moodEmoji,
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
                    ConversationRowAppearance.favoriteEmoji(prefs)?.let { emoji ->
                        Text(
                            text = emoji,
                            fontSize = LentilleMetrics.Tags.emojiSize.value.sp,
                            modifier = Modifier
                                .padding(start = MeeshySpacing.xs)
                                .clearAndSetSemantics {},
                        )
                    }
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
                        // A third level of text whatever the read state (parity iOS
                        // `timestampColor`): the unread news is the badge, never a red time.
                        color = MeeshyTheme.tokens.textMuted,
                        maxLines = 1,
                    )
                }
                MeeshyUnreadBadge(count = conversation.unreadCount)
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
            categories = model.categories,
            currentCategoryId = prefs?.categoryId,
            previewMessages = model.previewMessages,
            previewShowSender = conversation.type != "direct",
            currentUserId = currentUserId,
            currentUserPrefs = currentUserPrefs,
            previewLabels = previewLabels,
            isCreator = isCreator,
            onTogglePin = actions.onTogglePin,
            onToggleMute = actions.onToggleMute,
            onToggleMentionsOnly = actions.onToggleMentionsOnly,
            onToggleArchive = actions.onToggleArchive,
            onLeaveConversation = actions.onLeaveConversation,
            onDeleteForMe = actions.onDeleteForMe,
            onDeleteForAll = actions.onDeleteForAll,
            onRename = actions.onRename,
            currentCustomName = prefs?.customName,
            onSetReaction = actions.onSetReaction,
            currentReaction = prefs?.reaction,
            onSetTags = actions.onSetTags,
            currentTags = currentTags,
            onMarkRead = actions.onMarkRead,
            onMarkUnread = actions.onMarkUnread,
            onDiscardDraft = actions.onDiscardDraft,
            onAssignCategory = actions.onAssignCategory,
            onCreateCategory = actions.onCreateCategory,
            isLocked = isLocked,
            onLockToggle = actions.onLockToggle,
        )
    }
}
