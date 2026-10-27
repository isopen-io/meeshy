package me.meeshy.app.chat

import android.net.Uri
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
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.TextButton
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.text.style.TextAlign
import me.meeshy.ui.theme.MeeshyRadius
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import me.meeshy.feature.chat.R
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.component.rememberPresence
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.hexColor

/**
 * "Share into Meeshy" target screen (feature-parity §O — text/URL lot 1, image/video lot 2).
 * Hosted by a thin `ShareTargetActivity` (`:app`, `ACTION_SEND` receiver) so this stays
 * coverage-exempt Compose glue: every rule it renders (picker filtering, send-once guard, error
 * surfacing) lives in the tested [ShareTargetViewModel]. Reading [sharedAttachmentUri]'s bytes is
 * the one piece of Android-framework glue that belongs here rather than the ViewModel — the exact
 * same [readPickedAttachment] helper the chat composer's own attachment picker uses, off the main
 * thread so a large shared video never blocks the screen from drawing.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ShareTargetScreen(
    sharedText: String,
    onFinished: () -> Unit,
    sharedAttachmentUri: Uri? = null,
    sharedAttachmentMimeType: String? = null,
    viewModel: ShareTargetViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val context = LocalContext.current

    LaunchedEffect(sharedText) { viewModel.load(sharedText) }
    LaunchedEffect(sharedAttachmentUri) {
        val uri = sharedAttachmentUri ?: return@LaunchedEffect
        val picked = withContext(Dispatchers.IO) { readPickedAttachment(context, uri) } ?: return@LaunchedEffect
        viewModel.loadAttachment(picked.bytes, picked.fileName, picked.mimeType ?: sharedAttachmentMimeType)
    }
    LaunchedEffect(state.isFinished) { if (state.isFinished) onFinished() }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.share_target_title)) },
                actions = {
                    TextButton(onClick = viewModel::dismiss) { Text(stringResource(R.string.share_target_cancel)) }
                },
            )
        },
    ) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding)) {
            when {
                state.isSessionLoading -> CenteredMessage(R.string.share_target_loading, showsProgress = true)
                state.isSignedOut -> CenteredMessage(R.string.share_target_signed_out)
                state.selectedTarget != null -> SharePreview(
                    state = state,
                    target = state.selectedTarget!!,
                    onCancel = viewModel::cancelSelection,
                    onSend = viewModel::confirmSend,
                )
                else -> ShareTargetPicker(state = state, viewModel = viewModel)
            }
        }
    }
}

/** Un message centré, avec la marge des bords que le texte nu n'avait pas (il touchait les deux côtés). */
@Composable
private fun CenteredMessage(message: Int, showsProgress: Boolean = false) {
    Box(
        modifier = Modifier.fillMaxSize().padding(horizontal = MeeshySpacing.xl),
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md)) {
            if (showsProgress) CircularProgressIndicator(strokeWidth = 2.dp, modifier = Modifier.size(24.dp))
            Text(
                text = stringResource(message),
                style = MaterialTheme.typography.bodyMedium,
                color = MeeshyTheme.tokens.textSecondary,
                textAlign = TextAlign.Center,
            )
        }
    }
}

@Composable
private fun ShareTargetPicker(state: ShareTargetUiState, viewModel: ShareTargetViewModel) {
    OutlinedTextField(
        value = state.query,
        onValueChange = viewModel::onQueryChange,
        singleLine = true,
        placeholder = { Text(stringResource(R.string.share_target_search_hint)) },
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.sm),
    )

    LazyColumn(modifier = Modifier.fillMaxWidth()) {
        items(state.targets, key = { it.conversationId }) { target ->
            ShareTargetRow(target = target, onTap = { viewModel.select(target.conversationId) })
        }
    }
}

/** Ce qui part et vers qui, avec Annuler et Envoyer : rien ne part avant ce second geste (iOS `ShareViewController`). */
@Composable
private fun SharePreview(
    state: ShareTargetUiState,
    target: ForwardTarget,
    onCancel: () -> Unit,
    onSend: () -> Unit,
) {
    val sending = state.sendingConversationId != null
    Column(
        modifier = Modifier.fillMaxSize().padding(MeeshySpacing.lg),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.lg),
    ) {
        ShareTargetRow(target = target, onTap = null)
        Text(
            text = stringResource(R.string.share_target_preview_title),
            style = MaterialTheme.typography.labelMedium,
            color = MeeshyTheme.tokens.textSecondary,
        )
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .background(MeeshyTheme.tokens.backgroundTertiary, RoundedCornerShape(MeeshyRadius.md))
                .padding(MeeshySpacing.md),
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
        ) {
            if (state.previewText.isNotEmpty()) {
                Text(
                    text = state.previewText,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MeeshyTheme.tokens.textPrimary,
                    maxLines = PREVIEW_MAX_LINES,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            state.previewAttachmentName?.let { name ->
                Text(
                    text = name,
                    style = MaterialTheme.typography.labelMedium,
                    color = MeeshyTheme.tokens.textSecondary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        state.errorMessage?.let {
            Text(text = it, style = MaterialTheme.typography.labelSmall, color = MeeshyPalette.Error)
        }
        Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md), modifier = Modifier.fillMaxWidth()) {
            OutlinedButton(onClick = onCancel, enabled = !sending, modifier = Modifier.weight(1f)) {
                Text(stringResource(R.string.share_target_cancel))
            }
            Button(onClick = onSend, enabled = !sending, modifier = Modifier.weight(1f)) {
                if (sending) {
                    CircularProgressIndicator(strokeWidth = 2.dp, modifier = Modifier.size(18.dp))
                } else {
                    Text(stringResource(R.string.share_target_send))
                }
            }
        }
    }
}

@Composable
private fun ShareTargetRow(target: ForwardTarget, onTap: (() -> Unit)?) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .then(if (onTap != null) Modifier.clickable(onClick = onTap) else Modifier)
            .padding(horizontal = if (onTap != null) MeeshySpacing.lg else 0.dp, vertical = MeeshySpacing.md),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        MeeshyAvatar(
            name = target.title,
            size = 40.dp,
            containerColor = hexColor(target.accentHex),
            imageUrl = target.avatar,
            presence = rememberPresence(target.peerUserId),
        )
        Text(
            text = target.title,
            style = MaterialTheme.typography.bodyLarge,
            color = MeeshyTheme.tokens.textPrimary,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f),
        )
    }
}

private const val PREVIEW_MAX_LINES = 8
