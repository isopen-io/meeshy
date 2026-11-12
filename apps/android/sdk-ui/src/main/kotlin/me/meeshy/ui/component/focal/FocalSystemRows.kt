package me.meeshy.ui.component.focal

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import me.meeshy.sdk.model.CallSummaryMetadata
import me.meeshy.sdk.model.reading.focal.FocalCallJournalOffer
import me.meeshy.sdk.model.reading.focal.FocalCallNotice
import me.meeshy.sdk.model.reading.focal.FocalCallNoticePresenter
import me.meeshy.sdk.model.reading.focal.FocalCallTitle
import me.meeshy.sdk.model.reading.focal.FocalCallTone
import me.meeshy.sdk.model.reading.focal.FocalSpecialRow
import me.meeshy.sdk.model.reading.focal.FocalSpecialRowRouting
import me.meeshy.ui.R
import me.meeshy.ui.component.bubble.BubbleCallbacks
import me.meeshy.ui.component.bubble.BubbleContent
import me.meeshy.ui.component.bubble.FlatRowMetrics
import me.meeshy.ui.component.bubble.SystemNoticeLine
import me.meeshy.ui.format.bubbleClockLabel
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/** Quelle rangée spéciale [content] demande à la rangée plate (iOS `FocalSystemRows.view(for:)`). */
internal fun BubbleContent.focalSpecialRow(): FocalSpecialRow = FocalSpecialRowRouting.of(
    isDeleted = isDeleted,
    isSystem = isSystem,
    hasCallSummary = callSummary != null,
    hasJoinNotice = joinNotice?.primaryName?.isNotEmpty() == true,
    hasText = text.isNotBlank(),
)

/**
 * Les rangées spéciales NUES de la rangée plate (iOS `FocalSystemRows`) : « Message supprimé » en italique muet au
 * retrait de 29, l'avis système centré sans capsule (12.5 medium muet, heure 9.5 au-dessus), la notice d'appel
 * (double tap = rappeler, appui long = options du message) et les arrivées / départs sans avatar.
 */
@Composable
internal fun FocalSpecialRowView(
    row: FocalSpecialRow,
    content: BubbleContent,
    accentColor: Color,
    callbacks: BubbleCallbacks,
) {
    when (row) {
        FocalSpecialRow.Deleted -> FocalDeletedRow(onLongPress = callbacks.onLongPress)
        FocalSpecialRow.CallNotice -> content.callSummary?.let { summary ->
            FocalCallNoticeRow(
                notice = remember(summary, content.callIsOutgoing) { FocalCallNoticePresenter.of(summary, content.callIsOutgoing) },
                createdAtIso = content.createdAtIso,
                accentColor = accentColor,
                onCallBack = callbacks.onCallBack,
                onLongPress = callbacks.onLongPress,
                journal = content.callJournalRequest(summary, accentColor),
            )
        }
        FocalSpecialRow.JoinNotice, FocalSpecialRow.SystemNotice -> SystemNoticeLine(content = content, callbacks = callbacks, accentColor = accentColor)
        FocalSpecialRow.Empty, FocalSpecialRow.None -> Unit
    }
}

/** La demande de journal d'après l'appel de cette bulle, ou `null` quand l'appel n'en offre pas (R1.11). */
private fun BubbleContent.callJournalRequest(summary: CallSummaryMetadata, accent: Color): CallJournalRequest? =
    if (FocalCallJournalOffer.isOffered(summary)) CallJournalRequest(summary.callId, createdAtIso.orEmpty(), accent) else null

/** Message supprimé : une ligne fantôme italique sans fond, au retrait de la colonne du nom. */
@Composable
internal fun FocalDeletedRow(onLongPress: (() -> Unit)?, modifier: Modifier = Modifier) {
    Text(
        text = stringResource(R.string.bubble_message_deleted),
        fontSize = FlatRowMetrics.TEXT_SIZE_SP.sp,
        fontStyle = FontStyle.Italic,
        color = MeeshyTheme.tokens.textMuted,
        modifier = modifier
            .padding(start = FlatRowMetrics.indent)
            .let { base ->
                if (onLongPress == null) base
                else base.pointerInput(onLongPress) { detectTapGestures(onLongPress = { onLongPress() }) }
            },
    )
}

