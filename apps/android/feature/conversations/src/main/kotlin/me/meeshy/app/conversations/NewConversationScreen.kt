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
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.text.style.TextAlign
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

    LaunchedEffect(state.createdConversationId) {
        val id = state.createdConversationId ?: return@LaunchedEffect
        viewModel.consumeCreated()
        onConversationCreated(id)
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
        ),
    )
}

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
        Text(
            text = stringResource(R.string.new_conversation_contacts_empty_subtitle),
            style = MaterialTheme.typography.bodySmall,
            color = MeeshyTheme.tokens.textMuted,
            textAlign = TextAlign.Center,
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
    Row(
        modifier = modifier
            .fillMaxWidth()
            .alpha(if (user.isBlocked) 0.5f else 1f)
            .clickable(enabled = enabled && !user.isBlocked, onClick = onClick)
            .semantics {
                role = Role.Button
                if (user.isBlocked) stateDescription = blockedLabel
            }
            .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        MeeshyAvatar(
            name = user.displayName,
            size = 44.dp,
            imageUrl = user.avatarUrl,
            presence = rememberPresence(user.id, user.servedPresence),
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
