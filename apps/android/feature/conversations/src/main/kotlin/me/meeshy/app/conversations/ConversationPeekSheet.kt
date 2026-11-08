package me.meeshy.app.conversations

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.conversations.R
import me.meeshy.sdk.model.conversationlist.ConversationPreviewPhase
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * **L'aperçu de conversation ouvert depuis la bannière de notification** (iOS `ConversationView(previewMode:)`
 * dans une feuille `.large/.medium`) : les derniers messages au Prisme du lecteur, un composeur simple, et
 * « ouvrir la conversation complète » qui FERME la feuille (c'est [onOpenFullConversation] qui diffère la
 * navigation de 100 ms côté hôte, pour qu'aucune course présentation/fermeture ne se joue).
 *
 * Publique : la bannière vit dans `:feature:notifications`, la feuille dans `:feature:conversations` et c'est
 * `:app` qui les marie (jamais feature -> feature).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ConversationPeekSheet(
    conversationId: String,
    onDismiss: () -> Unit,
    onOpenFullConversation: () -> Unit,
    modifier: Modifier = Modifier,
    accent: Color = MeeshyPalette.Indigo500,
    viewModel: ConversationPeekViewModel = hiltViewModel(),
) {
    LaunchedEffect(conversationId) { viewModel.open(conversationId) }
    val state by viewModel.state.collectAsStateWithLifecycle()
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        modifier = modifier,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = false),
        containerColor = MeeshyTheme.tokens.backgroundPrimary,
    ) {
        Column(Modifier.fillMaxWidth().heightIn(min = 320.dp).imePadding().navigationBarsPadding()) {
            Box(Modifier.weight(1f, fill = false).fillMaxWidth()) {
                PeekMessages(state, accent)
            }
            TextButton(onClick = onOpenFullConversation, modifier = Modifier.align(Alignment.CenterHorizontally)) {
                Text(stringResource(R.string.conversation_peek_open_full))
            }
            PeekComposer(
                state = state,
                accent = accent,
                onDraftChange = viewModel::onDraftChange,
                onSend = viewModel::send,
            )
        }
    }
}

@Composable
private fun PeekMessages(state: ConversationPeekUiState, accent: Color) {
    when (state.phase) {
        ConversationPreviewPhase.Loading -> Centered { CircularProgressIndicator(Modifier.padding(MeeshySpacing.lg)) }
        ConversationPreviewPhase.Empty -> Centered { PeekNote(stringResource(R.string.conversation_peek_empty)) }
        ConversationPreviewPhase.Unavailable -> Centered { PeekNote(stringResource(R.string.conversation_peek_unavailable)) }
        ConversationPreviewPhase.Sealed -> Centered { PeekNote(stringResource(R.string.conversation_peek_sealed)) }
        ConversationPreviewPhase.Loaded -> {
            val listState = rememberLazyListState()
            LaunchedEffect(state.lines.size) {
                if (state.lines.isNotEmpty()) listState.scrollToItem(state.lines.lastIndex)
            }
            LazyColumn(
                state = listState,
                modifier = Modifier.fillMaxWidth(),
                contentPadding = androidx.compose.foundation.layout.PaddingValues(MeeshySpacing.lg),
                verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
            ) {
                items(state.lines, key = { it.id }, contentType = { it.isMine }) { line -> PeekBubble(line, accent) }
            }
        }
    }
}

@Composable
private fun Centered(content: @Composable () -> Unit) {
    Box(Modifier.fillMaxWidth().heightIn(min = 160.dp), contentAlignment = Alignment.Center) { content() }
}

@Composable
private fun PeekNote(text: String) {
    Text(text, style = MaterialTheme.typography.bodyMedium, color = MeeshyTheme.tokens.textSecondary)
}

@Composable
private fun PeekBubble(line: PeekLine, accent: Color) {
    val tokens = MeeshyTheme.tokens
    Row(Modifier.fillMaxWidth(), horizontalArrangement = if (line.isMine) Arrangement.End else Arrangement.Start) {
        Column(
            Modifier
                .background(if (line.isMine) accent else tokens.backgroundSecondary, RoundedCornerShape(16.dp))
                .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.sm),
        ) {
            if (!line.isMine && line.senderName != null) {
                Text(line.senderName, style = MaterialTheme.typography.labelSmall, color = tokens.textSecondary)
            }
            Text(
                text = if (line.isSealed) stringResource(R.string.conversation_peek_sealed_message) else line.text,
                style = MaterialTheme.typography.bodyMedium,
                color = if (line.isMine) Color.White else tokens.textPrimary,
            )
        }
    }
}

@Composable
private fun PeekComposer(
    state: ConversationPeekUiState,
    accent: Color,
    onDraftChange: (String) -> Unit,
    onSend: () -> Unit,
) {
    Row(
        Modifier.fillMaxWidth().padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        OutlinedTextField(
            value = state.draft,
            onValueChange = onDraftChange,
            modifier = Modifier.weight(1f),
            enabled = !state.composerLocked,
            maxLines = 4,
            isError = state.sendFailed,
            placeholder = {
                Text(
                    stringResource(
                        if (state.composerLocked) R.string.conversation_peek_composer_locked else R.string.conversation_peek_placeholder,
                    ),
                )
            },
            shape = RoundedCornerShape(20.dp),
        )
        IconButton(onClick = onSend, enabled = state.canSend) {
            Icon(
                imageVector = MeeshyIcons.Send,
                contentDescription = stringResource(R.string.conversation_peek_send),
                tint = if (state.canSend) accent else MeeshyTheme.tokens.textSecondary,
            )
        }
    }
}
