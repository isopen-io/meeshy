package me.meeshy.app.notifications

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
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
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.notifications.R
import me.meeshy.sdk.model.ApiNotification
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.component.chrome.MeeshyBackground
import me.meeshy.ui.format.shortDateTimeLabel
import me.meeshy.ui.component.chrome.MeeshyTopBar
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NotificationsScreen(
    viewModel: NotificationsViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }

    LaunchedEffect(state.errorMessage) {
        state.errorMessage?.let { snackbar.showSnackbar(it) }
    }

    MeeshyBackground {
        Scaffold(
            topBar = {
                MeeshyTopBar(
                    title = stringResource(R.string.notifications_title),
                    actions = {
                        if (state.notifications.any { !it.state.isRead }) {
                            TextButton(onClick = viewModel::markAllRead) {
                                Text(stringResource(R.string.notifications_mark_all_read))
                            }
                        }
                    },
                )
            },
            snackbarHost = { SnackbarHost(snackbar) },
            containerColor = Color.Transparent,
        ) { padding ->
            PullToRefreshBox(
                isRefreshing = state.isSyncing,
                onRefresh = viewModel::load,
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding),
            ) {
                when {
                    state.isLoading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator(color = MeeshyPalette.Indigo500)
                    }
                    state.notifications.isEmpty() -> Box(
                        Modifier.fillMaxSize(),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(
                            text = stringResource(R.string.notifications_empty),
                            style = MaterialTheme.typography.bodyLarge,
                            color = MeeshyTheme.tokens.textSecondary,
                        )
                    }
                    else -> LazyColumn {
                        items(state.notifications, key = { it.id }) { notification ->
                            NotificationItem(
                                notification = notification,
                                onTap = { viewModel.markAsRead(notification.id) },
                            )
                            HorizontalDivider(color = MeeshyTheme.tokens.inputBorder.copy(alpha = 0.4f))
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun NotificationItem(
    notification: ApiNotification,
    onTap: () -> Unit,
) {
    val isUnread = !notification.state.isRead
    Surface(
        onClick = onTap,
        color = if (isUnread) MeeshyPalette.Indigo500.copy(alpha = 0.12f) else Color.Transparent,
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.md),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            MeeshyAvatar(
                name = notification.actor?.displayName ?: notification.actor?.username ?: "?",
                modifier = Modifier.size(44.dp),
            )
            Spacer(Modifier.width(MeeshySpacing.md))
            Column(modifier = Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = notification.actor?.displayName ?: notification.actor?.username
                            ?: stringResource(R.string.notifications_system_sender),
                        style = MaterialTheme.typography.labelMedium,
                        color = MeeshyTheme.tokens.textPrimary,
                        fontWeight = if (isUnread) FontWeight.SemiBold else FontWeight.Normal,
                    )
                    if (isUnread) {
                        Spacer(Modifier.width(MeeshySpacing.sm))
                        Box(
                            Modifier
                                .size(8.dp)
                                .clip(CircleShape)
                                .background(MeeshyPalette.Indigo500),
                        )
                    }
                }
                notification.content?.let {
                    Text(
                        text = it,
                        style = MaterialTheme.typography.bodySmall,
                        color = MeeshyTheme.tokens.textSecondary,
                    )
                }
                Text(
                    text = shortDateTimeLabel(notification.state.createdAt),
                    style = MaterialTheme.typography.labelSmall,
                    color = MeeshyTheme.tokens.textMuted,
                )
            }
        }
    }
}
