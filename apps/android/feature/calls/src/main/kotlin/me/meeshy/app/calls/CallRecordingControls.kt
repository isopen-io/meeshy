package me.meeshy.app.calls

import androidx.annotation.StringRes
import androidx.compose.animation.Crossfade
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.heightIn
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import me.meeshy.feature.calls.R
import me.meeshy.sdk.model.call.CallButtonRole
import me.meeshy.sdk.model.call.CallChromeStow
import me.meeshy.sdk.model.call.CallRecordingKind
import me.meeshy.sdk.model.call.CallRecordingNotice
import me.meeshy.sdk.model.call.CallRecordingPhase
import me.meeshy.ui.theme.MeeshyMediaChromeColors
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.icons.MeeshyIcons

private val PILL_TARGET = 48.dp
private const val NOTICE_MILLIS = 4_000L

/** Ce que la pastille de statut dit et ce que son bouton fait. Pur : prouvé hors appareil. */
internal data class CallRecordingStatus(
    @StringRes val textRes: Int,
    @StringRes val stopLabelRes: Int,
    /** R3.3 — le mot du bouton blanc de la capsule (« Arrêter », « Annuler » en attente) ; le libellé accessible garde la phrase entière. */
    @StringRes val stopWordRes: Int,
)

internal object CallRecordingPresenter {
    /** `null` : rien à montrer (repos, ou une carte de consentement tient la place). */
    fun status(phase: CallRecordingPhase): CallRecordingStatus? = when (phase) {
        CallRecordingPhase.Idle -> null
        is CallRecordingPhase.Asking -> CallRecordingStatus(R.string.call_recording_waiting, R.string.call_recording_cancel, R.string.call_recording_cancel)
        is CallRecordingPhase.Pending ->
            if (phase.mustAnswer) null else CallRecordingStatus(R.string.call_recording_waiting, R.string.call_recording_cancel, R.string.call_recording_cancel)
        is CallRecordingPhase.Recording ->
            CallRecordingStatus(R.string.call_recording_active, R.string.call_recording_stop, R.string.call_recording_stop_word)
    }

    /** Le participant requis qui n'a pas répondu voit la carte, pas la pastille. */
    fun asksConsent(phase: CallRecordingPhase): Boolean = (phase as? CallRecordingPhase.Pending)?.mustAnswer == true

    @StringRes
    fun noticeRes(notice: CallRecordingNotice): Int = when (notice) {
        is CallRecordingNotice.Stopped -> when (notice.reason) {
            "refused" -> R.string.call_recording_stopped_refused
            "timeout" -> R.string.call_recording_stopped_timeout
            "participant-joined" -> R.string.call_recording_stopped_joined
            else -> R.string.call_recording_stopped_other
        }
        is CallRecordingNotice.Unavailable -> R.string.call_recording_unavailable
        CallRecordingNotice.Saved -> R.string.call_recording_saved
        CallRecordingNotice.SaveFailed -> R.string.call_recording_saveFailed
        CallRecordingNotice.EndToEndRefused -> R.string.call_recording_end_to_end_refused
    }
}

/**
 * « Enregistrement en cours » (chez tous, pendant toute la capture) ou « En attente de l'accord de tous… », avec son arrêt :
 * UNE capsule de verre, sous le voile du ton de l'écran (R3.12), dont seuls les mots changent de l'attente à l'enregistrement
 * (R2.10) ; le bouton est la capsule blanche à encre rouge de la planche, qui dit le mot (R3.3).
 */
