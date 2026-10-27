package me.meeshy.app.calls

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import java.text.DateFormat
import java.util.Date
import androidx.lifecycle.ViewModel
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import me.meeshy.feature.calls.R
import me.meeshy.sdk.call.frames.CallFramePortrait
import me.meeshy.sdk.call.frames.CallFrameRenderer
import me.meeshy.sdk.call.frames.CallFrameStage
import me.meeshy.sdk.model.call.CallLiveFrameReply
import me.meeshy.sdk.model.call.frames.CallFrameChromeReserve
import me.meeshy.sdk.model.call.frames.CallFrameDesign
import me.meeshy.sdk.model.call.frames.CallFrameMood
import me.meeshy.sdk.model.call.frames.CallFramePerson
import me.meeshy.sdk.model.call.frames.CallFrameTexts
import me.meeshy.sdk.model.call.frames.CallLiveFrameRule
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing

private const val PAINT_LONGEST_SIDE = 1280
private const val ANSWER_LINGER_MILLIS = 4_000L
private val HEADER_RESERVE = 72.dp
private val PILL_RESERVE = 200.dp
private val STATUS_TOP = 68.dp
private val THUMB_WIDTH = 72.dp
private val THUMB_HEIGHT = 128.dp

/**
 * Le cadre en direct autour des deux vidéos ET ce qui se dit à son sujet : la proposition de l'autre
 * à trancher, sa réponse à la mienne, l'échec d'une proposition. Deux couches, un seul contrôleur.
 */
@Singleton
class CallLiveFrameOverlay @Inject constructor(
    private val frame: CallLiveFrameController,
) : CallOverlay {
    override val id: String = "call-live-frame"
    override val slot: CallOverlaySlot = CallOverlaySlot.Background

    override fun isVisible(state: CallUiState): Boolean = state.isVideoCall && state.showsConnectedLayout

    @Composable
    override fun Content(context: CallOverlayContext) {
        val shared by frame.state.collectAsState()
        val design = CallLiveFrameRule.displayed(shared.frameId, CallLiveFrameRule.PEOPLE) ?: return
        CallLiveFrameSurface(
            design = design,
            people = frame.people(context.state.peerName, shared.remoteSharedName),
            modifier = Modifier.fillMaxSize(),
        )
    }
}

/** Ce qui se dit du cadre en haut de l'écran, sous l'en-tête : une proposition à trancher, une réponse, un échec. */
@Singleton
class CallLiveFrameStatusOverlay @Inject constructor(
    private val frame: CallLiveFrameController,
) : CallOverlay {
    override val id: String = "call-live-frame-status"
    override val slot: CallOverlaySlot = CallOverlaySlot.TopBanner

    @Composable
    override fun Content(context: CallOverlayContext) = CallLiveFrameStatus(frame)
}

@HiltViewModel
class CallLiveFrameViewModel @Inject constructor(val controller: CallLiveFrameController) : ViewModel()

/** Le texte du haut de l'écran : la proposition à trancher, la réponse de l'autre, ou l'échec de la mienne. */
@Composable
internal fun CallLiveFrameStatus(controller: CallLiveFrameController, modifier: Modifier = Modifier) {
    val state by controller.state.collectAsState()
    val notice by controller.notices.collectAsState()
    val proposed = state.proposal?.let { p -> CallLiveFrameRule.frames().firstOrNull { it.id == p.frameId }?.let { p to it } }
    val answer = state.answer
    Column(modifier.padding(top = STATUS_TOP, start = MeeshySpacing.lg, end = MeeshySpacing.lg)) {
        when {
            proposed != null -> CallLiveFrameProposalCard(
                text = proposalText(proposed.first.from, proposed.second.name),
                onAccept = controller::accept,
                onDecline = controller::decline,
            )
            answer != null -> {
                val text = answerText(answer.reply, answer.from)
                CallLiveFrameNotice(text)
                LaunchedEffect(answer) {
                    delay(ANSWER_LINGER_MILLIS)
                    controller.dismissAnswer()
                }
            }
            notice != null -> {
                CallLiveFrameNotice(stringResource(R.string.call_live_frame_not_proposed))
                LaunchedEffect(notice) {
                    delay(ANSWER_LINGER_MILLIS)
                    controller.noticeShown()
                }
            }
        }
    }
}

