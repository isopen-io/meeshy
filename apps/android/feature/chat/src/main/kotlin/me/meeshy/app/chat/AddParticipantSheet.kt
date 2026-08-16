package me.meeshy.app.chat

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.chat.R
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * "Add a member" search sheet nested inside [ConversationMembersSheet] — the Android port
 * of iOS `AddParticipantSheet`. Coverage-exempt Compose glue: every rule it renders is
 * tested in [AddParticipantViewModel] (search debounce, member/adding/added row state,
 * refusal rollback).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AddParticipantSheet(
    conversationId: String,
    existingMemberIds: Set<String>,
    accentColor: Color,
    onDismiss: () -> Unit,
    onAdded: () -> Unit,
    viewModel: AddParticipantViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    LaunchedEffect(conversationId, existingMemberIds) {
        viewModel.load(conversationId, existingMemberIds)
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = MeeshyTheme.tokens.backgroundPrimary,
    ) {
        Column(modifier = Modifier.fillMaxWidth().padding(bottom = MeeshySpacing.lg)) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.sm),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = stringResource(R.string.add_participant_title),
                    style = MaterialTheme.typography.titleMedium,
                    color = MeeshyTheme.tokens.textPrimary,
                )
                IconButton(onClick = onDismiss) {
                    Icon(
                        imageVector = Icons.Filled.Close,
                        contentDescription = stringResource(R.string.add_participant_close),
                    )
                }
            }

            OutlinedTextField(
                value = state.query,
                onValueChange = viewModel::onQueryChange,
                singleLine = true,
                leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
                placeholder = { Text(stringResource(R.string.add_participant_search_hint)) },
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = accentColor,
                    cursorColor = accentColor,
                ),
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.xs),
            )

            when {
                state.isSearching -> Box(
                    modifier = Modifier.fillMaxWidth().padding(MeeshySpacing.lg),
                    contentAlignment = Alignment.Center,
                ) {
                    CircularProgressIndicator(color = accentColor, strokeWidth = 2.dp, modifier = Modifier.size(24.dp))
                }

                state.query.trim().length < 2 -> AddParticipantMessage(
                    stringResource(R.string.add_participant_prompt),
                )

                state.results.isEmpty() -> AddParticipantMessage(
                    stringResource(R.string.add_participant_no_results),
                )

                else -> LazyColumn(modifier = Modifier.fillMaxWidth().heightIn(max = 460.dp)) {
                    items(state.results, key = { it.id }) { row ->
                        AddParticipantRowView(
                            row = row,
                            accentColor = accentColor,
                            onAdd = { viewModel.addParticipant(row.id, onAdded) },
                        )
                    }
                }
            }

            if (state.errorMessage != null) {
                Text(
                    text = state.errorMessage.orEmpty(),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier.padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.xs),
                )
            }
        }
    }
}

@Composable
private fun AddParticipantRowView(
    row: AddParticipantRow,
    accentColor: Color,
    onAdd: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.md),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        MeeshyAvatar(name = row.name, size = 40.dp, containerColor = accentColor)

        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = row.name,
                style = MaterialTheme.typography.bodyLarge,
                color = MeeshyTheme.tokens.textPrimary,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = "@${row.username}",
                style = MaterialTheme.typography.labelMedium,
                color = MeeshyTheme.tokens.textSecondary,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }

        when {
            row.isMember -> Text(
                text = stringResource(R.string.add_participant_member_badge),
                style = MaterialTheme.typography.labelMedium,
                color = MeeshyTheme.tokens.textSecondary,
            )
            row.isAdding -> CircularProgressIndicator(
                color = accentColor,
                strokeWidth = 2.dp,
                modifier = Modifier.size(20.dp),
            )
            else -> Button(onClick = onAdd) {
                Text(stringResource(R.string.add_participant_add_button))
            }
        }
    }
}

@Composable
private fun AddParticipantMessage(text: String) {
    Box(
        modifier = Modifier.fillMaxWidth().padding(MeeshySpacing.xxl),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = text,
            style = MaterialTheme.typography.bodyMedium,
            color = MeeshyTheme.tokens.textSecondary,
        )
    }
}
