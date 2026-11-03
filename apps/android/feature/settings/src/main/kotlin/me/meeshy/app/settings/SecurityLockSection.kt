package me.meeshy.app.settings

import androidx.annotation.StringRes
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.settings.R
import me.meeshy.sdk.model.lock.LockPinCopy
import me.meeshy.sdk.model.lock.LockPinError
import me.meeshy.sdk.model.lock.LockPinState
import me.meeshy.sdk.model.lock.LockSectionAction
import me.meeshy.sdk.model.lock.LockSectionPresentation
import me.meeshy.ui.component.chrome.MeeshyGlassSurface
import me.meeshy.ui.component.lock.LockPinSheet
import me.meeshy.ui.component.lock.LockPinSheetTexts
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/** Section « Conversations verrouillées » de Sécurité (iOS `conversationLockSection`, teinte F87171 = [MeeshyPalette.Error]). */
@Composable
internal fun SecurityLockSection(viewModel: SecurityLockViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    SecurityLockSectionContent(
        presentation = state.presentation,
        onAction = { viewModel.onEvent(SecurityLockUiEvent.ActionTapped(it)) },
    )
    state.prompt?.let { prompt ->
        SecurityLockPinSheet(
            prompt = prompt,
            onDigit = { viewModel.onEvent(SecurityLockUiEvent.Digit(it)) },
            onDelete = { viewModel.onEvent(SecurityLockUiEvent.Delete) },
            onDismiss = { viewModel.onEvent(SecurityLockUiEvent.DismissPrompt) },
        )
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun SecurityLockSectionContent(
    presentation: LockSectionPresentation,
    onAction: (LockSectionAction) -> Unit,
) {
    val tint = MeeshyPalette.Error
    Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.semantics { heading() }) {
            Icon(MeeshyIcons.LockFilled, contentDescription = null, tint = tint, modifier = Modifier.size(18.dp))
            Spacer(Modifier.size(MeeshySpacing.sm))
            Text(
                text = stringResource(R.string.security_lock_section).uppercase(),
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.Bold,
                color = tint,
            )
        }
        MeeshyGlassSurface(
            shape = RoundedCornerShape(MeeshyRadius.lg),
            modifier = Modifier.fillMaxWidth(),
        ) {
            Column(modifier = Modifier.padding(MeeshySpacing.lg), verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md)) {
                LockStatusRow(presentation, tint)
                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
                    verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
                ) {
                    presentation.actions.forEach { action ->
                        LockActionCapsule(action, presentation.lockCount, onClick = { onAction(action) })
                    }
                }
            }
        }
    }
}

@Composable
private fun LockStatusRow(presentation: LockSectionPresentation, tint: Color) {
    val stateText = stringResource(
        if (presentation.hasMasterPin) R.string.security_lock_configured else R.string.security_lock_not_configured,
    )
    val badgeText = "${presentation.lockCount} ${stringResource(R.string.security_lock_locks)}"
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .fillMaxWidth()
            .semantics(mergeDescendants = true) {
                stateDescription = if (presentation.showLockBadge) "$stateText, $badgeText" else stateText
            },
    ) {
        Icon(MeeshyIcons.LockFilled, contentDescription = null, tint = tint, modifier = Modifier.size(28.dp))
        Spacer(Modifier.size(MeeshySpacing.sm))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                stringResource(R.string.security_lock_master_pin),
                style = MaterialTheme.typography.labelSmall,
                color = MeeshyTheme.tokens.textMuted,
            )
            Text(
                stateText,
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Medium,
                color = if (presentation.hasMasterPin) MeeshyPalette.Success else MeeshyTheme.tokens.textMuted,
            )
        }
        if (presentation.hasMasterPin) {
            if (presentation.showLockBadge) {
                Text(
                    text = badgeText,
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.SemiBold,
                    color = MeeshyPalette.Error,
                    modifier = Modifier
                        .clip(CircleShape)
                        .background(MeeshyPalette.Error.copy(alpha = 0.15f))
                        .padding(horizontal = MeeshySpacing.sm, vertical = 2.dp),
                )
                Spacer(Modifier.size(MeeshySpacing.sm))
            }
            Icon(MeeshyIcons.CheckCircleFilled, contentDescription = null, tint = MeeshyPalette.Success, modifier = Modifier.size(20.dp))
        }
    }
}

