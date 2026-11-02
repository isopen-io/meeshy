package me.meeshy.app.contacts.circles

import android.provider.Settings
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.foundation.clickable
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.semantics.collapse
import androidx.compose.ui.semantics.expand
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.scale
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.contacts.R
import me.meeshy.sdk.model.relation.RelationRitualConsentKey
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyTheme

/**
 * Le rituel du Sang (#13938) — iso `BloodRitualView.swift` : des consentements explicites d'abord, puis les DEUX tiennent
 * l'écran en même temps ; l'anneau pulse tant qu'on attend l'autre, se remplit quand les deux sont synchronisés, et le
 * scellement part tout seul. Lâcher est calme : rien n'est enregistré. Sans animation si l'appareil les a coupées.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun BloodRitualSheet(controller: BloodRitualController, onFinished: () -> Unit) {
    val state by controller.state.collectAsStateWithLifecycle()
    val tokens = MeeshyTheme.tokens
    ModalBottomSheet(
        onDismissRequest = onFinished,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = tokens.backgroundPrimary,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 24.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                text = stringResource(R.string.circles_ritual_title),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                color = tokens.textPrimary,
            )
            when (state.stage) {
                RitualStage.CONSENT -> ConsentStep(controller, state)
                RitualStage.READY, RitualStage.OPENING -> ReadyStep(controller, state)
                RitualStage.WAITING, RitualStage.SYNCHRONISED, RitualStage.AWAITING_OTHER -> HoldStep(controller, state)
                RitualStage.COMPLETED -> Outcome(
                    icon = null,
                    tint = MeeshyPalette.Error,
                    text = stringResource(R.string.circles_ritual_completed, controller.displayName),
                    retry = null,
                    onClose = onFinished,
                )
                RitualStage.LAPSED -> Outcome(
                    icon = MeeshyIcons.Hand,
                    tint = tokens.textMuted,
                    text = stringResource(R.string.circles_ritual_lapsed),
                    retry = controller::retry,
                    onClose = onFinished,
                )
                RitualStage.UNAVAILABLE -> Outcome(
                    icon = MeeshyIcons.Block,
                    tint = tokens.textMuted,
                    text = stringResource(
                        if (state.isOfflineUnavailable) R.string.circles_ritual_unavailable_offline else R.string.circles_ritual_unavailable_generic,
                    ),
                    retry = null,
                    onClose = onFinished,
                )
            }
            state.notice?.let { notice ->
                Text(
                    text = stringResource(notice.textRes()),
                    style = MaterialTheme.typography.bodySmall,
                    color = MeeshyPalette.Warning,
                    textAlign = TextAlign.Center,
                )
            }
        }
    }
}

private fun RitualNotice.textRes(): Int = when (this) {
    RitualNotice.BUSY -> R.string.circles_ritual_busy
    RitualNotice.OPEN_FAILED -> R.string.circles_ritual_open_failed
    RitualNotice.SEAL_FAILED -> R.string.circles_ritual_seal_failed
}

@Composable
private fun ConsentStep(controller: BloodRitualController, state: BloodRitualState) {
    val tokens = MeeshyTheme.tokens
    Text(
        text = stringResource(R.string.circles_ritual_consent_intro, controller.displayName),
        style = MaterialTheme.typography.bodyMedium,
        color = tokens.textSecondary,
    )
    RelationRitualConsentKey.entries.forEach { key ->
        val title = stringResource(key.titleRes())
        val detail = stringResource(key.detailRes())
        Column(modifier = Modifier.fillMaxWidth()) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 44.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(text = title, style = MaterialTheme.typography.bodyLarge, color = tokens.textPrimary, modifier = Modifier.weight(1f))
                Switch(
                    checked = state.consents.isGranted(key),
                    onCheckedChange = { controller.setConsent(key, it) },
                    modifier = Modifier.semantics { contentDescription = "$title. $detail" },
                )
            }
            Text(text = detail, style = MaterialTheme.typography.bodySmall, color = tokens.textMuted)
            ConsentFolding(stringResource(key.foldingRes(), controller.displayName))
        }
    }
    Text(
        text = stringResource(R.string.circles_ritual_consent_withdrawal),
        style = MaterialTheme.typography.bodySmall,
        color = tokens.textMuted,
    )
    Button(
        onClick = controller::proceedFromConsents,
        colors = ButtonDefaults.buttonColors(containerColor = MeeshyPalette.Indigo500),
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 44.dp),
    ) { Text(stringResource(R.string.circles_ritual_consent_continue)) }
}

/**
 * Le dépliant de chaque partage (#13942 § 6) — iso `BloodRitualConsentCopy` : ce que ça montre, à qui, combien de temps,
 * comment arrêter. Replié par défaut ; TalkBack annonce l'état déplié / replié et offre l'action inverse.
 */
