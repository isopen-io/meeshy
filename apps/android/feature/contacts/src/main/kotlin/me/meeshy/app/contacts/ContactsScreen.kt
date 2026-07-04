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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.contacts.R
import me.meeshy.sdk.model.FriendRequest
import me.meeshy.sdk.model.FriendRequestUser
import me.meeshy.sdk.model.friend.resolvedName
import me.meeshy.sdk.theme.DynamicColorGenerator
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.theme.hexColor

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ContactsScreen(
    onBack: () -> Unit,
    viewModel: ContactsViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val tabs = ContactsTab.entries
    val selectedIndex = tabs.indexOf(state.selectedTab)

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.contacts_title)) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(
                            Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = stringResource(R.string.contacts_back),
                        )
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
            TabRow(selectedTabIndex = selectedIndex) {
                tabs.forEachIndexed { index, tab ->
                    val badge = if (tab == ContactsTab.Requests) state.receivedRequests.size else 0
                    Tab(
                        selected = index == selectedIndex,
                        onClick = { viewModel.selectTab(tab) },
                        text = {
                            if (badge > 0) {
                                BadgedBox(badge = { Badge { Text(badge.toString()) } }) {
                                    Text(stringResource(tab.labelRes))
                                }
                            } else {
                                Text(stringResource(tab.labelRes))
                            }
                        },
                    )
                }
            }
            when (state.selectedTab) {
                ContactsTab.Contacts -> ContactsListTab()
                ContactsTab.Requests -> RequestsTab(
                    state = state,
                    onAccept = viewModel::acceptRequest,
                    onDecline = viewModel::declineRequest,
                    onCancel = viewModel::cancelRequest,
                )
                ContactsTab.Discover -> DiscoverTab()
                else -> ComingSoon()
            }
        }
    }
}

@Composable
private fun RequestsTab(
    state: ContactsUiState,
    onAccept: (String) -> Unit,
    onDecline: (String) -> Unit,
    onCancel: (String) -> Unit,
) {
    if (state.isLoadingRequests) {
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            CircularProgressIndicator()
        }
        return
    }
    if (state.receivedRequests.isEmpty() && state.sentRequests.isEmpty()) {
        EmptyState(stringResource(R.string.contacts_requests_empty))
        return
    }
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(vertical = 8.dp),
    ) {
        if (state.receivedRequests.isNotEmpty()) {
            item { SectionHeader(stringResource(R.string.contacts_requests_received)) }
            items(state.receivedRequests, key = { "received-${it.id}" }) { request ->
                ReceivedRequestRow(
                    request = request,
                    pending = request.id in state.pendingActionIds,
                    onAccept = { onAccept(request.id) },
                    onDecline = { onDecline(request.id) },
                )
            }
        }
        if (state.sentRequests.isNotEmpty()) {
            item { SectionHeader(stringResource(R.string.contacts_requests_sent)) }
            items(state.sentRequests, key = { "sent-${it.id}" }) { request ->
                SentRequestRow(
                    request = request,
                    pending = request.id in state.pendingActionIds,
                    onCancel = { onCancel(request.id) },
                )
            }
        }
    }
}

@Composable
private fun ReceivedRequestRow(
    request: FriendRequest,
    pending: Boolean,
    onAccept: () -> Unit,
    onDecline: () -> Unit,
) {
    RequestRow(user = request.sender, userId = request.senderId) {
        OutlinedButton(onClick = onDecline, enabled = !pending) {
            Text(stringResource(R.string.contacts_request_decline))
        }
        Spacer(Modifier.width(8.dp))
        FilledTonalButton(onClick = onAccept, enabled = !pending) {
            Text(stringResource(R.string.contacts_request_accept))
        }
    }
}

@Composable
private fun SentRequestRow(
    request: FriendRequest,
    pending: Boolean,
    onCancel: () -> Unit,
) {
    RequestRow(user = request.receiver, userId = request.receiverId) {
        OutlinedButton(onClick = onCancel, enabled = !pending) {
            Text(stringResource(R.string.contacts_request_cancel))
        }
    }
}

@Composable
private fun RequestRow(
    user: FriendRequestUser?,
    userId: String,
    actions: @Composable () -> Unit,
) {
    val name = user.displayLabel()
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        MeeshyAvatar(
            name = name,
            size = 44.dp,
            containerColor = hexColor(DynamicColorGenerator.colorForName(userId.ifBlank { name })),
        )
        Spacer(Modifier.width(12.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = name,
                style = MaterialTheme.typography.bodyLarge,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            user?.username?.takeIf { it.isNotBlank() }?.let {
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
        Row(horizontalArrangement = Arrangement.End, verticalAlignment = Alignment.CenterVertically) {
            actions()
        }
    }
}

@Composable
private fun SectionHeader(text: String) {
    Text(
        text = text,
        style = MaterialTheme.typography.labelLarge,
        color = MaterialTheme.colorScheme.primary,
        modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
    )
}

@Composable
private fun EmptyState(message: String) {
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Text(
            text = message,
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(32.dp),
        )
    }
}

@Composable
private fun ComingSoon() {
    EmptyState(stringResource(R.string.contacts_coming_soon))
}

private fun FriendRequestUser?.displayLabel(): String =
    this?.resolvedName?.takeIf { it.isNotBlank() } ?: "?"

@get:StringRes
private val ContactsTab.labelRes: Int
    get() = when (this) {
        ContactsTab.Contacts -> R.string.contacts_tab_contacts
        ContactsTab.Requests -> R.string.contacts_tab_requests
        ContactsTab.Discover -> R.string.contacts_tab_discover
        ContactsTab.Blocked -> R.string.contacts_tab_blocked
    }
