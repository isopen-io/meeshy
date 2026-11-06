package me.meeshy.app.chat.export

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.hapticfeedback.HapticFeedback
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import kotlinx.coroutines.launch
import me.meeshy.feature.chat.R
import me.meeshy.sdk.model.PermissionNature
import me.meeshy.sdk.model.card.PostCommentCardSubject
import me.meeshy.ui.component.LocalMediaBaseUrl
import me.meeshy.ui.component.bubble.BubbleContent
import me.meeshy.ui.component.export.ExportAnnouncement
import me.meeshy.ui.component.export.ExportAnnouncer
import me.meeshy.ui.component.export.ExportAnnouncerHost
import me.meeshy.ui.component.export.rememberExportAnnouncer
import me.meeshy.ui.component.permission.PermissionFlow
import me.meeshy.ui.component.permission.PermissionFlowHost
import me.meeshy.ui.component.permission.rememberPermissionFlow
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * « IMAGINE » — UN MESSAGE DEVIENT UNE IMAGE (feuille pleine hauteur, comme le `.pageSheet` d'iOS :
 * croix en tête, glissé vers le bas). L'atelier ne crée aucun contenu, il choisit comment MONTRER
 * ce qui existe, montre la carte telle qu'elle partira, puis l'enregistre ou la partage. La
 * peinture tourne HORS du thread principal. Tout est local : rien n'est envoyé au serveur.
 */
@Composable
internal fun CardExportSheet(
    bubble: BubbleContent,
    conversationTitle: String?,
    onDismiss: () -> Unit,
    viewModel: CardExportViewModel = hiltViewModel(),
) {
    val viewer = viewModel.viewer
    val source = remember(bubble) { BubbleCardSource(bubble, viewer, System.currentTimeMillis()) }
    CardExportSheet(source, viewer, conversationTitle, onDismiss)
}

/**
 * « Imager » un COMMENTAIRE (#13922, iOS `MessageCardExportMenu.request(post:comment:…)`) : la carte que
 * `PostCommentCardComposition` a composée — l'auteur, le texte servi par le Prisme, le post public en tête, le bloc
 * « Fil de commentaires » au-delà de deux blocs — passe par le MÊME atelier qu'un message, puis Enregistrer ou Partager.
 * Comme sur iOS, la carte d'un commentaire ne porte aucun titre de conversation.
 */
@Composable
fun CommentCardExportSheet(
    key: String,
    card: PostCommentCardSubject,
    onDismiss: () -> Unit,
    viewModel: CardExportViewModel = hiltViewModel(),
) {
    val mediaBaseUrl = LocalMediaBaseUrl.current
    val source = remember(key, card, mediaBaseUrl) { ComposedCardSource(key, CardSubjects.of(card, mediaBaseUrl)) }
    CardExportSheet(source, viewModel.viewer, conversationTitle = null, onDismiss = onDismiss)
}

@Composable
fun SceneCardExportSheet(
    key: String,
    card: PostCommentCardSubject,
    render: SceneCardRender?,
    onDismiss: () -> Unit,
    viewModel: CardExportViewModel = hiltViewModel(),
) {
    val mediaBaseUrl = LocalMediaBaseUrl.current
    val current = rememberUpdatedState(render)
    val source = remember(key, card, mediaBaseUrl) { RenderingCardSource(key, CardSubjects.of(card, mediaBaseUrl), current) }
    CardExportSheet(source, viewModel.viewer, conversationTitle = null, onDismiss = onDismiss)
}

/**
 * « Imager la discussion » (#14331, iOS `MessageCardDiscussion.request`) : la discussion chargée jusqu'au message choisi,
 * dans les mots que le lecteur lit, passe par le MÊME atelier qu'un message. Rien à peindre : l'atelier se ferme.
 */
