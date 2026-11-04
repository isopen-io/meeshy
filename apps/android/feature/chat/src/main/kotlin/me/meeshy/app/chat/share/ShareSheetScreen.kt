package me.meeshy.app.chat.share

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import me.meeshy.feature.chat.R
import me.meeshy.sdk.model.PublicationTarget
import me.meeshy.sdk.model.share.ShareActionPresentation
import me.meeshy.sdk.model.share.ShareHostCapabilities
import me.meeshy.sdk.model.share.ShareRecipient
import me.meeshy.sdk.model.share.ShareRecipientDirectory
import me.meeshy.sdk.model.share.ShareRecipientsZoneState
import me.meeshy.sdk.model.share.ShareSubject
import me.meeshy.sdk.model.share.ShareTitle
import me.meeshy.sdk.model.share.ShareTool
import me.meeshy.sdk.model.share.ShareWithdrawReason
import me.meeshy.ui.component.LocalPresenceStore
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/** Les gestes de l'écran, posés par [ShareSheetViewModel.commands] : la vue ne connaît que ces lambdas. */
internal data class ShareSheetCommands(
    val onQueryChange: (String) -> Unit,
    val onToggle: (ShareRecipient) -> Unit,
    val onRetry: (ShareRecipient) -> Unit,
    val onRetryAll: () -> Unit,
    val onRemoveMessage: (String) -> Unit,
    val onWidenToWholeMessage: () -> Unit,
    val onTrimOverflow: () -> Unit,
    val onRemoveIncoming: (String) -> Unit,
    val onMoveIncoming: (String, Int) -> Unit,
    val onCaptionChange: (String) -> Unit,
    val onGroupingChange: (me.meeshy.sdk.model.share.ShareGrouping) -> Unit,
    val onSend: () -> Unit,
)

internal fun ShareSheetViewModel.commands() = ShareSheetCommands(
    onQueryChange = this::onQueryChange,
    onToggle = this::toggle,
    onRetry = this::retry,
    onRetryAll = this::retryAll,
    onRemoveMessage = this::removeMessage,
    onWidenToWholeMessage = this::widenToWholeMessage,
    onTrimOverflow = this::trimOverflow,
    onRemoveIncoming = this::removeIncoming,
    onMoveIncoming = this::moveIncoming,
    onCaptionChange = this::onCaptionChange,
    onGroupingChange = this::onGroupingChange,
    onSend = { send() },
)

/** Ce que l'hôte branche sur l'écran : un contrôle sans hôte n'est pas rendu (loi 4 : un contrôle existe s'il a un effet). */
internal data class ShareSheetHostCallbacks(
    val onDismiss: () -> Unit,
    /** « Modifier dans le studio » ; absent, rien n'est offert. */
    val onEditInStudio: (() -> Unit)? = null,
)

/**
 * **L'écran de partage unique** (iOS `ShareSheetView`) : quatre zones toujours dans cet ordre — ce qui part,
 * ce qu'on peut en faire, à qui, puis la barre Envoyer fixe en bas. Chemin nominal en deux gestes : un récent,
 * puis Envoyer. Quand tout ce qui part est protégé, une carte motivée remplace les zones. « Annuler » devient
 * « Fermer » dès qu'une rangée est partie ; « Tout réessayer » n'apparaît qu'avec un échec. Sans état : l'accent
 * est un paramètre, la fermeture automatique et le toast sont l'affaire de l'hôte ([ShareSheetEffect]).
 */
@Composable
internal fun ShareSheetScreen(
    state: ShareSheetUiState,
    accentColor: Color,
    commands: ShareSheetCommands,
    host: ShareSheetHostCallbacks,
    thumbnailLoader: ShareThumbnailLoader,
    modifier: Modifier = Modifier,
) {
    val plan = state.plan
    val blocked = state.blocked
    Column(modifier.fillMaxWidth()) {
        ShareSheetTopBar(state, plan?.title ?: ShareTitle.SEND, accentColor, commands.onRetryAll, host.onDismiss)
        when {
            state.isSessionLoading -> CenteredNote(loading = true, text = stringResource(R.string.share_target_loading))
            state.isSignedOut -> CenteredNote(loading = false, text = stringResource(R.string.share_target_signed_out))
            plan == null -> Unit
            blocked != null -> ShareBlockedCard(blocked, accentColor, host.onDismiss)
            else -> ShareSheetZones(state, accentColor, commands, host, thumbnailLoader)
        }
    }
}