@Composable
private fun LockActionCapsule(action: LockSectionAction, lockCount: Int, onClick: () -> Unit) {
    val haptics = rememberMeeshyHaptics()
    val style = when (action) {
        LockSectionAction.CONFIGURE -> CapsuleStyle(MeeshyIcons.AddCircleFilled, Color.White, MeeshyPalette.Error, medium = true)
        LockSectionAction.CHANGE -> CapsuleStyle(MeeshyIcons.EditFilled, MeeshyPalette.Error, MeeshyPalette.Error.copy(alpha = 0.15f), medium = false)
        LockSectionAction.UNLOCK_ALL -> CapsuleStyle(MeeshyIcons.LockOpenFilled, Color.White, MeeshyPalette.Warning, medium = true)
        LockSectionAction.REMOVE -> CapsuleStyle(MeeshyIcons.DeleteFilled, MeeshyPalette.Error, MeeshyPalette.Error.copy(alpha = 0.10f), medium = true)
    }
    val label = when (action) {
        LockSectionAction.CONFIGURE -> stringResource(R.string.security_lock_configure)
        LockSectionAction.CHANGE -> stringResource(R.string.common_edit)
        LockSectionAction.UNLOCK_ALL -> "${stringResource(R.string.security_lock_unlock_all)} ($lockCount)"
        LockSectionAction.REMOVE -> stringResource(R.string.common_delete)
    }
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .heightIn(min = 48.dp)
            .clip(CircleShape)
            .background(style.background)
            .clickable(role = Role.Button) {
                if (style.medium) haptics.medium() else haptics.light()
                onClick()
            }
            .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.sm),
    ) {
        Icon(style.icon, contentDescription = null, tint = style.content, modifier = Modifier.size(16.dp))
        Spacer(Modifier.size(MeeshySpacing.xs))
        Text(label, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold, color = style.content)
    }
}

private data class CapsuleStyle(val icon: ImageVector, val content: Color, val background: Color, val medium: Boolean)

@Composable
private fun SecurityLockPinSheet(
    prompt: LockPinState,
    onDigit: (Int) -> Unit,
    onDelete: () -> Unit,
    onDismiss: () -> Unit,
) {
    val copy = prompt.copy
    val texts = LockPinSheetTexts(
        title = stringResource(copy.lockTitleRes()),
        subtitle = stringResource(copy.lockSubtitleRes()),
        errorText = prompt.error?.let { stringResource(it.lockMessageRes()) },
        dotsDescription = stringResource(R.string.security_lock_dots_a11y, prompt.filledCount, prompt.pinLength),
        deleteDescription = stringResource(R.string.security_lock_delete_digit),
    )
    LockPinSheet(
        texts = texts,
        filledCount = prompt.filledCount,
        pinLength = prompt.pinLength,
        opensLock = copy == LockPinCopy.UNLOCK_ALL || copy == LockPinCopy.REMOVE_MASTER_PIN,
        onDigit = onDigit,
        onDelete = onDelete,
        onDismiss = onDismiss,
        accent = MeeshyPalette.Error,
    )
}

@StringRes
internal fun LockPinCopy.lockTitleRes(): Int = when (this) {
    LockPinCopy.CREATE_MASTER_PIN -> R.string.security_lock_title_create_master
    LockPinCopy.CONFIRM_MASTER_PIN -> R.string.security_lock_title_confirm_master
    LockPinCopy.CHANGE_VERIFY_MASTER_PIN, LockPinCopy.VERIFY_MASTER_PIN -> R.string.security_lock_title_verify_master
    LockPinCopy.NEW_MASTER_PIN -> R.string.security_lock_title_new_master
    LockPinCopy.CONFIRM_NEW_MASTER_PIN -> R.string.security_lock_title_confirm_new
    LockPinCopy.REMOVE_MASTER_PIN -> R.string.security_lock_title_remove_master
    LockPinCopy.UNLOCK_ALL, LockPinCopy.ENTER_CODE, LockPinCopy.CONFIRM_CODE, LockPinCopy.UNLOCK, LockPinCopy.OPEN ->
        R.string.security_lock_title_unlock_all
}

@StringRes
internal fun LockPinCopy.lockSubtitleRes(): Int = when (this) {
    LockPinCopy.CREATE_MASTER_PIN -> R.string.security_lock_subtitle_create_master
    LockPinCopy.CONFIRM_MASTER_PIN -> R.string.security_lock_subtitle_confirm_master
    LockPinCopy.CHANGE_VERIFY_MASTER_PIN, LockPinCopy.VERIFY_MASTER_PIN -> R.string.security_lock_subtitle_change_verify
    LockPinCopy.NEW_MASTER_PIN -> R.string.security_lock_subtitle_new_master
    LockPinCopy.CONFIRM_NEW_MASTER_PIN -> R.string.security_lock_subtitle_confirm_new
    LockPinCopy.REMOVE_MASTER_PIN -> R.string.security_lock_subtitle_remove_master
    LockPinCopy.UNLOCK_ALL, LockPinCopy.ENTER_CODE, LockPinCopy.CONFIRM_CODE, LockPinCopy.UNLOCK, LockPinCopy.OPEN ->
        R.string.security_lock_subtitle_unlock_all
}

@StringRes
internal fun LockPinError.lockMessageRes(): Int = when (this) {
    LockPinError.MASTER_PIN_INCORRECT, LockPinError.CODE_INCORRECT -> R.string.security_lock_error_master_incorrect
    LockPinError.PIN_MISMATCH, LockPinError.CODE_MISMATCH -> R.string.security_lock_error_pin_mismatch
}