@Composable
private fun proposalText(from: String?, frame: String): String =
    if (from.isNullOrBlank()) stringResource(R.string.call_live_frame_proposal_anonymous, frame)
    else stringResource(R.string.call_live_frame_proposal, from, frame)

@Composable
private fun answerText(reply: CallLiveFrameReply, from: String?): String = when {
    reply == CallLiveFrameReply.ACCEPTED && !from.isNullOrBlank() -> stringResource(R.string.call_live_frame_answer_accepted, from)
    reply == CallLiveFrameReply.ACCEPTED -> stringResource(R.string.call_live_frame_answer_accepted_anonymous)
    !from.isNullOrBlank() -> stringResource(R.string.call_live_frame_answer_declined, from)
    else -> stringResource(R.string.call_live_frame_answer_declined_anonymous)
}

/** L'autre m'invite à appliquer son cadre ; rien ne change chez moi tant que je n'ai pas touché « Appliquer ». */
@Composable
internal fun CallLiveFrameProposalCard(text: String, onAccept: () -> Unit, onDecline: () -> Unit, modifier: Modifier = Modifier) {
    val shape = RoundedCornerShape(MeeshyRadius.lg)
    Column(
        modifier = modifier.fillMaxWidth().clip(shape).background(Color.Black.copy(alpha = 0.55f)).padding(MeeshySpacing.md),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm), verticalAlignment = Alignment.Top) {
            androidx.compose.material3.Icon(MeeshyIcons.Wallpaper, contentDescription = null, tint = CallPalette.Ink, modifier = Modifier.size(20.dp))
            Text(text, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold, color = CallPalette.Ink)
        }
        Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
            CallLiveFrameButton(stringResource(R.string.call_live_frame_decline), Color.White.copy(alpha = 0.16f), onDecline, Modifier.weight(1f))
            CallLiveFrameButton(stringResource(R.string.call_live_frame_accept), CallPalette.BrandDeep, onAccept, Modifier.weight(1f))
        }
    }
}

@Composable
private fun CallLiveFrameButton(label: String, fill: Color, onClick: () -> Unit, modifier: Modifier) {
    val haptics = LocalHapticFeedback.current
    Box(
        modifier
            .height(44.dp)
            .clip(CircleShape)
            .background(fill)
            .clickable(role = Role.Button) {
                haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                onClick()
            },
        contentAlignment = Alignment.Center,
    ) { Text(label, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold, color = CallPalette.Ink) }
}

/** Une ligne d'état du cadre : la réponse de l'autre, ou la raison d'une pause. */
@Composable
internal fun CallLiveFrameNotice(text: String, modifier: Modifier = Modifier) {
    Text(
        text = text,
        style = MaterialTheme.typography.labelLarge,
        fontWeight = FontWeight.SemiBold,
        color = CallPalette.Ink,
        modifier = modifier
            .clip(CircleShape)
            .background(Color.Black.copy(alpha = 0.55f))
            .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.sm)
            .semantics(mergeDescendants = true) { },
    )
}

/**
 * Le cadre à l'écran : le DESSUS du cadre (traits de case, bordure, ornements de premier plan, noms,
 * titre, signature), peint hors du fil principal à la taille de l'écran puis posé tel quel par-dessus
 * les vidéos. Il ne prend aucun toucher. Les couches se repeignent seulement quand le cadre, les
 * personnes, les textes ou la taille changent — jamais à une image vidéo.
 */