@Composable
private fun ColumnScope.ShareSheetZones(
    state: ShareSheetUiState,
    accentColor: Color,
    commands: ShareSheetCommands,
    host: ShareSheetHostCallbacks,
    thumbnailLoader: ShareThumbnailLoader,
) {
    val subject = state.subject ?: return
    val plan = state.plan ?: return
    val context = LocalContext.current
    val presence = LocalPresenceStore.current
    val link = remember(subject) { linkOf(subject) }
    val text = remember(subject) { subject.composedText("") }
    val presentation = remember(plan, host.onEditInStudio, link, text) {
        ShareActionPresentation.of(
            plan = plan,
            servedPublications = emptyList<PublicationTarget>(),
            studioAvailable = host.onEditInStudio != null,
            host = ShareHostCapabilities(hasUrl = link != null, hasText = text != null),
        )
    }
    val zone = remember(state.conversations, state.people, state.sheet.query, state.sheet.selection, state.isLoading, subject) {
        ShareRecipientsZoneState.of(
            view = ShareRecipientDirectory.view(
                conversations = state.conversations,
                people = state.people,
                communities = emptyList(),
                query = state.sheet.query,
                found = null,
                sourceConversationId = subject.sourceConversationId,
            ),
            cacheEmpty = state.conversations.isEmpty() && state.people.isEmpty(),
            loading = state.isLoading,
            found = null,
            selection = state.sheet.selection,
            groupCreationSupported = false,
            channels = emptyMap(),
        )
    }
    Column(Modifier.weight(1f, fill = false).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md)) {
        state.notices.forEach { notice ->
            Row(Modifier.padding(horizontal = MeeshySpacing.lg), horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
                Icon(MeeshyIcons.Error, contentDescription = null, tint = MeeshyTheme.tokens.textMuted, modifier = Modifier.size(16.dp))
                Text(notice, style = MaterialTheme.typography.bodySmall, color = MeeshyTheme.tokens.textMuted)
            }
        }
        ShareContentZone(
            subject = subject,
            removedMessageIds = state.sheet.removedMessageIds,
            plan = plan,
            accentColor = accentColor,
            thumbnailLoader = thumbnailLoader,
            actions = ShareContentZoneActions(
                onRemoveMessage = commands.onRemoveMessage,
                onWidenToWholeMessage = commands.onWidenToWholeMessage,
                onTrimOverflow = commands.onTrimOverflow,
                onCopyLink = { ShareHostActions.copy(context, it) },
                strip = ShareIncomingStripActions(onRemove = commands.onRemoveIncoming, onMove = commands.onMoveIncoming),
            ),
        )
        ShareActionsZone(
            presentation = presentation,
            snapshot = ShareActionsZoneSnapshot(hasSent = state.sheet.hasSent),
            accentColor = accentColor,
            actions = ShareActionsZoneActions(
                onTogglePublication = {},
                onStudio = { host.onEditInStudio?.invoke() },
                onTool = { tool ->
                    when (tool) {
                        ShareTool.COPY_LINK -> ShareHostActions.copy(context, link)
                        ShareTool.COPY_TEXT -> ShareHostActions.copy(context, text)
                        ShareTool.SHARE_OUT -> ShareHostActions.shareOut(context, link ?: text)
                        ShareTool.SAVE, ShareTool.IMAGER -> Unit
                    }
                },
            ),
        )
        OutlinedTextField(
            value = state.sheet.query,
            onValueChange = commands.onQueryChange,
            singleLine = true,
            leadingIcon = { Icon(MeeshyIcons.Search, contentDescription = null) },
            placeholder = { Text(stringResource(R.string.share_search_hint)) },
            colors = OutlinedTextFieldDefaults.colors(focusedBorderColor = accentColor, cursorColor = accentColor),
            modifier = Modifier.fillMaxWidth().padding(horizontal = MeeshySpacing.lg),
        )
        ShareRecipientsZone(
            state = zone,
            snapshot = ShareRecipientsZoneSnapshot(
                selectedIds = state.sheet.selection.map { it.id }.toSet(),
                deliveries = state.sheet.deliveries,
                presenceOf = { id -> presence?.currentStateOf(id) },
            ),
            accentColor = accentColor,
            actions = ShareRecipientsZoneActions(
                onToggle = commands.onToggle,
                onRetry = commands.onRetry,
                onCreatesGroupChange = {},
                onToggleCommunity = {},
            ),
        )
    }
    state.sendBar?.let { bar ->
        ShareSendBar(
            state = bar,
            input = ShareSendBarInput(state.sheet.caption, state.sheet.grouping),
            accentColor = accentColor,
            actions = ShareSendBarActions(commands.onCaptionChange, commands.onGroupingChange, commands.onSend),
        )
    }
}

