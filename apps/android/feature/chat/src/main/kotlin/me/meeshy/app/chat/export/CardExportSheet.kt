package me.meeshy.app.chat.export

import android.widget.Toast
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.Crossfade
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.painter.BitmapPainter
import androidx.compose.ui.hapticfeedback.HapticFeedback
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import kotlin.math.roundToInt
import kotlinx.coroutines.launch
import me.meeshy.feature.chat.R
import me.meeshy.sdk.model.PermissionNature
import me.meeshy.sdk.model.card.PostCommentCardSubject
import me.meeshy.ui.component.bubble.BubbleContent
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
    val source = remember(key, card) { ComposedCardSource(key, CardSubjects.of(card)) }
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
    LaunchedEffect(source.key) { state.pictures = CardPictureLoader.load(context, subject.media) }
    val thumbnails = remember { CardThumbnailStore() }
    DisposableEffect(thumbnails) { onDispose { thumbnails.clear() } }
    val permissions = rememberPermissionFlow()
    val thumbs = remember(state.format.copy(template = CardTemplates.defaultId), state.exportLanguage, subject, state.pictures) {
        state.thumbSource(thumbnails, subject)
    }
    val haptic = LocalHapticFeedback.current
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = MeeshyTheme.tokens.backgroundPrimary,
    ) {
        Column(
            Modifier.fillMaxHeight().navigationBarsPadding().padding(horizontal = MeeshySpacing.md),
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
        ) {
            Header(state, haptic, onDismiss)
            Stage(state, Modifier.weight(1f), haptic)
            Notice(state)
            CardExportTray(trayState(state, subject, thumbs), trayActions(state, haptic))
            ActionRow(state, subject, permissions, onDismiss, haptic)
        }
        PermissionFlowHost(permissions)
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
private fun Header(state: CardExportState, haptic: HapticFeedback, onClose: () -> Unit) {
    val tokens = MeeshyTheme.tokens
    val context = LocalContext.current
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
                Toast.makeText(context.applicationContext, defaultSaved, Toast.LENGTH_SHORT).show()
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
        Toast.makeText(context.applicationContext, if (outcome == CardOutcome.GALLERY) savedMessage else sharedMessage, Toast.LENGTH_SHORT).show()
        onDismiss()
    }
    fun run(output: suspend (CardInput) -> Result<Unit>, done: CardOutcome) {
        state.busy = true
        state.outcome = null
        val input = state.inputFor(state.format, subject)
        scope.launch { finish(if (output(input).isSuccess) done else CardOutcome.FAILED) }
    }
    val enabled = state.ready && !state.busy
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

/** L'aperçu : la carte et ses zones. Chaque partie se touche et ouvre l'onglet qui la règle. */
@Composable
private fun Stage(state: CardExportState, modifier: Modifier, haptic: HapticFeedback) {
    val tokens = MeeshyTheme.tokens
    val image = state.rendered
    val pick: (CardPartId) -> Unit = { part ->
        haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
        state.pick(part)
    }
    BoxWithConstraints(modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
        when {
            image != null -> {
                val ratio = (image.layoutWidth / image.layoutHeight).toFloat()
                val width = minOf(maxWidth, maxHeight * ratio)
                val scale = with(LocalDensity.current) { width.toPx() } / image.layoutWidth.toFloat()
                Crossfade(targetState = image, label = "card") { card -> Card(card, width, ratio, scale, state.focus, pick) }
                AnimatedVisibility(
                    visible = !state.touched && state.ready, enter = fadeIn(), exit = fadeOut(),
                    modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = MeeshySpacing.smPlus),
                ) {
                    Text(
                        stringResource(R.string.export_card_hint),
                        color = tokens.textPrimary,
                        style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.SemiBold),
                        modifier = Modifier.clip(CircleShape).background(tokens.surfaceFill)
                            .padding(horizontal = MeeshySpacing.mdPlus, vertical = MeeshySpacing.sm),
                    )
                }
            }
            state.failed -> Text(stringResource(R.string.export_announce_failed), color = tokens.error, style = MaterialTheme.typography.bodyMedium)
            else -> Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
                CircularProgressIndicator(Modifier.size(28.dp), strokeWidth = 2.dp)
                Text(stringResource(R.string.export_card_rendering), color = tokens.textSecondary, style = MaterialTheme.typography.bodySmall)
            }
        }
    }
}

@Composable
private fun Card(card: CardImage, width: androidx.compose.ui.unit.Dp, ratio: Float, scale: Float, focus: CardPartId?, pick: (CardPartId) -> Unit) {
    Box(
        Modifier
            .size(width, width / ratio)
            .shadow(18.dp, RoundedCornerShape(18.dp))
            .clip(RoundedCornerShape(18.dp)),
    ) {
        Image(
            BitmapPainter(remember(card) { card.bitmap.asImageBitmap() }),
            contentDescription = stringResource(R.string.export_card_hint),
            modifier = Modifier.fillMaxSize().clickable { pick(CardPartId.BACKGROUND) },
        )
        card.regions.forEach { region -> Zone(region, scale, region.part == focus, pick) }
    }
}

@Composable
private fun Zone(region: CardRegion, scale: Float, focused: Boolean, onPick: (CardPartId) -> Unit) {
    val density = LocalDensity.current
    val slop = 8.dp
    val label = CardLabels.part(region.part)
    Box(
        Modifier
            .offset { IntOffset((region.x * scale).roundToInt() - slop.roundToPx(), (region.y * scale).roundToInt() - slop.roundToPx()) }
            .size(
                with(density) { (region.width * scale).toFloat().toDp() } + slop * 2,
                with(density) { (region.height * scale).toFloat().toDp() } + slop * 2,
            )
            .drawBehind {
                if (focused) {
                    drawRoundRect(
                        Color.White.copy(alpha = 0.9f), cornerRadius = CornerRadius(12.dp.toPx()),
                        style = Stroke(2.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(18f, 12f))),
                    )
                }
            }
            .semantics { role = Role.Button; selected = focused; contentDescription = label }
            .clickable { onPick(region.part) },
    )
}