@Composable
internal fun CallLiveFrameSurface(design: CallFrameDesign, people: List<CallFramePerson>, modifier: Modifier = Modifier) {
    val density = LocalDensity.current
    val locale = LocalConfiguration.current.locales[0]
    val date = remember(locale) { DateFormat.getDateInstance(DateFormat.LONG, locale).format(Date()) }
    BoxWithConstraints(modifier) {
        val widthPx = with(density) { maxWidth.roundToPx() }
        val heightPx = with(density) { maxHeight.roundToPx() }
        val shrink = (PAINT_LONGEST_SIDE.toFloat() / maxOf(widthPx, heightPx)).coerceAtMost(1f)
        val paintW = (widthPx * shrink).toInt()
        val paintH = (heightPx * shrink).toInt()
        val reserve = with(density) { CallFrameChromeReserve.covering(HEADER_RESERVE.toPx().toDouble(), PILL_RESERVE.toPx().toDouble(), heightPx.toDouble()) }
        val overlay by produceState<ImageBitmap?>(null, design.id, people, paintW, paintH, date, reserve) {
            if (paintW < 1 || paintH < 1) return@produceState
            val texts = CallFrameTexts(groupName = null, isGroup = false, date = date, accentHex = null)
            value = withContext(Dispatchers.Default) {
                CallFrameRenderer.layers(CallFrameStage(design, people, texts, paintW, paintH, reserve))?.overlay?.asImageBitmap()
            }
        }
        val description = stringResource(R.string.call_live_frame_surface, design.name)
        overlay?.let {
            Image(
                bitmap = it,
                contentDescription = description,
                contentScale = ContentScale.FillBounds,
                modifier = Modifier.fillMaxSize(),
            )
        }
    }
}

/**
 * Le choix du cadre en direct (le mode « Capturer l'appel », comme sur iOS) : « Aucun cadre », puis les cadres
 * d'une ambiance, chacun en vignette. Toucher un cadre l'applique tout de suite chez moi et le propose à l'autre.
 */
@Composable
internal fun CallLiveFramePicker(
    controller: CallLiveFrameController,
    peerName: String,
    onClose: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val state by controller.state.collectAsState()
    val moods = remember { CallLiveFrameRule.moods() }
    var mood by remember(moods) { mutableStateOf(moods.firstOrNull()) }
    val frames = remember(mood) { CallLiveFrameRule.frames(mood) }
    val people = remember(peerName, state.remoteSharedName) { controller.people(peerName, state.remoteSharedName) }
    val haptics = LocalHapticFeedback.current
    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(topStart = MeeshyRadius.xl, topEnd = MeeshyRadius.xl))
            .background(Color.Black.copy(alpha = 0.72f))
            .padding(top = MeeshySpacing.md, bottom = MeeshySpacing.lg),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        Row(Modifier.padding(horizontal = MeeshySpacing.lg), verticalAlignment = Alignment.CenterVertically) {
            Text(
                stringResource(R.string.call_live_frame_label),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                color = CallPalette.Ink,
                modifier = Modifier.weight(1f),
            )
            CallPillButton(
                icon = MeeshyIcons.Close,
                kind = CallPillKind.Normal,
                label = stringResource(R.string.call_panel_close),
                onClick = onClose,
                diameter = 40.dp,
            )
        }
        LazyRow(contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = MeeshySpacing.lg), horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
            items(moods) { m -> MoodChip(m, selected = m == mood) { mood = m } }
        }
        LazyRow(contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = MeeshySpacing.lg), horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
            item {
                FrameTile(label = stringResource(R.string.call_live_frame_none), selected = state.frameId == null, thumb = null, people = people) {
                    haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                    controller.apply(null)
                }
            }
            items(frames, key = { it.id }) { design ->
                FrameTile(label = design.name, selected = design.id == state.frameId, thumb = design, people = people) {
                    haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                    controller.apply(design.id)
                }
            }
        }
        Text(
            stringResource(R.string.call_live_frame_hold_hint),
            style = MaterialTheme.typography.bodySmall,
            color = CallPalette.InkSecondary,
            modifier = Modifier.padding(horizontal = MeeshySpacing.lg),
        )
    }
}

