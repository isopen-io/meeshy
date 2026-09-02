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
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Link
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.conversations.R
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.theme.accentColorPalette
import me.meeshy.sdk.theme.displayTitle
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.component.chrome.MeeshyBackground
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.hexColor

/**
 * The conversation picker that launches the existing share-link creation flow
 * (parity iOS: the "create a share link" affordance is always visible in the
 * header — this screen carries the "no eligible conversation" case as an empty
 * state with a real CTA, rather than the header button disappearing on an
 * invisible calculation).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ShareLinkPickerScreen(
    onBack: () -> Unit,
    onSelectConversation: (String) -> Unit,
    onNewConversation: () -> Unit,
    viewModel: ShareLinkPickerViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

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
                    title = { Text(stringResource(R.string.share_link_picker_title)) },
                    navigationIcon = {
                        IconButton(onClick = onBack) {
                            Icon(
                                Icons.AutoMirrored.Filled.ArrowBack,
                                contentDescription = stringResource(R.string.share_link_picker_back),
                            )
                        }
                    },
                )
            },
        ) { padding ->
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding),
            ) {
                when {
                    state.isLoading -> CircularProgressIndicator(
                        modifier = Modifier.align(Alignment.Center),
                        color = MeeshyPalette.Indigo500,
                    )

                    state.errorMessage != null && state.eligibleConversations.isEmpty() ->
                        ShareLinkPickerErrorState(onRetry = viewModel::retry)

                    state.eligibleConversations.isEmpty() ->
                        ShareLinkPickerEmptyState(onNewConversation = onNewConversation)

                    else -> ShareLinkPickerList(
                        conversations = state.eligibleConversations,
                        currentUserId = state.currentUserId,
                        onSelectConversation = onSelectConversation,
                    )
                }
            }
        }
    }
}

@Composable
private fun ShareLinkPickerEmptyState(onNewConversation: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(MeeshySpacing.xl),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Box(
            modifier = Modifier
                .size(56.dp)
                .background(MeeshyPalette.Indigo500.copy(alpha = 0.12f), CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = Icons.Filled.Link,
                contentDescription = null,
                tint = MeeshyPalette.Indigo500,
                modifier = Modifier.size(28.dp),
            )
        }
        Text(
            text = stringResource(R.string.share_link_picker_empty_title),
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
            color = MeeshyTheme.tokens.textPrimary,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(top = MeeshySpacing.lg),
        )
        Text(
            text = stringResource(R.string.share_link_picker_empty_body),
            style = MaterialTheme.typography.bodyMedium,
            color = MeeshyTheme.tokens.textSecondary,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(top = MeeshySpacing.sm),
        )
        Button(onClick = onNewConversation, modifier = Modifier.padding(top = MeeshySpacing.lg)) {
            Icon(Icons.Filled.Add, contentDescription = null, modifier = Modifier.size(18.dp))
            Text(
                text = stringResource(R.string.share_link_picker_empty_cta),
                modifier = Modifier.padding(start = MeeshySpacing.xs),
            )
        }
    }
}

@Composable
private fun ShareLinkPickerErrorState(onRetry: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(MeeshySpacing.xl),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(
            text = stringResource(R.string.conversations_error_title),
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
            color = MeeshyTheme.tokens.textPrimary,
            textAlign = TextAlign.Center,
        )
        Text(
            text = stringResource(R.string.conversations_error_subtitle),
            style = MaterialTheme.typography.bodyMedium,
            color = MeeshyTheme.tokens.textSecondary,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(top = MeeshySpacing.sm),
        )
        Button(onClick = onRetry, modifier = Modifier.padding(top = MeeshySpacing.lg)) {
            Text(text = stringResource(R.string.conversations_retry))
        }
    }
}

@Composable
private fun ShareLinkPickerList(
    conversations: List<ApiConversation>,
    currentUserId: String?,
    onSelectConversation: (String) -> Unit,
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(MeeshySpacing.lg),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        items(conversations, key = { it.id }) { conversation ->
            ShareLinkPickerRow(
                conversation = conversation,
                currentUserId = currentUserId,
                onClick = { onSelectConversation(conversation.id) },
            )
        }
    }
}

@Composable
private fun ShareLinkPickerRow(
    conversation: ApiConversation,
    currentUserId: String?,
    onClick: () -> Unit,
) {
    val title = conversation.displayTitle(currentUserId)
    val primaryAccent = hexColor(conversation.accentColorPalette().primary)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(vertical = MeeshySpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        MeeshyAvatar(name = title, containerColor = primaryAccent)
        Column(modifier = Modifier.padding(start = MeeshySpacing.md)) {
            Text(
                text = title,
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
                color = MeeshyTheme.tokens.textPrimary,
                maxLines = 1,
            )
            Text(
                text = stringResource(R.string.global_search_members, conversation.memberCount),
                style = MaterialTheme.typography.labelSmall,
                color = MeeshyTheme.tokens.textSecondary,
            )
        }
    }
}
