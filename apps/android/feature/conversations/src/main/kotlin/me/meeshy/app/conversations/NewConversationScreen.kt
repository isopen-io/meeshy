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
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
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
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.xs),
            )

            state.errorMessage?.let { message ->
                Text(
                    text = message,
                    color = MeeshyPalette.Error,
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.xs),
                )
            }

            Box(modifier = Modifier.fillMaxSize()) {
                LazyColumn(modifier = Modifier.fillMaxSize()) {
                    items(state.results, key = { it.id }) { user ->
                        UserRow(user = user, onClick = { viewModel.toggleSelection(user.id) })
                    }
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
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .semantics { role = Role.Button }
            .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        Box {
            MeeshyAvatar(name = user.displayName, size = 44.dp)
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
        if (user.isSelected) {
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
