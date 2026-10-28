package me.meeshy.app.chat

import android.content.Intent
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.model.share.ShareSubject
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyTheme

/**
 * **L'hôte d'application de la feuille de partage unique** (#13474, #13477) : la même feuille que la porte
 * « message » du fil, hors du fil. Une feuille (jamais un écran empilé) : (x) et Annuler en tête, glissé
 * vers le bas pour la fermer. [onOpenConversation] sert « Envoyé à X · Ouvrir ».
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AppShareSheetHost(
    subject: ShareSubject,
    onDismiss: () -> Unit,
    onOpenConversation: (conversationId: String) -> Unit,
    modifier: Modifier = Modifier,
    accentColor: Color = MeeshyPalette.Indigo500,
) {
    val viewModel: AppShareSheetViewModel = hiltViewModel()
    LaunchedEffect(subject) { viewModel.bind(subject) }
    DisposableEffect(viewModel) { onDispose { viewModel.reset() } }
    ShareSheetSurface(viewModel, onDismiss, onOpenConversation, accentColor, modifier)
}

/**
 * Le partage entrant (`ACTION_SEND` / `ACTION_SEND_MULTIPLE`, #13476) : [items] sont les fichiers déjà copiés
 * dans le cache privé, [text] le texte ou le lien joint, [notices] ce que le partage a laissé derrière lui (#13585).
 * Même feuille, mêmes destinataires, plusieurs en un envoi.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun IncomingShareSheetHost(
    text: String?,
    items: List<MediaUploadItem>,
    onDismiss: () -> Unit,
    onOpenConversation: (conversationId: String) -> Unit,
    modifier: Modifier = Modifier,
    accentColor: Color = MeeshyPalette.Indigo500,
    onEditInStudio: (() -> Unit)? = null,
    notices: List<String> = emptyList(),
) {
    val viewModel: AppShareSheetViewModel = hiltViewModel()
    LaunchedEffect(text, items, notices) { viewModel.bindIncoming(text, items, notices) }
    ShareSheetSurface(viewModel, onDismiss, onOpenConversation, accentColor, modifier, onEditInStudio)
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ShareSheetSurface(
    viewModel: AppShareSheetViewModel,
    onDismiss: () -> Unit,
    onOpenConversation: (String) -> Unit,
    accentColor: Color,
    modifier: Modifier,
    onEditInStudio: (() -> Unit)? = null,
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    if (state.subject == null) return
    val context = LocalContext.current
    val clipboard = LocalClipboardManager.current
    val model = remember(state) { viewModel.model(state) }
    val actions = remember(viewModel, onDismiss, onOpenConversation, onEditInStudio, context, clipboard) {
        ShareSheetActions(
            onQueryChange = viewModel::onQueryChange,
            onToggle = viewModel::toggle,
            onCaptionChange = viewModel::onCaptionChange,
            onDurationChange = viewModel::onDurationChange,
            onSend = viewModel::send,
            onDismiss = onDismiss,
            onOpenConversation = { id ->
                onOpenConversation(id)
                onDismiss()
            },
            onEditInStudio = onEditInStudio,
            onCopyLink = { link -> clipboard.setText(AnnotatedString(link)) },
            onShareOut = { text ->
                val send = Intent(Intent.ACTION_SEND).apply {
                    type = "text/plain"
                    putExtra(Intent.EXTRA_TEXT, text)
                }
                context.startActivity(Intent.createChooser(send, null).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            },
        )
    }
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = MeeshyTheme.tokens.backgroundPrimary,
        modifier = modifier,
    ) {
        ShareSheetBody(model, accentColor, actions, Modifier.navigationBarsPadding())
    }
}