@Composable
private fun FocalCallTitle.label(): String = stringResource(
    when (this) {
        FocalCallTitle.LiveVideo -> R.string.focal_call_video_ongoing
        FocalCallTitle.LiveAudio -> R.string.focal_call_audio_ongoing
        FocalCallTitle.Cancelled -> R.string.focal_call_cancelled
        FocalCallTitle.VideoOutgoing, FocalCallTitle.VideoIncoming -> R.string.focal_call_video
        FocalCallTitle.AudioOutgoing, FocalCallTitle.AudioIncoming -> R.string.focal_call_audio
        FocalCallTitle.MissedVideo -> R.string.focal_call_video_missed
        FocalCallTitle.MissedAudio -> R.string.focal_call_audio_missed
        FocalCallTitle.RejectedSent -> R.string.focal_call_rejected_sent
        FocalCallTitle.RejectedReceived -> R.string.focal_call_rejected_received
        FocalCallTitle.FailedVideo -> R.string.focal_call_video_failed
        FocalCallTitle.FailedAudio -> R.string.focal_call_audio_failed
    },
)

/** « Appel audio » + « sortant » / « entrant » pour un appel terminé ; le titre seul sinon (iOS `title`). */
@Composable
private fun FocalCallNotice.titleText(): String {
    val base = title.label()
    val completed = title == FocalCallTitle.VideoOutgoing || title == FocalCallTitle.VideoIncoming ||
        title == FocalCallTitle.AudioOutgoing || title == FocalCallTitle.AudioIncoming
    if (!completed) return base
    return "$base ${stringResource(if (isOutgoing) R.string.focal_call_outgoing_suffix else R.string.focal_call_incoming_suffix)}"
}

/**
 * La notice d'appel : une carte compacte à contour, alignée comme une bulle (sortant à droite, entrant à gauche).
 * **Rappeler demande un DOUBLE tap** (iOS, directive 2026-08-24) : un tap simple sonnerait chez quelqu'un depuis une
 * liste qui défile, et l'appui long reste celui des options du message, d'où les détails d'appel. TalkBack n'a ni
 * double tap ni appui long : ses deux destinations lui sont offertes en actions nommées.
 */
@Composable
internal fun FocalCallNoticeRow(
    notice: FocalCallNotice,
    createdAtIso: String?,
    accentColor: Color,
    onCallBack: (() -> Unit)?,
    onLongPress: (() -> Unit)?,
    modifier: Modifier = Modifier,
    journal: CallJournalRequest? = null,
) {
    val slot = LocalCallJournal.current
    Column(modifier = modifier) {
        FocalCallNoticeCard(notice, createdAtIso, accentColor, onCallBack, onLongPress)
        if (journal != null && slot != null) FocalCallJournalUnderBubble(journal, slot)
    }
}