private fun linkOf(subject: ShareSubject): String? = when (subject) {
    is ShareSubject.Card -> subject.card.url
    is ShareSubject.Link -> subject.url
    is ShareSubject.Incoming -> subject.text?.trim()?.takeIf { subject.isLink }
    else -> null
}

/** Annuler (devenu Fermer dès qu'une rangée est partie) · titre selon la source · Tout réessayer. */
@Composable
private fun ShareSheetTopBar(state: ShareSheetUiState, title: ShareTitle, accentColor: Color, onRetryAll: () -> Unit, onDismiss: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().padding(horizontal = MeeshySpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        TextButton(onClick = onDismiss, modifier = Modifier.weight(1f, fill = false)) {
            Text(
                stringResource(if (state.closeReplacesCancel) R.string.share_close else R.string.common_cancel),
                color = MeeshyTheme.tokens.textSecondary,
            )
        }
        Text(
            text = stringResource(if (title == ShareTitle.SEND) R.string.share_title_send else R.string.share_title_forward),
            style = MaterialTheme.typography.titleMedium,
            color = MeeshyTheme.tokens.textPrimary,
            textAlign = TextAlign.Center,
            modifier = Modifier.weight(2f).semantics { heading() },
        )
        Box(Modifier.weight(1f, fill = false), contentAlignment = Alignment.CenterEnd) {
            if (state.offersRetryAll) {
                TextButton(onClick = onRetryAll) { Text(stringResource(R.string.share_status_retry_all), color = accentColor) }
            }
        }
    }
}

/** « Ce message ne sort pas de Meeshy » : tout ce qui est choisi est protégé — la carte dit pourquoi et rend la main. */
@Composable
internal fun ShareBlockedCard(reason: ShareWithdrawReason, accentColor: Color, onDismiss: () -> Unit) {
    Column(
        Modifier.fillMaxWidth().padding(MeeshySpacing.xl),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        Icon(MeeshyIcons.Lock, contentDescription = null, tint = accentColor, modifier = Modifier.size(48.dp))
        Text(
            stringResource(R.string.share_blocked_title),
            style = MaterialTheme.typography.titleMedium,
            color = MeeshyTheme.tokens.textPrimary,
            textAlign = TextAlign.Center,
            modifier = Modifier.semantics { heading() },
        )
        Text(
            stringResource(
                when (reason) {
                    ShareWithdrawReason.VIEW_ONCE -> R.string.share_blocked_view_once
                    ShareWithdrawReason.AFTER_READ -> R.string.share_blocked_after_read
                    ShareWithdrawReason.UNAVAILABLE -> R.string.share_blocked_unavailable
                },
            ),
            style = MaterialTheme.typography.bodyMedium,
            color = MeeshyTheme.tokens.textSecondary,
            textAlign = TextAlign.Center,
        )
        TextButton(onClick = onDismiss) { Text(stringResource(R.string.share_blocked_understood), color = accentColor) }
    }
}

@Composable
private fun CenteredNote(loading: Boolean, text: String) {
    Box(Modifier.fillMaxWidth().padding(MeeshySpacing.xl), contentAlignment = Alignment.Center) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md)) {
            if (loading) CircularProgressIndicator(strokeWidth = 2.dp, modifier = Modifier.size(24.dp))
            Text(text, color = MeeshyTheme.tokens.textSecondary, textAlign = TextAlign.Center)
        }
    }
}
