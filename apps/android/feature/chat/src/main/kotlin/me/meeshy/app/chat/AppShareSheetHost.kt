package me.meeshy.app.chat

import android.content.Context
import android.widget.Toast
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.delay
import me.meeshy.app.chat.share.ShareSheetEffect
import me.meeshy.app.chat.share.ShareSheetHostCallbacks
import me.meeshy.app.chat.share.ShareSheetScreen
import me.meeshy.app.chat.share.ShareSheetViewModel
import me.meeshy.app.chat.share.ShareThumbnailDecoder
import me.meeshy.app.chat.share.ShareThumbnailLoader
import me.meeshy.app.chat.share.ShareToastViewModel
import me.meeshy.app.chat.share.commands
import me.meeshy.feature.chat.R
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.model.share.ShareMedia
import me.meeshy.sdk.model.share.SharePieceKind
import me.meeshy.sdk.model.share.ShareRequest
import me.meeshy.sdk.model.share.ShareSubject
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyTheme

/**
 * **L'hôte d'application de la feuille de partage unique** (#13474, #13477, #15688) : la même feuille que la
 * porte « message » du fil, hors du fil. Une feuille (jamais un écran empilé) : Annuler en tête, glissé vers le
 * bas pour la fermer. [onOpenConversation] sert « Envoyé à X · Ouvrir ».
 */
@Composable
fun AppShareSheetHost(
    subject: ShareSubject,
    onDismiss: () -> Unit,
    onOpenConversation: (conversationId: String) -> Unit,
    modifier: Modifier = Modifier,
    accentColor: Color = MeeshyPalette.Indigo500,
) {
    val viewModel: ShareSheetViewModel = hiltViewModel()
    LaunchedEffect(subject) { viewModel.bind(ShareRequest.of(subject)) }
    DisposableEffect(viewModel) { onDispose { viewModel.reset() } }
    ShareSheetSurface(viewModel, onDismiss, onOpenConversation, accentColor, modifier, announce = null)
}

/**
 * Le partage entrant (`ACTION_SEND` / `ACTION_SEND_MULTIPLE`, #13476) : [items] sont les fichiers déjà copiés
 * dans le cache privé, [text] le texte ou le lien joint, [notices] ce que le partage a laissé derrière lui (#13585).
 * Même feuille, mêmes destinataires, plusieurs en un envoi. [announce] dit « Envoyé à X » quand l'hôte n'a pas la
 * pile de toasts de l'application (l'activité de partage se ferme).
 */
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
    announce: ((Context, String) -> Unit)? = { context, message -> Toast.makeText(context, message, Toast.LENGTH_SHORT).show() },
    /** Un envoi a été tenté depuis la feuille : l'hôte ne doit plus effacer les copies qu'il a préparées (Annuler n'a plus de sens). */
    onSendAttempted: () -> Unit = {},
) {
    val viewModel: ShareSheetViewModel = hiltViewModel()
    LaunchedEffect(text, items, notices) { viewModel.bindIncoming(text, items, notices) }
    ShareSheetSurface(viewModel, onDismiss, onOpenConversation, accentColor, modifier, onEditInStudio, announce, onSendAttempted)
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ShareSheetSurface(
    viewModel: ShareSheetViewModel,
    onDismiss: () -> Unit,
    onOpenConversation: (String) -> Unit,
    accentColor: Color,
    modifier: Modifier,
    onEditInStudio: (() -> Unit)? = null,
    announce: ((Context, String) -> Unit)?,
    onSendAttempted: () -> Unit = {},
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val sendAttempted = state.sheet.isSending || state.sheet.hasSent
    LaunchedEffect(sendAttempted) { if (sendAttempted) onSendAttempted() }
    val toasts: ShareToastViewModel = hiltViewModel()
    val context = LocalContext.current
    val haptics = rememberMeeshyHaptics()
    val dismiss by rememberUpdatedState(onDismiss)
    val sentTo = state.sheet.firstServed
    val sentMessage = sentTo?.let { context.getString(R.string.share_toast_sent_to, it.recipient.title) }
    val toastMessage by rememberUpdatedState(sentMessage)
    val servedConversationId by rememberUpdatedState(sentTo?.conversationId)
    LaunchedEffect(viewModel) {
        viewModel.effects.collect { effect ->
            when (effect) {
                ShareSheetEffect.AutoClose -> {
                    haptics.success()
                    delay(ShareSheetEffect.AUTO_CLOSE_DELAY_MILLIS)
                    toastMessage?.let { message ->
                        val open = servedConversationId?.let { id -> { onOpenConversation(id) } }
                        if (announce != null) announce(context, message) else toasts.announce(message, open)
                    }
                    dismiss()
                }
            }
        }
    }
    if (state.subject == null) return
    val commands = remember(viewModel) { viewModel.commands() }
    val host = remember(onDismiss, onEditInStudio) { ShareSheetHostCallbacks(onDismiss = onDismiss, onEditInStudio = onEditInStudio) }
    val loader = remember(viewModel) { thumbnailLoaderOf(viewModel) }
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = MeeshyTheme.tokens.backgroundPrimary,
        modifier = modifier,
    ) {
        ShareSheetScreen(state, accentColor, commands, host, loader, Modifier.navigationBarsPadding())
    }
}

private fun thumbnailLoaderOf(viewModel: ShareSheetViewModel): ShareThumbnailLoader = { media: ShareMedia, maxPixels: Int ->
    viewModel.thumbnailFile(media)?.let { file -> ShareThumbnailDecoder.load(file, SharePieceKind.of(media.mimeType), maxPixels) }
}