@Composable
private fun FocalCallNoticeCard(
    notice: FocalCallNotice,
    createdAtIso: String?,
    accentColor: Color,
    onCallBack: (() -> Unit)?,
    onLongPress: (() -> Unit)?,
) {
    val tokens = MeeshyTheme.tokens
    val tint = when (notice.tone) {
        FocalCallTone.Accent -> accentColor
        FocalCallTone.Error -> MeeshyPalette.Error
        FocalCallTone.Warning -> MeeshyPalette.Warning
    }
    val clock = remember(createdAtIso) { bubbleClockLabel(createdAtIso) }
    val title = notice.titleText()
    val direction = stringResource(if (notice.isOutgoing) R.string.focal_call_outgoing else R.string.focal_call_incoming)
    val label = listOfNotNull(title, direction, clock, notice.durationLabel, notice.dataLabel).joinToString(", ")
    val callAction = stringResource(if (notice.isLive) R.string.focal_call_join_action else R.string.focal_call_callback_action)
    val detailsAction = stringResource(R.string.focal_call_details_action)
    val shape = RoundedCornerShape(MeeshyRadius.lg)
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.xs),
        horizontalArrangement = if (notice.isOutgoing) Arrangement.End else Arrangement.Start,
    ) {
        Column(
            horizontalAlignment = Alignment.End,
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xxs),
            modifier = Modifier
                .heightIn(min = 48.dp)
                .clip(shape)
                .background(tint.copy(alpha = if (MeeshyTheme.isDark) 0.06f else 0.03f))
                .border(0.5.dp, tint.copy(alpha = if (MeeshyTheme.isDark) 0.25f else 0.15f), shape)
                .pointerInput(onCallBack, onLongPress) {
                    detectTapGestures(
                        onDoubleTap = { onCallBack?.invoke() },
                        onLongPress = { onLongPress?.invoke() },
                    )
                }
                .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.sm)
                .semantics(mergeDescendants = true) {
                    contentDescription = label
                    customActions = listOfNotNull(
                        onCallBack?.let { CustomAccessibilityAction(callAction) { it(); true } },
                        onLongPress?.let { CustomAccessibilityAction(detailsAction) { it(); true } },
                    )
                },
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.smPlus)) {
                CallGlyph(notice, tint)
                Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xxs)) {
                    Text(text = title, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, color = tokens.textPrimary, maxLines = 1)
                    if (notice.isLive) {
                        Text(
                            text = stringResource(R.string.focal_call_join_hint),
                            fontSize = 12.sp, fontWeight = FontWeight.Medium, color = tint, maxLines = 1,
                        )
                    } else {
                        CallMetrics(notice)
                    }
                }
            }
            if (clock != null) Text(text = clock, fontSize = 11.sp, fontWeight = FontWeight.Medium, color = tokens.textMuted)
        }
    }
}

@Composable
private fun CallGlyph(notice: FocalCallNotice, tint: Color) {
    Box(Modifier.size(40.dp), contentAlignment = Alignment.Center) {
        Box(Modifier.size(40.dp).clip(CircleShape).background(tint.copy(alpha = if (MeeshyTheme.isDark) 0.14f else 0.09f)))
        Icon(
            imageVector = if (notice.isVideo) MeeshyIcons.Video else MeeshyIcons.Call,
            contentDescription = null, tint = tint, modifier = Modifier.size(20.dp),
        )
        Box(
            Modifier.align(Alignment.BottomEnd).size(16.dp).clip(CircleShape).background(MeeshyTheme.tokens.backgroundPrimary),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = if (notice.isOutgoing) MeeshyIcons.ArrowUpRight else MeeshyIcons.ArrowDown,
                contentDescription = null, tint = tint, modifier = Modifier.size(10.dp),
            )
        }
    }
}

@Composable
private fun CallMetrics(notice: FocalCallNotice) {
    if (notice.durationLabel == null && notice.dataLabel == null) return
    val muted = MeeshyTheme.tokens.textMuted
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
        notice.durationLabel?.let { Metric(MeeshyIcons.Schedule, it, muted) }
        if (notice.durationLabel != null && notice.dataLabel != null) Text("·", fontSize = 12.sp, color = muted)
        notice.dataLabel?.let { Metric(MeeshyIcons.SwapVertical, it, muted) }
    }
}

@Composable
private fun Metric(icon: androidx.compose.ui.graphics.vector.ImageVector, text: String, color: Color) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
        Icon(imageVector = icon, contentDescription = null, tint = color, modifier = Modifier.size(12.dp))
        Text(text = text, fontSize = 12.sp, fontWeight = FontWeight.Medium, color = color, maxLines = 1)
    }
}
