package me.meeshy.app.contacts

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.contacts.R
import me.meeshy.sdk.model.friend.ConnectAction
import me.meeshy.sdk.net.api.UserSearchResult
import me.meeshy.sdk.theme.DynamicColorGenerator
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.theme.hexColor

/**
 * The Discover tab — live user search with an inline connect control per result,
 * driven by [DiscoverViewModel]. Port of the iOS `DiscoverTab` search section:
 * the connect button's state is the shared relationship resolver, so it stays in
 * lock-step with the Requests tab and any other surface.
 */
@Composable
fun DiscoverTab(
    viewModel: DiscoverViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    // Cache-first suggestions paint on appear (iOS `.task { loadSuggestions() }`).
    LaunchedEffect(Unit) { viewModel.loadSuggestions() }

    Column(modifier = Modifier.fillMaxSize()) {
        OutlinedTextField(
            value = state.query,
            onValueChange = viewModel::onQueryChanged,
            singleLine = true,
            leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
            placeholder = { Text(stringResource(R.string.contacts_discover_search_hint)) },
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 8.dp),
        )

        when {
            state.isLoading -> Centered { CircularProgressIndicator() }
            state.errorMessage != null -> ErrorState(onRetry = viewModel::retry)
            state.isSuggestionsEmpty -> EmptyMessage(stringResource(R.string.contacts_discover_suggestions_empty))
            state.showEmptyPrompt -> EmptyMessage(stringResource(R.string.contacts_discover_prompt))
            state.isNoResults -> EmptyMessage(stringResource(R.string.contacts_discover_no_results))
            else -> ResultList(
                header = stringResource(R.string.contacts_discover_suggestions_title)
                    .takeIf { state.isShowingSuggestions },
                rows = state.rows,
                pendingIds = state.pendingActionIds,
                onConnect = viewModel::connect,
                onAccept = viewModel::acceptReceived,
            )
        }
    }
}

@Composable
private fun ResultList(
    header: String?,
    rows: List<DiscoverRow>,
    pendingIds: Set<String>,
    onConnect: (String) -> Unit,
    onAccept: (String) -> Unit,
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(vertical = 8.dp),
    ) {
        header?.let {
            item(key = "__header__") {
                Text(
                    text = it,
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                )
            }
        }
        items(rows, key = { it.user.id }) { row ->
            ResultRow(
                row = row,
                pending = row.user.id in pendingIds,
                onConnect = { onConnect(row.user.id) },
                onAccept = { onAccept(row.user.id) },
            )
        }
    }
}

@Composable
private fun ResultRow(
    row: DiscoverRow,
    pending: Boolean,
    onConnect: () -> Unit,
    onAccept: () -> Unit,
) {
    val user = row.user
    val name = user.displayName?.takeIf { it.isNotBlank() } ?: user.username.ifBlank { "?" }
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        MeeshyAvatar(
            name = name,
            size = 44.dp,
            containerColor = hexColor(DynamicColorGenerator.colorForName(user.id.ifBlank { name })),
        )
        Spacer(Modifier.width(12.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = name,
                style = MaterialTheme.typography.bodyLarge,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            user.username.takeIf { it.isNotBlank() }?.let {
                Text(
                    text = "@$it",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        Spacer(Modifier.width(12.dp))
        ConnectControl(action = row.connect, pending = pending, onConnect = onConnect, onAccept = onAccept)
    }
}

@Composable
private fun ConnectControl(
    action: ConnectAction,
    pending: Boolean,
    onConnect: () -> Unit,
    onAccept: () -> Unit,
) {
    when (action) {
        is ConnectAction.Connect -> FilledTonalButton(onClick = onConnect, enabled = !pending) {
            Icon(Icons.Filled.PersonAdd, contentDescription = null, modifier = Modifier.width(18.dp))
            Spacer(Modifier.width(6.dp))
            Text(stringResource(R.string.contacts_discover_connect))
        }
        is ConnectAction.Accept -> FilledTonalButton(onClick = onAccept, enabled = !pending) {
            Text(stringResource(R.string.contacts_request_accept))
        }
        is ConnectAction.Pending -> OutlinedButton(onClick = {}, enabled = false) {
            Text(stringResource(R.string.contacts_discover_pending))
        }
        is ConnectAction.Contact -> Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(
                Icons.Filled.Check,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.width(18.dp),
            )
            Spacer(Modifier.width(4.dp))
            Text(
                text = stringResource(R.string.contacts_discover_contact),
                style = MaterialTheme.typography.labelLarge,
                color = MaterialTheme.colorScheme.primary,
            )
        }
        is ConnectAction.Blocked -> Text(
            text = stringResource(R.string.contacts_discover_blocked),
            style = MaterialTheme.typography.labelLarge,
            color = MaterialTheme.colorScheme.error,
        )
        is ConnectAction.Hidden -> Unit
    }
}

@Composable
private fun ErrorState(onRetry: () -> Unit) {
    Centered {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                text = stringResource(R.string.contacts_discover_error),
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.width(12.dp))
            OutlinedButton(onClick = onRetry) { Text(stringResource(R.string.contacts_list_retry)) }
        }
    }
}

@Composable
private fun EmptyMessage(message: String) {
    Centered {
        Text(
            text = message,
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(32.dp),
        )
    }
}

@Composable
private fun Centered(content: @Composable () -> Unit) {
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { content() }
}
