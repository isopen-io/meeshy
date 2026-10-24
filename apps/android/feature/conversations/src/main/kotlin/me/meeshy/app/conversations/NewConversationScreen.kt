package me.meeshy.app.conversations

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Cancel
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.PersonOff
import androidx.compose.material3.AssistChip
import androidx.compose.material3.AssistChipDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import me.meeshy.ui.R as UiR
import androidx.compose.material.icons.filled.Block
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.conversations.R
import me.meeshy.sdk.model.PresenceState
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.component.meeshyPresenceDotColor
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

@OptIn(ExperimentalMaterial3Api::class)
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

    Scaffold(
        containerColor = MeeshyTheme.tokens.backgroundPrimary,
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.new_conversation_title), fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(
                            Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = stringResource(R.string.new_conversation_back),
                        )
                    }
                },
                actions = {
                    TextButton(onClick = viewModel::create, enabled = state.canCreate) {
                        Text(stringResource(R.string.new_conversation_create))
                    }
                },
            )
        },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
        ) {
            if (state.selected.isNotEmpty()) {
                SelectedChips(
                    selected = state.selected,
                    onRemove = viewModel::toggleSelection,
                )
            }

            if (state.isGroup) {
                OutlinedTextField(
                    value = state.groupTitle,
                    onValueChange = viewModel::onGroupTitleChange,
                    singleLine = true,
                    label = { Text(stringResource(R.string.new_conversation_group_title)) },
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.xs),
                )
            }

            OutlinedTextField(
                value = state.query,
                onValueChange = viewModel::onQueryChange,
                singleLine = true,
                label = { Text(stringResource(R.string.new_conversation_search_hint)) },
                trailingIcon = {
                    if (state.query.isNotEmpty()) {
                        IconButton(onClick = { viewModel.onQueryChange("") }) {
                            Icon(
                                Icons.Filled.Cancel,
                                contentDescription = stringResource(R.string.conversations_search_clear),
                                tint = MeeshyTheme.tokens.textMuted,
                            )
                        }
                    }
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.xs),
            )

            state.error?.let { error ->
                Text(
                    text = stringResource(error.messageRes()),
                    color = MeeshyPalette.Error,
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.xs),
                )
            }

            if (state.showsContacts) {
                ContactsSection(state = state, onToggle = viewModel::toggleSelection)
                return@Column
            }

            Box(modifier = Modifier.fillMaxSize()) {
                LazyColumn(modifier = Modifier.fillMaxSize()) {
                    items(state.results, key = { it.id }) { user ->
                        UserRow(user = user, onClick = { viewModel.toggleSelection(user.id) })
                        viewModel.loadMoreIfNeeded(user.id)
                    }
                    if (state.isLoadingMore) {
                        item {
                            Box(modifier = Modifier.fillMaxWidth().padding(MeeshySpacing.md)) {
                                CircularProgressIndicator(modifier = Modifier.align(Alignment.Center).size(24.dp))
                            }
                        }
                    }
                }
                if (state.showsNoResults) {
                    NoUserFound(modifier = Modifier.align(Alignment.TopCenter))
                }
                if (state.isSearching && state.results.isEmpty()) {
                    CircularProgressIndicator(
                        modifier = Modifier
                            .align(Alignment.TopCenter)
                            .padding(top = MeeshySpacing.xl),
                    )
                }
            }
        }
    }
}

private fun NewConversationError.messageRes(): Int = when (this) {
    NewConversationError.BLOCKED -> R.string.new_conversation_error_blocked
    NewConversationError.CREATE_FAILED -> R.string.new_conversation_error_create
}

/**
 * The surface the picker opens on (iOS `NewConversationView.contactsSection`): « Your contacts »,
 * served from the cache first; a loading state only on a cold cache; « No contacts » with a hint
 * to search once the roster answered with nobody.
 */
@Composable
private fun ContactsSection(state: NewConversationUiState, onToggle: (String) -> Unit) {
    val loadingLabel = stringResource(R.string.new_conversation_contacts_loading)
    LazyColumn(modifier = Modifier.fillMaxSize()) {
        item(key = "contacts-header") {
            Text(
                text = stringResource(R.string.new_conversation_contacts_section),
                style = MaterialTheme.typography.labelLarge,
                fontWeight = FontWeight.SemiBold,
                color = MeeshyTheme.tokens.textSecondary,
                modifier = Modifier
                    .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.sm)
                    .semantics { heading() },
            )
        }
        items(state.contacts, key = { "contact-${it.id}" }) { user ->
            UserRow(user = user, onClick = { onToggle(user.id) })
        }
        if (state.isLoadingContacts && state.contacts.isEmpty()) {
            item(key = "contacts-loading") {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(MeeshySpacing.xl)
                        .semantics { contentDescription = loadingLabel },
                ) {
                    CircularProgressIndicator(modifier = Modifier.align(Alignment.Center).size(24.dp))
                }
            }
        }
        if (state.showsNoContacts) {
            item(key = "contacts-empty") { NoContacts() }
        }
    }
}

@Composable
private fun NoContacts() {
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
private fun NoUserFound(modifier: Modifier = Modifier) {
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
private fun SelectedChips(
    selected: List<SelectableUser>,
    onRemove: (String) -> Unit,
) {
    LazyRow(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = MeeshySpacing.sm, vertical = MeeshySpacing.xs),
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
    ) {
        items(selected, key = { it.id }) { user ->
            AssistChip(
                onClick = { onRemove(user.id) },
                label = { Text(user.displayName) },
                trailingIcon = {
                    Icon(
                        Icons.Filled.Close,
                        contentDescription = stringResource(R.string.new_conversation_remove),
                        modifier = Modifier.size(16.dp),
                    )
                },
                colors = AssistChipDefaults.assistChipColors(
                    containerColor = MeeshyPalette.Indigo500.copy(alpha = 0.12f),
                ),
            )
        }
    }
}

@Composable
private fun UserRow(
    user: SelectableUser,
    onClick: () -> Unit,
) {
    val blockedLabel = stringResource(UiR.string.connection_badge_blocked)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .alpha(if (user.isBlocked) 0.5f else 1f)
            .clickable(enabled = !user.isBlocked, onClick = onClick)
            .semantics {
                role = Role.Button
                if (user.isBlocked) stateDescription = blockedLabel
            }
            .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        Box {
            MeeshyAvatar(name = user.displayName, size = 44.dp, imageUrl = user.avatarUrl)
            meeshyPresenceDotColor(
                if (user.isOnline) PresenceState.ONLINE else PresenceState.OFFLINE,
            )?.let { dot ->
                Box(
                    modifier = Modifier
                        .align(Alignment.BottomEnd)
                        .size(12.dp)
                        .clip(CircleShape)
                        .background(MeeshyPalette.White)
                        .padding(2.dp)
                        .clip(CircleShape)
                        .background(dot),
                )
            }
        }
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
        if (user.isBlocked) {
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
