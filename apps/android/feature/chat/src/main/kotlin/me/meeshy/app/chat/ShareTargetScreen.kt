package me.meeshy.app.chat

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
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
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
import me.meeshy.feature.chat.R
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.hexColor

/**
 * "Share into Meeshy" target screen (feature-parity §O, lot 1 — text/URL). Hosted by a thin
 * `ShareTargetActivity` (`:app`, `ACTION_SEND` receiver) so this stays coverage-exempt Compose
 * glue: every rule it renders (picker filtering, send-once guard, error surfacing) lives in the
 * tested [ShareTargetViewModel].
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ShareTargetScreen(
    sharedText: String,
    onFinished: () -> Unit,
    viewModel: ShareTargetViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    LaunchedEffect(sharedText) { viewModel.load(sharedText) }
    LaunchedEffect(state.isFinished) { if (state.isFinished) onFinished() }

    Scaffold(
        topBar = { TopAppBar(title = { Text(stringResource(R.string.share_target_title)) }) },
    ) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding)) {
            if (state.isSignedOut) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text(
                        text = stringResource(R.string.share_target_signed_out),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MeeshyTheme.tokens.textSecondary,
                    )
                }
                return@Scaffold
            }

            OutlinedTextField(
                value = state.query,
                onValueChange = viewModel::onQueryChange,
                singleLine = true,
                placeholder = { Text(stringResource(R.string.share_target_search_hint)) },
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.sm),
            )

            if (state.errorMessage != null) {
                Text(
                    text = state.errorMessage.orEmpty(),
                    style = MaterialTheme.typography.labelSmall,
                    color = MeeshyPalette.Error,
                    modifier = Modifier.padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.xs),
                )
            }

            LazyColumn(modifier = Modifier.fillMaxWidth()) {
                items(state.targets, key = { it.conversationId }) { target ->
                    ShareTargetRow(
                        target = target,
                        isSending = state.sendingConversationId == target.conversationId,
                        isSent = target.conversationId in state.sentConversationIds,
                        onTap = { viewModel.sendTo(target.conversationId) },
                    )
                }
            }
        }
    }
}

@Composable
private fun ShareTargetRow(
    target: ForwardTarget,
    isSending: Boolean,
    isSent: Boolean,
    onTap: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.md),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        MeeshyAvatar(name = target.title, size = 40.dp, containerColor = hexColor(target.accentHex))

        Text(
            text = target.title,
            style = MaterialTheme.typography.bodyLarge,
            color = MeeshyTheme.tokens.textPrimary,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f),
        )

        when {
            isSent -> Text(
                text = stringResource(R.string.share_target_sent),
                style = MaterialTheme.typography.labelMedium,
                color = MeeshyTheme.tokens.textSecondary,
            )
            isSending -> CircularProgressIndicator(strokeWidth = 2.dp, modifier = Modifier.size(20.dp))
            else -> Button(onClick = onTap) { Text(stringResource(R.string.share_target_send)) }
        }
    }
}