@Composable
private fun MoodChip(mood: CallFrameMood, selected: Boolean, onClick: () -> Unit) {
    Text(
        text = stringResource(moodLabel(mood)),
        style = MaterialTheme.typography.labelLarge,
        fontWeight = FontWeight.SemiBold,
        color = if (selected) MeeshyPalette.Indigo950 else CallPalette.Ink,
        modifier = Modifier
            .defaultMinSizeForTarget()
            .clip(CircleShape)
            .background(if (selected) Color.White else Color.White.copy(alpha = 0.16f))
            .clickable(role = Role.Tab, onClick = onClick)
            .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.sm)
            .semantics { this.selected = selected },
    )
}

private fun Modifier.defaultMinSizeForTarget(): Modifier = this.height(40.dp)

@Composable
private fun FrameTile(label: String, selected: Boolean, thumb: CallFrameDesign?, people: List<CallFramePerson>, onClick: () -> Unit) {
    val shape = RoundedCornerShape(MeeshyRadius.md)
    Column(
        Modifier
            .width(THUMB_WIDTH + 8.dp)
            .clickable(role = Role.Button, onClick = onClick)
            .semantics { this.selected = selected; contentDescription = label },
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
    ) {
        Box(
            Modifier
                .size(THUMB_WIDTH, THUMB_HEIGHT)
                .clip(shape)
                .background(Color.White.copy(alpha = 0.08f))
                .border(if (selected) 2.dp else 1.dp, if (selected) Color.White else Color.White.copy(alpha = 0.3f), shape),
            contentAlignment = Alignment.Center,
        ) {
            if (thumb != null) FrameThumbnail(thumb, people)
        }
        Text(label, style = MaterialTheme.typography.labelSmall, color = CallPalette.Ink, maxLines = 1, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis)
    }
}

@Composable
private fun FrameThumbnail(design: CallFrameDesign, people: List<CallFramePerson>) {
    val density = LocalDensity.current
    val w = with(density) { THUMB_WIDTH.roundToPx() }
    val h = with(density) { THUMB_HEIGHT.roundToPx() }
    val locale = LocalConfiguration.current.locales[0]
    val date = remember(locale) { DateFormat.getDateInstance(DateFormat.MEDIUM, locale).format(Date()) }
    val bitmap by produceState<ImageBitmap?>(null, design.id, w, h, people, date) {
        val texts = CallFrameTexts(groupName = null, isGroup = false, date = date, accentHex = null)
        value = withContext(Dispatchers.Default) {
            CallFrameRenderer.render(design, people.map { CallFramePortrait(it.id, it.name, it.handle, it.isSelf, null) }, texts, w, h)?.asImageBitmap()
        }
    }
    bitmap?.let { Image(it, contentDescription = null, contentScale = ContentScale.FillBounds, modifier = Modifier.fillMaxSize()) }
}

private fun moodLabel(mood: CallFrameMood): Int = when (mood) {
    CallFrameMood.CORPORATE -> R.string.call_frames_mood_corporate
    CallFrameMood.DECONNECTE -> R.string.call_frames_mood_deconnecte
    CallFrameMood.DISTINGUE -> R.string.call_frames_mood_distingue
    CallFrameMood.ELEGANT -> R.string.call_frames_mood_elegant
    CallFrameMood.FANTASTIQUE -> R.string.call_frames_mood_fantastique
    CallFrameMood.FEERIQUE -> R.string.call_frames_mood_feerique
    CallFrameMood.FUTURISTE -> R.string.call_frames_mood_futuriste
    CallFrameMood.GLAUQUE -> R.string.call_frames_mood_glauque
    CallFrameMood.HORS_NORME -> R.string.call_frames_mood_hors_norme
    CallFrameMood.JOVIAL -> R.string.call_frames_mood_jovial
    CallFrameMood.MORBIDE -> R.string.call_frames_mood_morbide
    CallFrameMood.SIGNATURE -> R.string.call_frames_mood_signature
}
