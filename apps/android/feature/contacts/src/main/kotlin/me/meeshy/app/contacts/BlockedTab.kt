package me.meeshy.app.contacts

import androidx.compose.foundation.clickable
import kotlinx.coroutines.flow.map
import me.meeshy.ui.component.FeedbackKind
import me.meeshy.ui.component.FeedbackToastHost
import me.meeshy.ui.component.FeedbackToastRequest
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
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.contacts.R
import me.meeshy.sdk.model.friend.BlockedUser
import me.meeshy.sdk.model.friend.resolvedName
import me.meeshy.sdk.theme.DynamicColorGenerator
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.theme.hexColor
import me.meeshy.ui.theme.MeeshyTheme

/**
 * The Blocked tab — the blocklist with confirm-to-unblock, driven by
 * [BlockedListViewModel]. Cache-first: a skeleton shows only on a cold empty
 * load; a populated list paints immediately. Unblocking pops a confirm dialog,
 * then removes the row optimistically (the VM restores it on failure).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BlockedTab(
    onOpenProfile: (String) -> Unit = {},
    viewModel: BlockedListViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    var confirmTarget by remember { mutableStateOf<BlockedUser?>(null) }

    LaunchedEffect(Unit) { viewModel.load() }
    val toasts = remember(viewModel) {
        viewModel.feedback.map {
            when (it) {
                BlockedFeedback.Unblocked -> FeedbackToastRequest(R.string.contacts_blocked_unblock_success, FeedbackKind.Success)
                BlockedFeedback.UnblockFailed -> FeedbackToastRequest(R.string.contacts_blocked_unblock_error, FeedbackKind.Error)
            }
        }
    }

    Box(modifier = Modifier.fillMaxSize()) {
        PullToRefreshBox(
            isRefreshing = state.isRefreshing,
            onRefresh = viewModel::refresh,
            modifier = Modifier.fillMaxSize(),
        ) {
            when {
                state.showSkeleton -> Centered { CircularProgressIndicator() }
                state.errorMessage != null -> BlockedErrorState(onRetry = viewModel::load)
                state.isEmpty -> Centered {
                    Text(
                        text = stringResource(R.string.contacts_blocked_empty),
                        style = MaterialTheme.typography.bodyLarge,
                        color = MeeshyTheme.tokens.textSecondary,
                        modifier = Modifier.padding(32.dp),
                    )
                }
                else -> LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(vertical = 8.dp),
                ) {
                    items(state.blocked, key = { it.id }) { user ->
                        BlockedRow(
                            user = user,
                            pending = user.id in state.pendingIds,
                            onUnblock = { confirmTarget = user },
                            onOpenProfile = { onOpenProfile(user.id) },
                            modifier = Modifier.animateItem(),
                        )
                    }
                }
            }
        }
        FeedbackToastHost(toasts = toasts)
    }

    confirmTarget?.let { target ->
        val name = target.blockedDisplayName()
        AlertDialog(
            onDismissRequest = { confirmTarget = null },
            title = { Text(stringResource(R.string.contacts_blocked_unblock_title)) },
            text = { Text(stringResource(R.string.contacts_blocked_unblock_message, name)) },
            confirmButton = {
                TextButton(onClick = {
                    viewModel.unblock(target.id)
                    confirmTarget = null
                }) {
                    Text(stringResource(R.string.contacts_blocked_unblock_confirm))
                }
            },
            dismissButton = {
                TextButton(onClick = { confirmTarget = null }) {
                    Text(stringResource(R.string.contacts_blocked_unblock_cancel))
                }
            },
        )
    }
}

@Composable
private fun BlockedRow(
    user: BlockedUser,
    pending: Boolean,
    onUnblock: () -> Unit,
    onOpenProfile: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val name = user.blockedDisplayName()
    Row(
        modifier = modifier
            .fillMaxWidth()
            .clickable(enabled = user.id.isNotBlank(), onClick = onOpenProfile)
            .padding(horizontal = 16.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        MeeshyAvatar(
            name = name,
            size = 44.dp,
            containerColor = hexColor(DynamicColorGenerator.colorForName(user.id.ifBlank { name })),
            imageUrl = user.avatar,
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
                    color = MeeshyTheme.tokens.textSecondary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        Spacer(Modifier.width(12.dp))
        OutlinedButton(onClick = onUnblock, enabled = !pending) {
            Text(stringResource(R.string.contacts_blocked_unblock))
        }
    }
}

@Composable
private fun BlockedErrorState(onRetry: () -> Unit) {
    Centered {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                text = stringResource(R.string.contacts_blocked_error),
                style = MaterialTheme.typography.bodyLarge,
                color = MeeshyTheme.tokens.textSecondary,
            )
            Spacer(Modifier.width(12.dp))
            Button(onClick = onRetry) { Text(stringResource(R.string.contacts_list_retry)) }
        }
    }
}

@Composable
private fun Centered(content: @Composable () -> Unit) {
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { content() }
}

private fun BlockedUser.blockedDisplayName(): String =
    resolvedName.ifBlank { username.ifBlank { "?" } }
