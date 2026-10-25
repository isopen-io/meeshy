package me.meeshy.app.conversations

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
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
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import me.meeshy.feature.conversations.R
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.MemberRole
import me.meeshy.sdk.model.conversationlist.ConversationRowMenuCapabilities
import me.meeshy.sdk.model.currentUserRole
import me.meeshy.sdk.model.isMeaningful
import me.meeshy.sdk.model.resolvedLastMessagePreview
import me.meeshy.sdk.theme.accentColorPalette
import me.meeshy.sdk.theme.displayTitle
import me.meeshy.ui.theme.LentilleMetrics
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.hexColor
import me.meeshy.ui.R as UiR

internal const val ROW_TEST_TAG = "conversation-row"
internal const val ROW_SELECTION_BAR_TEST_TAG = "conversation-row-selection-bar"

/**
 * Le conteneur de gestes de la rangée plate: toucher ouvre, appui long ouvre le menu contextuel,
 * sourdine et glisser-déposer modulent opacité et échelle, la sélection (tablette) pose une barre
 * d'accent de 3 dp — jamais un fond. Pour TalkBack c'est UN seul bouton au libellé complet (synchro
 * en attente comprise), qui porte « Rejoindre l'appel » en action personnalisée quand un appel est en cours.
 * Le contenu dessiné vit dans [ConversationFlatRow].
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
internal fun ConversationRowContainer(
    model: ConversationRowModel,
    actions: ConversationRowActions,
) {
    val conversation = model.conversation
    val prefs = conversation.resolvedPreferences
    val isPinned = prefs?.isPinned == true
    val isMuted = prefs?.isMuted == true
    val currentTags = prefs?.tags.orEmpty()
    val title = conversation.displayTitle(model.currentUserId)
    var menuExpanded by remember { mutableStateOf(false) }

    val previewLabels = lastMessagePreviewLabels()
    val draftLine = draftPreview(model.draft, previewLabels)
    val typingLine = typingPreview(model.typingDisplayName, stringResource(R.string.conversations_preview_typing))
    val rowPreview = conversationRowPreview(
        typingLine = typingLine,
        draft = draftLine,
        summary = messageSummaryLine(
            message = conversation.lastMessage,
            currentUserId = model.currentUserId,
            showSender = conversation.type != "direct",
            labels = previewLabels,
            nowMillis = model.nowMillis,
            // Prisme Linguistique: la rangée sert la même traduction que l'aperçu appui long;
            // des préférences absentes (session non hydratée) donnent le prisme vide, donc l'original.
            resolvedContent = conversation.resolvedLastMessagePreview(
                model.currentUserPrefs?.let(LanguageResolver::preferredContentLanguages).orEmpty(),
            ),
        ),
    )
    val line2 = ConversationRowPrecedence.line2(hasTyping = typingLine != null, hasDraft = draftLine != null)
    val managesMembers = remember(conversation, model.currentUserPrefs, model.isLocked) {
        ConversationRowMenuCapabilities.make(conversation, model.currentUserPrefs)
            .offersManageMembers(isLocked = model.isLocked)
    }
    val palette = remember(conversation) { conversation.accentColorPalette() }
    val accent = hexColor(palette.primary)
    val secondary = hexColor(palette.secondary)
    val timeLabel = conversationRowRelativeTime(conversation, model.nowMillis)

    val label = rowAccessibilityLabel(model, title, rowPreview, timeLabel, isPinned, isMuted)
    val opensHint = stringResource(R.string.conversations_row_opens_conversation)
    val joinCallDescription = stringResource(R.string.row_join_call_a11y)
    val showsJoin = ConversationRowJoinCall.isVisible(
        callInProgress = model.callInProgress,
        isLocked = model.isLocked,
        isTyping = line2 == RowLine2.TYPING,
    )
    val scale by animateFloatAsState(
        targetValue = ConversationRowAppearance.dragScale(model.isDragging),
        animationSpec = tween(durationMillis = 150),
        label = "conversationRowDragScale",
    )

    Box {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .padding(
                    horizontal = LentilleMetrics.Row.marginHorizontal,
                    vertical = LentilleMetrics.Row.marginVertical,
                )
                .graphicsLayer { scaleX = scale; scaleY = scale }
                .alpha(ConversationRowAppearance.rowOpacity(isMuted, model.isDragging))
                .testTag(ROW_TEST_TAG)
                .heightIn(min = LentilleMetrics.Row.height)
                .clip(RoundedCornerShape(LentilleMetrics.Row.radius))
                .combinedClickable(
                    onClickLabel = opensHint,
                    onClick = actions.onClick,
                    onLongClick = {
                        actions.onLoadPreview()
                        menuExpanded = true
                    },
                )
                // Un seul bouton au libellé complet: les enfants fusionnent, ils ne se lisent pas un à un.
                .semantics(mergeDescendants = true) {
                    contentDescription = label
                    role = Role.Button
                    selected = model.isSelected
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
            ConversationFlatRow(
                model = model,
                title = title,
                accent = accent,
                secondary = secondary,
                isPinned = isPinned,
                isMuted = isMuted,
                reaction = ConversationRowAppearance.favoriteEmoji(prefs),
                tags = currentTags,
                rowPreview = rowPreview,
                line2 = line2,
                timeLabel = timeLabel,
                onJoinCall = actions.onJoinCall.takeIf { showsJoin },
            )
            if (model.isSelected) {
                Box(
                    modifier = Modifier
                        .align(Alignment.CenterStart)
                        .padding(vertical = MeeshySpacing.xs)
                        .fillMaxHeight()
                        .width(3.dp)
                        .testTag(ROW_SELECTION_BAR_TEST_TAG)
                        .clip(RoundedCornerShape(1.5.dp))
                        .background(accent),
                )
            }
        }

        ConversationContextMenu(
            expanded = menuExpanded,
            onDismiss = { menuExpanded = false },
            title = title,
            isPinned = isPinned,
            isMuted = isMuted,
            mentionsOnly = prefs?.mentionsOnly == true,
            isArchived = prefs?.isArchived == true,
            hasUnread = conversation.unreadCount > 0,
            hasDraft = model.draft?.isMeaningful == true,
            categories = model.categories,
            currentCategoryId = prefs?.categoryId,
            previewMessages = model.previewMessages,
            previewShowSender = conversation.type != "direct",
            currentUserId = model.currentUserId,
            currentUserPrefs = model.currentUserPrefs,
            previewLabels = previewLabels,
            isCreator = conversation.currentUserRole(model.currentUserId) == MemberRole.CREATOR,
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
            isLocked = model.isLocked,
            onLockToggle = actions.onLockToggle,
            onViewInfo = actions.onViewInfo,
            onViewProfile = actions.onViewProfile,
            onCreateShareLink = actions.onCreateShareLink,
            onManageMembers = actions.onManageMembers
                ?.takeIf { managesMembers }
                ?.let { open -> { open(accent) } },
        )
    }
}

@Composable
private fun rowAccessibilityLabel(
    model: ConversationRowModel,
    title: String,
    rowPreview: RowPreview,
    timeLabel: String?,
    isPinned: Boolean,
    isMuted: Boolean,
): String {
    val unread = model.conversation.unreadCount
    val spokenPreview = ConversationRowAccessibility.spokenPreview(rowPreview)
    return ConversationRowAccessibility.label(
        title = stringResource(R.string.accessibility_conversation_with, title),
        preview = spokenPreview.takeIf { it.isNotBlank() }
            ?.let { stringResource(R.string.accessibility_last_message_preview, it) },
        time = timeLabel,
        unread = if (unread > 0) pluralStringResource(UiR.plurals.unread_badge_description, unread, unread) else null,
        muted = stringResource(R.string.accessibility_muted).takeIf { isMuted },
        pinned = stringResource(R.string.accessibility_pinned).takeIf { isPinned },
        locked = stringResource(R.string.conversations_badge_locked).takeIf { model.isLocked },
        points = model.spokenPoints,
        pendingSync = stringResource(R.string.row_a11y_pending_sync).takeIf { model.hasPendingSync },
    )
}