@Composable
private fun ConsentFolding(text: String) {
    var open by rememberSaveable { mutableStateOf(false) }
    val title = stringResource(R.string.circles_ritual_consent_folding_title)
    Column(modifier = Modifier.fillMaxWidth()) {
        Text(
            text = title,
            style = MaterialTheme.typography.bodySmall,
            fontWeight = FontWeight.SemiBold,
            color = MeeshyTheme.tokens.textSecondary,
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = 44.dp)
                .clickable(role = Role.Button) { open = !open }
                .semantics {
                    if (open) collapse { open = false; true } else expand { open = true; true }
                }
                .padding(vertical = 12.dp),
        )
        if (open) {
            Text(text = text, style = MaterialTheme.typography.bodySmall, color = MeeshyTheme.tokens.textSecondary)
        }
    }
}

private fun RelationRitualConsentKey.foldingRes(): Int = when (this) {
    RelationRitualConsentKey.LISTENING_TITLE -> R.string.circles_ritual_consent_listening_title_folding
    RelationRitualConsentKey.LOCATION_LIVE -> R.string.circles_ritual_consent_location_live_folding
    RelationRitualConsentKey.LOCATION_HISTORY -> R.string.circles_ritual_consent_location_history_folding
    RelationRitualConsentKey.LOCATION_PROXIMITY -> R.string.circles_ritual_consent_location_proximity_folding
}

private fun RelationRitualConsentKey.titleRes(): Int = when (this) {
    RelationRitualConsentKey.LISTENING_TITLE -> R.string.circles_ritual_consent_listening_title
    RelationRitualConsentKey.LOCATION_LIVE -> R.string.circles_ritual_consent_location_live
    RelationRitualConsentKey.LOCATION_HISTORY -> R.string.circles_ritual_consent_location_history
    RelationRitualConsentKey.LOCATION_PROXIMITY -> R.string.circles_ritual_consent_location_proximity
}

private fun RelationRitualConsentKey.detailRes(): Int = when (this) {
    RelationRitualConsentKey.LISTENING_TITLE -> R.string.circles_ritual_consent_listening_title_detail
    RelationRitualConsentKey.LOCATION_LIVE -> R.string.circles_ritual_consent_location_live_detail
    RelationRitualConsentKey.LOCATION_HISTORY -> R.string.circles_ritual_consent_location_history_detail
    RelationRitualConsentKey.LOCATION_PROXIMITY -> R.string.circles_ritual_consent_location_proximity_detail
}

@Composable
private fun ReadyStep(controller: BloodRitualController, state: BloodRitualState) {
    if (state.otherIsWaiting) {
        Text(
            text = stringResource(R.string.circles_ritual_other_waiting, controller.displayName),
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.SemiBold,
            color = MeeshyTheme.tokens.textPrimary,
        )
    }
    Button(
        onClick = controller::open,
        enabled = state.stage == RitualStage.READY,
        colors = ButtonDefaults.buttonColors(containerColor = MeeshyPalette.Error),
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 44.dp),
    ) { Text(stringResource(R.string.circles_requests_ritual)) }
}

@Composable
private fun HoldStep(controller: BloodRitualController, state: BloodRitualState) {
    val caption = when {
        state.stage == RitualStage.SYNCHRONISED -> stringResource(R.string.circles_ritual_synchronised)
        state.stage == RitualStage.AWAITING_OTHER -> stringResource(R.string.circles_ritual_awaiting, controller.displayName)
        state.isHolding -> stringResource(R.string.circles_ritual_waiting_other, controller.displayName)
        else -> stringResource(R.string.circles_ritual_hold)
    }
    HoldRing(controller = controller, state = state)
    Text(
        text = caption,
        style = MaterialTheme.typography.bodyMedium,
        fontWeight = FontWeight.SemiBold,
        color = MeeshyTheme.tokens.textPrimary,
        textAlign = TextAlign.Center,
    )
    if (state.stage == RitualStage.WAITING) {
        Text(
            text = stringResource(R.string.circles_ritual_hold_hint),
            style = MaterialTheme.typography.bodySmall,
            color = MeeshyTheme.tokens.textMuted,
            textAlign = TextAlign.Center,
        )
    }
}