@Composable
internal fun DiscussionCardExportSheet(
    messages: List<BubbleContent>,
    endingAt: String,
    conversationTitle: String?,
    onDismiss: () -> Unit,
    viewModel: CardExportViewModel = hiltViewModel(),
) {
    val defaultTitle = stringResource(R.string.export_discussion_title)
    val viewer = viewModel.viewer
    val source = remember(endingAt) {
        val window = CardDiscussion.window(messages, endingAt, System.currentTimeMillis())
        CardDiscussion.subject(window, viewer, conversationTitle, defaultTitle)?.let { ComposedCardSource("discussion:$endingAt", it) }
    }
    if (source == null) {
        LaunchedEffect(Unit) { onDismiss() }
        return
    }
    CardExportSheet(source, viewer, conversationTitle, onDismiss)
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun CardExportSheet(
    source: CardSource,
    viewer: CardViewer,
    conversationTitle: String?,
    onDismiss: () -> Unit,
) {
    val state = rememberCardExportState(source, viewer, conversationTitle)
    val subject = state.subject
    // Ce qu'on image VIVANT fait foi : supprimé, rendu éphémère ou protégé pendant que l'atelier est
    // ouvert, il ne s'image plus — l'atelier se ferme au lieu de peindre l'instantané d'ouverture.
    if (subject == null || !source.stillAllowed(System.currentTimeMillis())) {
        LaunchedEffect(Unit) { onDismiss() }
        return
    }
    state.anonymousLabel = stringResource(R.string.export_card_anonymous)
    LaunchedEffect(state.renderKey) { state.renderPreview() }
    val context = LocalContext.current
    val pictured = subject.pictured
    LaunchedEffect(source.key, pictured) { state.pictures = CardPictureLoader.load(context, pictured) }
    val thumbnails = remember { CardThumbnailStore() }
    DisposableEffect(thumbnails) { onDispose { thumbnails.clear() } }
    val permissions = rememberPermissionFlow()
    val thumbs = remember(state.format.copy(template = CardTemplates.defaultId), state.exportLanguage, subject, state.pictures) {
        state.thumbSource(thumbnails, subject)
    }
    val haptic = LocalHapticFeedback.current
    // La fin d'un export s'annonce APRÈS la feuille, par l'annonceur de l'application : le bandeau du compositeur (#14557).
    val announcer = rememberExportAnnouncer()
    // Ce qui se dit pendant que la feuille reste ouverte s'y annonce, dans le même bandeau, au-dessus d'elle.
    val sheetAnnouncer = remember { ExportAnnouncer() }
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = MeeshyTheme.tokens.backgroundPrimary,
    ) {
        Column(
            Modifier.fillMaxHeight().navigationBarsPadding().padding(horizontal = MeeshySpacing.md),
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
        ) {
            Header(state, haptic, sheetAnnouncer, onDismiss)
            Stage(state, Modifier.weight(1f), haptic)
            Notice(state)
            CardExportTray(trayState(state, subject, thumbs), trayActions(state, haptic))
            ActionRow(state, subject, permissions, announcer, onDismiss, haptic)
        }
        PermissionFlowHost(permissions)
        ExportAnnouncerHost(sheetAnnouncer)
    }
    if (state.galleryOpen) {
        CardExportGallery(
            usage = state.usage,
            selected = state.format.template,
            source = thumbs,
            onPick = { id -> state.format = state.format.copy(template = id); state.galleryOpen = false },
            onClose = { state.galleryOpen = false },
        )
    }
}

private fun trayState(state: CardExportState, subject: CardSubject, thumbs: CardThumbSource) = CardTrayState(
    tab = state.tab, tabs = state.tabs, focus = state.focus, format = state.format,
    popular = CardUsage.popular(state.usage, 8),
    hasQuote = subject.quoted != null, hasTitle = state.title != null, hasHandles = subject.hasHandles,
    languages = state.languages, exportLanguage = state.exportLanguage, thumbs = thumbs,
)

private fun trayActions(state: CardExportState, haptic: HapticFeedback) = CardTrayActions(
    onTab = state::openTab,
    onFormat = { state.format = it },
    onLanguage = { state.exportLanguage = it },
    onGallery = { state.galleryOpen = true },
    onHaptic = { haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove) },
)

@Composable
private fun Header(state: CardExportState, haptic: HapticFeedback, announcer: ExportAnnouncer, onClose: () -> Unit) {
    val tokens = MeeshyTheme.tokens
    val defaultSaved = stringResource(R.string.export_announce_defaultSaved)
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        IconButton(onClick = onClose) {
            Icon(MeeshyIcons.Close, contentDescription = stringResource(R.string.export_card_cancel), tint = tokens.textPrimary)
        }
        Text(
            stringResource(R.string.export_card_title), color = tokens.textPrimary,
            style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold),
            modifier = Modifier.weight(1f).padding(horizontal = MeeshySpacing.sm),
        )
        IconButton(onClick = {
            haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
            state.format = state.format.copy(template = CardTemplates.random())
        }) {
            Icon(MeeshyIcons.Shuffle, contentDescription = stringResource(R.string.export_card_random), tint = tokens.textPrimary)
        }
        IconButton(
            onClick = {
                state.saveAsDefault()
                haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                announcer.announce(ExportAnnouncement(defaultSaved))
            },
            enabled = !state.isDefault,
        ) {
            Icon(
                if (state.isDefault) MeeshyIcons.BookmarkFilled else MeeshyIcons.Bookmark,
                contentDescription = stringResource(if (state.isDefault) R.string.export_card_default_current else R.string.export_card_default_save),
                tint = tokens.textPrimary,
            )
        }
    }
}