@Composable
internal fun CallRecordingStatusPill(
    text: String,
    stopWord: String,
    stopLabel: String,
    onStop: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val fadeMillis = CallChromeStow.fadeMillis(rememberCallReduceMotion())
    CallGlassPlate(
        modifier = modifier.semantics { liveRegion = LiveRegionMode.Polite },
        shape = CircleShape,
    ) {
        CallToneScrim()
        Row(
            modifier = Modifier.padding(start = MeeshySpacing.mdPlus, end = MeeshySpacing.xs),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.smPlus),
        ) {
            RecordingDot()
            Crossfade(targetState = text, animationSpec = tween(fadeMillis), label = "callRecordingWords") { words ->
                Text(
                    text = words,
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.Medium,
                    color = Color.White,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            CallShareStopButton(onStop = onStop, label = stopLabel, word = stopWord)
        }
    }
}

/** L'avis qui suit une fin ou un échec ; il se retire seul au bout de 4 s. */
@Composable
internal fun CallRecordingNoticePill(
    notice: CallRecordingNotice,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val text = stringResource(CallRecordingPresenter.noticeRes(notice))
    val close = stringResource(R.string.call_recording_close)
    LaunchedEffect(notice) {
        delay(NOTICE_MILLIS)
        onDismiss()
    }
    CallGlassPlate(
        modifier = modifier.semantics { liveRegion = LiveRegionMode.Polite },
        shape = CircleShape,
    ) {
        CallToneScrim()
        Row(
            modifier = Modifier.padding(start = MeeshySpacing.mdPlus),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xsPlus),
        ) {
            Text(
                text = text,
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.Medium,
                color = Color.White,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f, fill = false),
            )
            Box(
                modifier = Modifier
                    .size(PILL_TARGET)
                    .clip(CircleShape)
                    .clickable(onClickLabel = close, role = Role.Button, onClick = onDismiss)
                    .semantics { contentDescription = close },
                contentAlignment = Alignment.Center,
            ) {
                Icon(MeeshyIcons.Close, contentDescription = null, tint = MeeshyMediaChromeColors.OnMediaSecondary, modifier = Modifier.size(16.dp))
            }
        }
    }
}

/**
 * G3.2 — le panneau « Enregistrer » dans la pilule : la phrase d'accord, puis deux puces larges Audio | Vidéo qui
 * LANCENT aussitôt la demande (pas de bouton de lancement). Le titre et les deux disques d'en-tête sont ceux de
 * [CallPillPanel]. Miroir de iOS `CallRecordingPanel`.
 */
@Composable
internal fun CallRecordingKindPanel(
    onPick: (CallRecordingKind) -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(modifier = modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
        Text(
            text = stringResource(R.string.call_recording_consent),
            style = MaterialTheme.typography.bodySmall,
            color = MeeshyMediaChromeColors.OnMediaSecondary,
            modifier = Modifier.fillMaxWidth().padding(horizontal = MeeshySpacing.lg),
        )
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = MeeshySpacing.lg).padding(bottom = MeeshySpacing.sm),
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
        ) {
            listOf(CallRecordingKind.AUDIO, CallRecordingKind.VIDEO).forEach { kind ->
                CallRecordingChoiceChip(
                    label = stringResource(if (kind == CallRecordingKind.VIDEO) R.string.call_recording_kind_video else R.string.call_recording_kind_audio),
                    hint = stringResource(R.string.call_recording_kind_hint),
                    onClick = { onPick(kind) },
                    modifier = Modifier.weight(1f),
                )
            }
        }
    }
}

/** G3.2 — un choix de l'option : une puce large de verre (cible de 48 dp) qui lance aussitôt la demande. */
@Composable
private fun CallRecordingChoiceChip(label: String, hint: String, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val source = remember { MutableInteractionSource() }
    val pressed by source.collectIsPressedAsState()
    CallGlassButtonSurface(
        role = CallButtonRole.Neutral,
        shape = CircleShape,
        isPressed = pressed,
        modifier = modifier
            .heightIn(min = PILL_TARGET)
            .clip(CircleShape)
            .clickable(interactionSource = source, indication = null, onClickLabel = hint, role = Role.Button, onClick = onClick)
            .semantics(mergeDescendants = true) { contentDescription = label },
    ) {
        Text(text = label, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold, color = Color.White, maxLines = 1)
    }
}
