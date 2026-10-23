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
import androidx.compose.material.icons.filled.Sync
import androidx.compose.material.icons.filled.HourglassEmpty
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material.icons.filled.LocalFireDepartment
import androidx.compose.material.icons.filled.Timer
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.foundation.shape.RoundedCornerShape
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.role
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
import me.meeshy.sdk.model.avatar.AvatarContext
import me.meeshy.sdk.model.avatar.ConversationHere as AvatarHere
import me.meeshy.sdk.model.isMeaningful
import me.meeshy.sdk.model.resolvedLastMessagePreview
import me.meeshy.sdk.theme.DynamicColorGenerator
import me.meeshy.sdk.theme.accentColorPalette
import me.meeshy.sdk.theme.displayTitle
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.component.MeeshyUnreadBadge
import me.meeshy.ui.component.swipe.SwipeAction
import me.meeshy.ui.component.swipe.SwipeableRow
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

@Composable
internal fun ConversationRow(
    model: ConversationRowModel,
    actions: ConversationRowActions,
) {
    val prefs = model.conversation.resolvedPreferences
    val isPinned = prefs?.isPinned == true
    val isArchived = prefs?.isArchived == true

    val pinLabel = stringResource(
        if (isPinned) R.string.conversations_action_unpin else R.string.conversations_action_pin,
    )
    val archiveLabel = stringResource(
        if (isArchived) R.string.conversations_action_unarchive else R.string.conversations_action_archive,
    )
    val leadingActions = remember(pinLabel, actions.onTogglePin) {
        listOf(SwipeAction(Icons.Filled.PushPin, pinLabel, MeeshyPalette.Warning, actions.onTogglePin))
    }
    val trailingActions = remember(archiveLabel, actions.onToggleArchive) {
        listOf(SwipeAction(Icons.Filled.Archive, archiveLabel, MeeshyPalette.Indigo500, actions.onToggleArchive))
    }

    SwipeableRow(leadingActions = leadingActions, trailingActions = trailingActions) {
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
private fun conversationRowRelativeTime(conversation: ApiConversation, nowMillis: Long): String? {
    val strings = rememberRelativeTimeStrings()
    val millis = ConversationRowTime.epochMillis(conversation) ?: return null
    return RelativeTimeFormat.short(
        epochMillis = millis,
        referenceMillis = nowMillis,
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
            nowMillis = model.nowMillis,
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
    val heat = ConversationActivityHeat.of(conversation, model.nowMillis)
    val gradient = ConversationActivityHeat.gradient(heat, isDark = MeeshyTheme.isDark)
    val heatBrush = Brush.linearGradient(
        colors = listOf(
            primaryAccent.copy(alpha = gradient.topOpacity),
            secondaryAccent.copy(alpha = gradient.bottomOpacity),
        ),
    )
    val relativeTime = conversationRowRelativeTime(conversation, model.nowMillis)
    val accessibilityLabel = ConversationRowAccessibility.label(
        title = title,
        spokenPreview = ConversationRowAccessibility.spokenPreview(rowPreview),
        relativeTime = relativeTime,
        unreadCount = conversation.unreadCount,
        isMuted = isMuted,
        isPinned = isPinned,
        hasPendingSync = model.hasPendingSync,
        strings = conversationRowAccessibilityStrings(),
    )
    val opensConversation = stringResource(R.string.row_a11y_opens_conversation)
    val joinCallDescription = stringResource(R.string.row_join_call_a11y)
    val showsJoin = ConversationRowJoinCall.isVisible(model.callInProgress, isLocked, typingLine != null)
    Box {
        MeeshyGlassSurface(
            shape = RoundedCornerShape(MeeshyRadius.xl),
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.xs)
                .combinedClickable(
                    onClickLabel = opensConversation,
                    onClick = actions.onClick,
                    onLongClick = {
                        actions.onLoadPreview()
                        menuExpanded = true
                    },
                )
                .alpha(ConversationRowAppearance.rowOpacity(isMuted))
                // One spoken sentence (parity iOS `conversationAccessibilityLabel`): conversation
                // with X, preview, time, unread, muted, pinned, sync pending — the children are
                // folded into it, so no badge is read twice.
                .clearAndSetSemantics {
                    role = Role.Button
                    contentDescription = accessibilityLabel
                    if (showsJoin) {
                        customActions = listOf(
                            CustomAccessibilityAction(joinCallDescription) {
                                actions.onJoinCall()
                                true
                            },
                        )
                    }
                },
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
                context = AvatarContext.ConversationList,
                containerColor = primaryAccent,
                presence = model.presence,
                storyRing = model.storyRing,
                moodEmoji = model.moodEmoji,
                here = model.peerHere.toAvatarHere(),
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
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(modifier = Modifier.weight(1f, fill = false)) {
                        ConversationRowPreviewLine(
                            preview = rowPreview,
                            primaryAccent = primaryAccent,
                        )
                    }
                    if (showsJoin) {
                        ConversationRowJoinButton(accent = primaryAccent, onClick = actions.onJoinCall)
                    }
                }
            }
            Column(
                horizontalAlignment = Alignment.End,
                verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
            ) {
                if (model.hasPendingSync) {
                    Icon(
                        imageVector = Icons.Filled.Sync,
                        contentDescription = null,
                        tint = primaryAccent.copy(alpha = PENDING_SYNC_ALPHA),
                        modifier = Modifier.size(14.dp),
                    )
                }
                relativeTime?.let { timeLabel ->
                    Text(
                        text = timeLabel,
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
            onViewInfo = actions.onViewInfo,
            onViewProfile = actions.onViewProfile,
            onCreateShareLink = actions.onCreateShareLink,
        )
    }
}

/** Opacité de l'icône de synchro en attente : discrète (iOS `MeeshyOpacity.heavy`). */
private const val PENDING_SYNC_ALPHA = 0.8f

/** Les libellés parlés de la ligne, résolus une fois par composition. */
@Composable
private fun conversationRowAccessibilityStrings(): ConversationRowAccessibility.Strings {
    val resources = LocalContext.current.resources
    val conversationWith = stringResource(R.string.row_a11y_conversation_with)
    val lastMessage = stringResource(R.string.row_a11y_last_message)
    val muted = stringResource(R.string.row_a11y_muted)
    val pinned = stringResource(R.string.row_a11y_pinned)
    val pendingSync = stringResource(R.string.row_a11y_pending_sync)
    return remember(resources, conversationWith, lastMessage, muted, pinned, pendingSync) {
        ConversationRowAccessibility.Strings(
            conversationWith = { conversationWith.format(it) },
            lastMessage = { lastMessage.format(it) },
            unread = { resources.getQuantityString(R.plurals.row_a11y_unread_count, it, it) },
            muted = muted,
            pinned = pinned,
            pendingSync = pendingSync,
        )
    }
}

private fun me.meeshy.sdk.model.presence.ConversationHere.toAvatarHere(): AvatarHere =
    AvatarHere.valueOf(name)