@Composable
private fun Notice(state: CardExportState) {
    val tokens = MeeshyTheme.tokens
    val outcome = state.outcome
    val text = when {
        outcome == CardOutcome.DENIED -> R.string.export_announce_photosDenied
        outcome == CardOutcome.FAILED -> R.string.export_announce_failed
        state.preparing -> R.string.export_card_rendering
        state.ready && state.rendered?.truncated == true -> R.string.export_card_truncated
        else -> null
    } ?: return
    Text(
        stringResource(text),
        color = if (outcome != null) tokens.error else tokens.textSecondary,
        style = MaterialTheme.typography.bodySmall,
        modifier = Modifier.fillMaxWidth(),
    )
}

@Composable
private fun ActionRow(
    state: CardExportState,
    subject: CardSubject,
    permissions: PermissionFlow,
    announcer: ExportAnnouncer,
    onDismiss: () -> Unit,
    haptic: HapticFeedback,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val savedMessage = stringResource(R.string.export_announce_gallery)
    val sharedMessage = stringResource(R.string.export_announce_shared)
    val shareTitle = stringResource(R.string.export_card_share)
    fun finish(outcome: CardOutcome) {
        state.busy = false
        if (outcome != CardOutcome.GALLERY && outcome != CardOutcome.SHARED) { state.outcome = outcome; return }
        state.recordUse()
        haptic.performHapticFeedback(HapticFeedbackType.LongPress)
        cardExportAnnouncement(outcome, savedMessage, sharedMessage)?.let(announcer::announce)
        onDismiss()
    }
    fun run(output: suspend (CardInput) -> Result<Unit>, done: CardOutcome) {
        state.busy = true
        state.outcome = null
        val input = state.inputFor(state.format, subject)
        scope.launch { finish(if (output(input).isSuccess) done else CardOutcome.FAILED) }
    }
    val enabled = state.ready && !state.busy && !state.preparing
    Row(Modifier.fillMaxWidth().padding(bottom = MeeshySpacing.md), horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.smPlus)) {
        Button(
            onClick = {
                state.busy = true
                scope.launch {
                    if (permissions.ensure(PermissionNature.PHOTO_LIBRARY_ADD, announcesRefusal = false)) {
                        run({ CardOutput.saveToGallery(context, it, state.pictures) }, CardOutcome.GALLERY)
                    } else {
                        finish(CardOutcome.DENIED)
                    }
                }
            },
            enabled = enabled, modifier = Modifier.weight(1f).height(50.dp), shape = CircleShape,
        ) {
            if (state.busy) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp, color = Color.White)
            else Icon(MeeshyIcons.Download, contentDescription = null, modifier = Modifier.size(18.dp))
            Text(stringResource(R.string.export_card_save), modifier = Modifier.padding(start = MeeshySpacing.sm), fontWeight = FontWeight.SemiBold)
        }
        FilledTonalButton(
            onClick = { run({ CardOutput.share(context, it, shareTitle, state.pictures) }, CardOutcome.SHARED) },
            enabled = enabled, modifier = Modifier.weight(1f).height(50.dp), shape = CircleShape,
        ) {
            Icon(MeeshyIcons.Share, contentDescription = null, modifier = Modifier.size(18.dp))
            Text(stringResource(R.string.export_card_share), modifier = Modifier.padding(start = MeeshySpacing.sm), fontWeight = FontWeight.SemiBold)
        }
    }
}

@Composable
private fun Stage(state: CardExportState, modifier: Modifier, haptic: HapticFeedback) {
    CardExportStage(
        image = state.rendered, failed = state.failed, hint = !state.touched && state.ready, focus = state.focus,
        onPick = { part ->
            haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
            state.pick(part)
        },
        modifier = modifier,
    )
}
