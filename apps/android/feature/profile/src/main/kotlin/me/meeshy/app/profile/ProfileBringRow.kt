package me.meeshy.app.profile

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.delay
import me.meeshy.sdk.model.relation.BringAvailability
import me.meeshy.ui.R as UiR
import me.meeshy.ui.component.MeeshyInfoNote
import me.meeshy.ui.component.MeeshyInfoNoted
import me.meeshy.ui.component.bring.BringConfirmDialog
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

internal const val PROFILE_BRING_SEND_TAG = "bring.send"
internal const val PROFILE_BRING_CANCEL_TAG = "bring.cancel"

/** Le temps pendant lequel un refus reste dit sous la ligne avant de s'effacer. */
private const val NOTICE_VISIBLE_MS = 4_000L

/**
 * La ligne du Bring sous le cercle d'une fiche (#16617) — iso `ProfileBringRow.swift`. Rien tant que la passerelle ne
 * l'ouvre pas : ni bouton grisé, ni raison.
 */
@Composable
internal fun ProfileBringRow(
    userId: String,
    displayName: String,
    viewModel: ProfileBringViewModel = hiltViewModel(key = "bring-$userId"),
) {
    LaunchedEffect(userId) { viewModel.load(userId) }
    val state by viewModel.state.collectAsStateWithLifecycle()
    val availability = state.availability?.takeIf { state.isOffered } ?: return
    var confirming by rememberSaveable(userId) { mutableStateOf(false) }
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(MeeshyPalette.Error.copy(alpha = 0.08f))
            .padding(MeeshySpacing.md),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        BringExplanation()
        when {
            state.ringing != null -> RingingLine(displayName, onCancel = viewModel::cancel)
            availability.isExhausted -> Text(
                text = stringResource(UiR.string.bring_quota, displayName),
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.SemiBold,
                color = MeeshyTheme.tokens.textPrimary,
            )
            else -> SendLine(availability, displayName, isSending = state.isSending, onSend = { confirming = true })
        }
        state.notice?.let { notice -> NoticeLine(notice, displayName, onShown = viewModel::consumeNotice) }
    }
    if (confirming) {
        BringConfirmDialog(
            name = displayName,
            onConfirm = {
                confirming = false
                viewModel.send()
            },
            onDismiss = { confirming = false },
        )
    }
}

/**
 * Ce qu'est le Bring, VISIBLE au repos (repère propre à Meeshy, règle 7 de l'épure #17584) ; seul le cas limite
 * — un iPhone en silencieux — passe derrière un (i) dont le nom est la question.
 */
@Composable
internal fun BringExplanation() {
    var openNote by rememberSaveable { mutableStateOf<String?>(null) }
    MeeshyInfoNoted(
        note = MeeshyInfoNote(
            question = stringResource(UiR.string.bring_silent_question),
            text = stringResource(UiR.string.bring_silent_note),
        ),
        openNoteId = openNote,
        onOpenNoteIdChange = { openNote = it },
        modifier = Modifier.fillMaxWidth(),
        tint = MeeshyTheme.tokens.textSecondary,
    ) {
        Text(
            text = stringResource(UiR.string.bring_explain),
            style = MaterialTheme.typography.bodySmall,
            color = MeeshyTheme.tokens.textSecondary,
        )
    }
}

@Composable
private fun SendLine(availability: BringAvailability, name: String, isSending: Boolean, onSend: () -> Unit) {
    val haptics = rememberMeeshyHaptics()
    val remaining = availability.remainingToday
    val a11y = stringResource(UiR.string.bring_confirm_title, name)
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md)) {
        Text(
            text = if (remaining == null) {
                stringResource(UiR.string.bring_unlimited)
            } else {
                stringResource(UiR.string.bring_remaining, remaining)
            },
            style = MaterialTheme.typography.bodySmall,
            color = MeeshyTheme.tokens.textSecondary,
            modifier = Modifier.weight(1f),
        )
        Text(
            text = "🔔 " + stringResource(UiR.string.bring_action),
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.Bold,
            color = Color.White,
            modifier = Modifier
                .heightIn(min = 48.dp)
                .clip(CircleShape)
                .background(MeeshyPalette.Error.copy(alpha = if (isSending) 0.6f else 1f))
                .clickable(enabled = !isSending, role = Role.Button) {
                    haptics.medium()
                    onSend()
                }
                .semantics { contentDescription = a11y }
                .testTag(PROFILE_BRING_SEND_TAG)
                .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.md),
        )
    }
}

@Composable
private fun RingingLine(name: String, onCancel: () -> Unit) {
    val haptics = rememberMeeshyHaptics()
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md)) {
        Text(
            text = "🔔 " + stringResource(UiR.string.bring_ringing, name),
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.SemiBold,
            color = MeeshyTheme.tokens.textPrimary,
            modifier = Modifier
                .weight(1f)
                .semantics { liveRegion = LiveRegionMode.Polite },
        )
        Text(
            text = stringResource(UiR.string.bring_cancel),
            style = MaterialTheme.typography.bodySmall,
            fontWeight = FontWeight.SemiBold,
            color = MeeshyPalette.Error,
            modifier = Modifier
                .heightIn(min = 48.dp)
                .clickable(role = Role.Button) {
                    haptics.medium()
                    onCancel()
                }
                .testTag(PROFILE_BRING_CANCEL_TAG)
                .padding(horizontal = MeeshySpacing.sm, vertical = MeeshySpacing.md),
        )
    }
}

@Composable
private fun NoticeLine(notice: BringNotice, name: String, onShown: () -> Unit) {
    LaunchedEffect(notice) {
        delay(NOTICE_VISIBLE_MS)
        onShown()
    }
    val text = when (notice) {
        BringNotice.QUOTA -> stringResource(UiR.string.bring_quota, name)
        BringNotice.OFFLINE -> stringResource(UiR.string.bring_offline)
        BringNotice.FAILED -> stringResource(UiR.string.bring_failed)
    }
    Text(
        text = text,
        style = MaterialTheme.typography.bodySmall,
        color = MeeshyPalette.Error,
        modifier = Modifier.semantics { liveRegion = LiveRegionMode.Assertive },
    )
}
