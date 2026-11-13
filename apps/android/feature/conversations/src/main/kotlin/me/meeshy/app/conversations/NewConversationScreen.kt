package me.meeshy.app.conversations

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.PersonOff
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import me.meeshy.ui.R as UiR
import androidx.compose.material.icons.filled.Block
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.disabled
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.platform.testTag
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.TextButton
import kotlinx.coroutines.delay
import me.meeshy.sdk.model.PresenceState
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.conversations.R
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.component.rememberPresence
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

@Composable
fun NewConversationScreen(
    onBack: () -> Unit,
    onConversationCreated: (String) -> Unit,
    viewModel: NewConversationViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    val haptics = rememberMeeshyHaptics()

    LaunchedEffect(state.createdConversationId) {
        val id = state.createdConversationId ?: return@LaunchedEffect
        haptics.success()
        delay(NAVIGATION_DELAY_MS)
        viewModel.consumeCreated()
        onConversationCreated(id)
    }

    LaunchedEffect(state.error) {
        if (state.error != null) haptics.error()
    }

    state.error?.let { error ->
        AlertDialog(
            onDismissRequest = viewModel::dismissError,
            title = { Text(stringResource(R.string.new_conversation_error_title)) },
            text = { Text(stringResource(error.messageRes())) },
            confirmButton = {
                TextButton(onClick = viewModel::dismissError) { Text(stringResource(R.string.new_conversation_ok)) }
            },
        )
    }

    LaunchedEffect(state.queuedOffline) {
        if (!state.queuedOffline) return@LaunchedEffect
        viewModel.consumeQueued()
        onBack()
    }

    NewConversationSheet(
        state = state,
        actions = NewConversationActions(
            onClose = onBack,
            onCreate = viewModel::create,
            onQueryChange = viewModel::onQueryChange,
            onToggleGroup = viewModel::toggleGroupRequested,
            onGroupTitleChange = viewModel::onGroupTitleChange,
            onToggleEncryption = viewModel::toggleEncryptionOptions,
            onSelectEncryption = viewModel::selectEncryptionMode,
            onToggleUser = viewModel::toggleSelection,
            onTapUser = viewModel::onPersonTapped,
            onRowShown = viewModel::loadMoreIfNeeded,
            onRetrySearch = viewModel::retrySearch,
            onDismissError = viewModel::dismissError,
        ),
    )
}

/** iOS closes the sheet, then pushes the conversation 0.3 s later so the dismissal can start first. */
private const val NAVIGATION_DELAY_MS = 300L

internal fun NewConversationError.messageRes(): Int = when (this) {
    NewConversationError.BLOCKED -> R.string.new_conversation_error_blocked
    NewConversationError.CREATE_FAILED -> R.string.new_conversation_error_create
}

@Composable
internal fun NoContacts() {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 48.dp, start = MeeshySpacing.xl, end = MeeshySpacing.xl)
            .semantics(mergeDescendants = true) {},
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        Icon(
            Icons.Filled.PersonOff,
            contentDescription = null,
            tint = MeeshyTheme.tokens.textMuted.copy(alpha = 0.5f),
            modifier = Modifier.size(36.dp),
        )
        Text(
            text = stringResource(R.string.new_conversation_contacts_empty_title),
            style = MaterialTheme.typography.bodyLarge,
            fontWeight = FontWeight.Medium,
            color = MeeshyTheme.tokens.textPrimary,
        )
    }
}

/** « Aucun utilisateur trouvé » (parity iOS `NewConversationView.emptyState`). */
@Composable
internal fun NoUserFound(modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(top = 60.dp)
            .semantics(mergeDescendants = true) {},
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        Icon(
            Icons.Filled.PersonOff,
            contentDescription = null,
            tint = MeeshyTheme.tokens.textMuted.copy(alpha = 0.5f),
            modifier = Modifier.size(36.dp),
        )
        Text(
            text = stringResource(R.string.new_conversation_no_user_found),
            style = MaterialTheme.typography.bodyLarge,
            fontWeight = FontWeight.Medium,
            color = MeeshyTheme.tokens.textMuted,
        )
    }
}