/** L'animation est coupée quand l'appareil a mis l'échelle des animations à zéro (équivalent du mouvement réduit). */
@Composable
private fun animationsEnabled(): Boolean {
    val resolver = LocalContext.current.contentResolver
    return remember(resolver) { Settings.Global.getFloat(resolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) != 0f }
}

/** L'anneau : il pulse tant qu'on attend l'autre, se remplit quand les deux tiennent. Tenir = appuyer sans lâcher. */
@Composable
private fun HoldRing(controller: BloodRitualController, state: BloodRitualState) {
    val animate = animationsEnabled()
    val holdLabel = stringResource(R.string.circles_ritual_hold)
    val holdAction = stringResource(R.string.circles_ritual_a11y_hold)
    val releaseAction = stringResource(R.string.circles_ritual_a11y_release)
    val target = when {
        state.isSynchronised -> 1f
        state.otherIsHolding -> 0.5f
        else -> 0.15f
    }
    val sweep by animateFloatAsState(targetValue = target, animationSpec = tween(if (animate) 350 else 0), label = "ritual-sweep")
    val pulse by rememberInfiniteTransition(label = "ritual-pulse").animateFloat(
        initialValue = 1f,
        targetValue = if (animate && !state.isHolding) 1.06f else 1f,
        animationSpec = infiniteRepeatable(tween(1_000), RepeatMode.Reverse),
        label = "ritual-pulse-scale",
    )
    val ringTint = MeeshyPalette.Error
    Box(
        modifier = Modifier
            .size(180.dp)
            .scale(pulse)
            .pointerInput(controller) {
                detectTapGestures(onPress = {
                    controller.holdBegan()
                    tryAwaitRelease()
                    controller.holdEnded()
                })
            }
            .semantics {
                role = Role.Button
                contentDescription = holdLabel
                customActions = listOf(
                    CustomAccessibilityAction(holdAction) { controller.holdBegan(); true },
                    CustomAccessibilityAction(releaseAction) { controller.holdEnded(); true },
                )
            },
        contentAlignment = Alignment.Center,
    ) {
        Canvas(modifier = Modifier.fillMaxSize()) {
            val stroke = 8.dp.toPx()
            val inset = stroke / 2
            val arcSize = Size(size.width - stroke, size.height - stroke)
            drawArc(
                color = ringTint.copy(alpha = 0.2f),
                startAngle = 0f,
                sweepAngle = 360f,
                useCenter = false,
                topLeft = Offset(inset, inset),
                size = arcSize,
                style = Stroke(width = stroke),
            )
            drawArc(
                color = ringTint,
                startAngle = -90f,
                sweepAngle = 360f * sweep,
                useCenter = false,
                topLeft = Offset(inset, inset),
                size = arcSize,
                style = Stroke(width = stroke, cap = StrokeCap.Round),
            )
        }
        Text(text = BLOOD_GLYPH, style = MaterialTheme.typography.displaySmall, modifier = Modifier.clearAndSetSemantics {})
    }
}

@Composable
private fun Outcome(icon: ImageVector?, tint: Color, text: String, retry: (() -> Unit)?, onClose: () -> Unit) {
    Column(
        modifier = Modifier.semantics(mergeDescendants = true) {},
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        if (icon == null) {
            Text(text = BLOOD_GLYPH, style = MaterialTheme.typography.displaySmall, modifier = Modifier.clearAndSetSemantics {})
        } else {
            Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(48.dp))
        }
        Text(text = text, style = MaterialTheme.typography.bodyLarge, color = MeeshyTheme.tokens.textPrimary, textAlign = TextAlign.Center)
        if (retry != null) {
            Button(
                onClick = retry,
                colors = ButtonDefaults.buttonColors(containerColor = MeeshyPalette.Indigo500),
                modifier = Modifier.heightIn(min = 44.dp),
            ) { Text(stringResource(R.string.circles_ritual_retry)) }
        }
        TextButton(onClick = onClose, modifier = Modifier.heightIn(min = 44.dp)) {
            Text(stringResource(R.string.circles_sheet_close))
        }
    }
}
