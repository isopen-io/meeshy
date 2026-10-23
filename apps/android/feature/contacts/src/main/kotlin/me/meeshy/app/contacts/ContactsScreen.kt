package me.meeshy.app.contacts

import androidx.annotation.StringRes
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.TextButton
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import me.meeshy.ui.component.ConnectionFeedbackHost
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
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.ui.graphics.Color
import me.meeshy.ui.component.chrome.MeeshyBackground
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
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
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.MeeshyPalette

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ContactsScreen(
    onBack: () -> Unit,
    initialTab: ContactsTab? = null,
    onOpenProfile: (userId: String) -> Unit = {},
    viewModel: ContactsViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    // Ouverture ciblee (Reglages -> Utilisateurs bloques) : selectionner l'onglet
    // demande UNE fois a l'entree, sans voler la main a la navigation interne.
    androidx.compose.runtime.LaunchedEffect(initialTab) {
        initialTab?.let(viewModel::selectTab)
    }
    val tabs = ContactsTab.entries
    val selectedIndex = tabs.indexOf(state.selectedTab)

    MeeshyBackground {
    Scaffold(
        containerColor = Color.Transparent,
        topBar = {
            TopAppBar(
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = Color.Transparent,
                    scrolledContainerColor = Color.Transparent,
                    titleContentColor = MeeshyTheme.tokens.textPrimary,
                    navigationIconContentColor = MeeshyTheme.tokens.textPrimary,
                ),
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
            TabRow(
                selectedTabIndex = selectedIndex,
                containerColor = Color.Transparent,
            ) {
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
                ContactsTab.Contacts -> ContactsListTab(onOpenProfile = onOpenProfile)
                ContactsTab.Requests -> RequestsTab(
                    state = state,
                    onAccept = viewModel::acceptRequest,
                    onDecline = viewModel::declineRequest,
                    onCancel = viewModel::cancelRequest,
                    onOpenProfile = onOpenProfile,
                )
                ContactsTab.Discover -> DiscoverTab(onOpenProfile = onOpenProfile)
                ContactsTab.Blocked -> BlockedTab(onOpenProfile = onOpenProfile)
            }
        }
    }
    ConnectionFeedbackHost(feedback = viewModel.feedback)
    }
}

@Composable
private fun RequestsTab(
    state: ContactsUiState,
    onAccept: (String) -> Unit,
    onDecline: (String) -> Unit,
    onCancel: (String) -> Unit,
    onOpenProfile: (String) -> Unit,
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
                    onOpenProfile = { onOpenProfile(request.senderId) },
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
                    onOpenProfile = { onOpenProfile(request.receiverId) },
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
    onOpenProfile: () -> Unit,
) {
    val name = request.sender.displayLabel()
    RequestRow(
        user = request.sender,
        userId = request.senderId,
        subtitle = request.personalMessage() ?: stringResource(R.string.contacts_requests_received_intent),
        onOpenProfile = onOpenProfile,
    ) {
        RoundAction(
            icon = Icons.Filled.Close,
            description = stringResource(R.string.contacts_requests_reject_a11y, name),
            container = MeeshyTheme.tokens.textSecondary.copy(alpha = 0.15f),
            tint = MeeshyTheme.tokens.textSecondary,
            enabled = !pending,
            onClick = onDecline,
        )
        Spacer(Modifier.width(8.dp))
        RoundAction(
            icon = Icons.Filled.Check,
            description = stringResource(R.string.contacts_requests_accept_a11y, name),
            container = MeeshyPalette.Success,
            tint = Color.White,
            enabled = !pending,
            onClick = onAccept,
        )
    }
}

@Composable
private fun SentRequestRow(
    request: FriendRequest,
    pending: Boolean,
    onCancel: () -> Unit,
    onOpenProfile: () -> Unit,
) {
    val name = request.receiver.displayLabel()
    val cancelDescription = stringResource(R.string.contacts_requests_cancel_a11y, name)
    RequestRow(user = request.receiver, userId = request.receiverId, subtitle = null, onOpenProfile = onOpenProfile) {
        Column(horizontalAlignment = Alignment.End) {
            Text(
                text = stringResource(R.string.contacts_discover_pending),
                style = MaterialTheme.typography.labelSmall,
                color = MeeshyPalette.Warning,
                modifier = Modifier
                    .clip(CircleShape)
                    .background(MeeshyPalette.Warning.copy(alpha = 0.15f))
                    .padding(horizontal = 8.dp, vertical = 2.dp),
            )
            TextButton(
                onClick = onCancel,
                enabled = !pending,
                modifier = Modifier.semantics { contentDescription = cancelDescription },
            ) {
                Text(stringResource(R.string.contacts_request_cancel), color = MeeshyPalette.Error)
            }
        }
    }
}

@Composable
private fun RoundAction(
    icon: ImageVector,
    description: String,
    container: Color,
    tint: Color,
    enabled: Boolean,
    onClick: () -> Unit,
) {
    IconButton(
        onClick = onClick,
        enabled = enabled,
        modifier = Modifier
            .size(44.dp)
            .clip(CircleShape)
            .background(container),
    ) {
        Icon(icon, contentDescription = description, tint = tint, modifier = Modifier.size(18.dp))
    }
}

@Composable
private fun RequestRow(
    user: FriendRequestUser?,
    userId: String,
    subtitle: String?,
    onOpenProfile: () -> Unit,
    actions: @Composable () -> Unit,
) {
    val name = user.displayLabel()
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(enabled = userId.isNotBlank(), onClick = onOpenProfile)
            .padding(horizontal = 16.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        MeeshyAvatar(
            name = name,
            size = 44.dp,
            containerColor = hexColor(DynamicColorGenerator.colorForName(userId.ifBlank { name })),
            imageUrl = user?.avatar,
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
                    color = MeeshyTheme.tokens.textSecondary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            subtitle?.let {
                Text(
                    text = it,
                    style = MaterialTheme.typography.bodySmall,
                    color = MeeshyTheme.tokens.textSecondary,
                    maxLines = 2,
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
        color = MeeshyPalette.Indigo500,
        modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
    )
}

@Composable
private fun EmptyState(message: String) {
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Text(
            text = message,
            style = MaterialTheme.typography.bodyLarge,
            color = MeeshyTheme.tokens.textSecondary,
            modifier = Modifier.padding(32.dp),
        )
    }
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