/** The search itself broke (iOS `searchFailed`): not « No user found », and a way to try again. */
@Composable
internal fun SearchFailed(onRetry: () -> Unit, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier.fillMaxWidth().padding(top = 60.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        Icon(
            Icons.Filled.PersonOff,
            contentDescription = null,
            tint = MeeshyTheme.tokens.textMuted.copy(alpha = 0.5f),
            modifier = Modifier.size(36.dp),
        )
        Text(
            text = stringResource(R.string.new_conversation_search_failed),
            style = MaterialTheme.typography.bodyLarge,
            fontWeight = FontWeight.Medium,
            color = MeeshyTheme.tokens.textMuted,
        )
        TextButton(onClick = onRetry, modifier = Modifier.testTag(NewConversationTags.SEARCH_RETRY)) {
            Text(stringResource(R.string.new_conversation_search_retry), fontWeight = FontWeight.Bold)
        }
    }
}

@Composable
internal fun SelectedChips(
    selected: List<SelectableUser>,
    onRemove: (String) -> Unit,
) {
    LazyRow(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.sm),
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        items(selected, key = { it.id }) { user ->
            SelectedChip(user = user, onRemove = { onRemove(user.id) })
        }
    }
}

@Composable
internal fun SelectedChip(
    user: SelectableUser,
    onRemove: () -> Unit,
) {
    val chipShape = CircleShape
    Row(
        modifier = Modifier
            .clip(chipShape)
            .background(MeeshyPalette.Indigo500.copy(alpha = 0.12f))
            .border(1.dp, MeeshyPalette.Indigo500.copy(alpha = 0.3f), chipShape)
            .padding(horizontal = MeeshySpacing.sm, vertical = MeeshySpacing.xs),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
    ) {
        MeeshyAvatar(
            name = user.displayName,
            size = 24.dp,
            imageUrl = user.avatarUrl,
            presence = rememberPresence(user.id, user.servedPresence),
        )
        Text(
            text = user.displayName,
            style = MaterialTheme.typography.bodySmall,
            fontWeight = FontWeight.SemiBold,
            color = MeeshyTheme.tokens.textPrimary,
            maxLines = 1,
        )
        Icon(
            MeeshyIcons.CloseCircleFilled,
            contentDescription = stringResource(R.string.new_conversation_remove),
            tint = MeeshyTheme.tokens.textMuted,
            modifier = Modifier
                .size(24.dp)
                .clip(CircleShape)
                .clickable(role = Role.Button, onClick = onRemove)
                .padding(2.dp),
        )
    }
}

@Composable
internal fun UserRow(
    user: SelectableUser,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    opening: Boolean = false,
) {
    val blockedLabel = stringResource(UiR.string.connection_badge_blocked)
    val presence = rememberPresence(user.id, user.servedPresence)
    val label = NewConversationLogic.rowAccessibilityLabel(
        user = user,
        isOnlineNow = presence == PresenceState.ONLINE,
        blockedLabel = blockedLabel,
        onlineLabel = stringResource(R.string.new_conversation_user_online),
    )
    Row(
        modifier = modifier
            .fillMaxWidth()
            .alpha(if (user.isBlocked) 0.5f else 1f)
            .clickable(enabled = enabled && NewConversationLogic.isSelectable(user), onClick = onClick)
            .semantics(mergeDescendants = true) {
                role = Role.Button
                contentDescription = label
                selected = user.isSelected
                if (user.isBlocked) disabled()
            }
            .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        MeeshyAvatar(
            name = user.displayName,
            size = 44.dp,
            imageUrl = user.avatarUrl,
            presence = presence,
        )
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = user.displayName,
                style = MaterialTheme.typography.bodyLarge,
                fontWeight = FontWeight.SemiBold,
                color = MeeshyTheme.tokens.textPrimary,
            )
            Text(
                text = "@${user.username}",
                style = MaterialTheme.typography.bodySmall,
                color = MeeshyTheme.tokens.textSecondary,
            )
        }
        if (opening) {
            CircularProgressIndicator(
                color = MeeshyPalette.Indigo400,
                strokeWidth = 2.dp,
                modifier = Modifier.size(20.dp).testTag(NewConversationTags.OPENING),
            )
        } else if (user.isBlocked) {
            Text(
                text = blockedLabel,
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.SemiBold,
                color = MeeshyPalette.Error.copy(alpha = 0.8f),
            )
            Icon(
                Icons.Filled.Block,
                contentDescription = null,
                tint = MeeshyPalette.Error.copy(alpha = 0.7f),
                modifier = Modifier.size(18.dp),
            )
        } else if (user.isSelected) {
            Box(
                modifier = Modifier
                    .size(24.dp)
                    .clip(CircleShape)
                    .background(MeeshyPalette.Indigo500),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    Icons.Filled.Check,
                    contentDescription = stringResource(R.string.new_conversation_selected),
                    tint = MeeshyPalette.White,
                    modifier = Modifier.size(16.dp),
                )
            }
        }
    }
}
