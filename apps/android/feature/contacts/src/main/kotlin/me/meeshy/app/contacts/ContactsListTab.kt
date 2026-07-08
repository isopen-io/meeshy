package me.meeshy.app.contacts

import androidx.annotation.StringRes
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Search
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.contacts.R
import me.meeshy.sdk.model.FriendRequestUser
import me.meeshy.sdk.model.friend.ContactFilter
import me.meeshy.sdk.model.friend.ContactFilterCounts
import me.meeshy.sdk.model.friend.presenceState
import me.meeshy.sdk.model.friend.resolvedName
import me.meeshy.sdk.theme.DynamicColorGenerator
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.component.meeshyPresenceDotColor
import me.meeshy.ui.theme.hexColor
import me.meeshy.ui.theme.MeeshyTheme

/**
 * The Contacts (all-friends) tab — the online-first friend list with a filter
 * row and search, driven by [ContactsListViewModel]. Cache-first: a skeleton
 * shows only on a cold empty load; a populated roster paints immediately.
 */
@Composable
fun ContactsListTab(
    viewModel: ContactsListViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    Column(modifier = Modifier.fillMaxSize()) {
        OutlinedTextField(
            value = state.query,
            onValueChange = viewModel::search,
            singleLine = true,
            leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
            placeholder = { Text(stringResource(R.string.contacts_search_hint)) },
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 8.dp),
        )
        FilterRow(selected = state.filter, counts = state.filterCounts, onSelect = viewModel::setFilter)

        when {
            state.showSkeleton -> Centered { CircularProgressIndicator() }
            state.errorMessage != null -> ErrorState(onRetry = viewModel::load)
            state.isEmpty -> EmptyMessage(stringResource(R.string.contacts_list_empty))
            state.isFilteredEmpty -> EmptyMessage(stringResource(R.string.contacts_list_filtered_empty))
            else -> FriendList(state.visibleFriends)
        }
    }
}

@Composable
private fun FilterRow(
    selected: ContactFilter,
    counts: ContactFilterCounts,
    onSelect: (ContactFilter) -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        SELECTABLE_FILTERS.forEach { filter ->
            val label = stringResource(filter.labelRes)
            val count = counts.forFilter(filter)
            FilterChip(
                selected = selected == filter,
                onClick = { onSelect(filter) },
                label = { Text("$label  $count") },
            )
        }
    }
}

@Composable
private fun FriendList(friends: List<FriendRequestUser>) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(vertical = 8.dp),
    ) {
        items(friends, key = { it.id }) { friend -> FriendRow(friend) }
    }
}

@Composable
private fun FriendRow(friend: FriendRequestUser) {
    val name = friend.resolvedName.ifBlank { friend.username.ifBlank { "?" } }
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        MeeshyAvatar(
            name = name,
            size = 44.dp,
            containerColor = hexColor(DynamicColorGenerator.colorForName(friend.id.ifBlank { name })),
        )
        Spacer(Modifier.width(12.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = name,
                style = MaterialTheme.typography.bodyLarge,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            friend.username.takeIf { it.isNotBlank() }?.let {
                Text(
                    text = "@$it",
                    style = MaterialTheme.typography.bodySmall,
                    color = MeeshyTheme.tokens.textSecondary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        meeshyPresenceDotColor(friend.presenceState(System.currentTimeMillis()))?.let { dot ->
            Surface(
                color = dot,
                shape = CircleShape,
                modifier = Modifier
                    .size(10.dp)
                    .clip(CircleShape),
            ) {}
        }
    }
}

@Composable
private fun ErrorState(onRetry: () -> Unit) {
    Centered {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                text = stringResource(R.string.contacts_list_error),
                style = MaterialTheme.typography.bodyLarge,
                color = MeeshyTheme.tokens.textSecondary,
            )
            Spacer(Modifier.width(12.dp))
            Button(onClick = onRetry) { Text(stringResource(R.string.contacts_list_retry)) }
        }
    }
}

@Composable
private fun EmptyMessage(message: String) {
    Centered {
        Text(
            text = message,
            style = MaterialTheme.typography.bodyLarge,
            color = MeeshyTheme.tokens.textSecondary,
            modifier = Modifier.padding(32.dp),
        )
    }
}

@Composable
private fun Centered(content: @Composable () -> Unit) {
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { content() }
}

private val SELECTABLE_FILTERS = listOf(ContactFilter.All, ContactFilter.Online, ContactFilter.Offline)

@get:StringRes
private val ContactFilter.labelRes: Int
    get() = when (this) {
        ContactFilter.All -> R.string.contacts_filter_all
        ContactFilter.Online -> R.string.contacts_filter_online
        ContactFilter.Offline -> R.string.contacts_filter_offline
        ContactFilter.Phonebook -> R.string.contacts_filter_all
        ContactFilter.Affiliates -> R.string.contacts_filter_all
    }
