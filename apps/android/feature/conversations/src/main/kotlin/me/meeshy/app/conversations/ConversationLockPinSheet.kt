package me.meeshy.app.conversations

import androidx.annotation.StringRes
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Backspace
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.LockOpen
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import me.meeshy.feature.conversations.R
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/** Title string resource for a [LockPinCopy] — pure mapping the sheet renders. */
@StringRes
internal fun LockPinCopy.titleRes(): Int = when (this) {
    LockPinCopy.CREATE_MASTER_PIN -> R.string.conversations_lock_title_create_master
    LockPinCopy.CONFIRM_MASTER_PIN -> R.string.conversations_lock_title_confirm_master
    LockPinCopy.VERIFY_MASTER_PIN -> R.string.conversations_lock_title_verify_master
    LockPinCopy.ENTER_CODE -> R.string.conversations_lock_title_enter_code
    LockPinCopy.CONFIRM_CODE -> R.string.conversations_lock_title_confirm_code
    LockPinCopy.UNLOCK -> R.string.conversations_lock_title_unlock
    LockPinCopy.OPEN -> R.string.conversations_lock_title_open
}

/** Whether a [LockPinCopy]'s subtitle interpolates the conversation name. */
internal fun LockPinCopy.subtitleTakesName(): Boolean = when (this) {
    LockPinCopy.ENTER_CODE, LockPinCopy.CONFIRM_CODE, LockPinCopy.UNLOCK, LockPinCopy.OPEN -> true
    else -> false
}

@StringRes
private fun LockPinCopy.subtitleRes(): Int = when (this) {
    LockPinCopy.CREATE_MASTER_PIN -> R.string.conversations_lock_subtitle_create_master
    LockPinCopy.CONFIRM_MASTER_PIN -> R.string.conversations_lock_subtitle_confirm_master
    LockPinCopy.VERIFY_MASTER_PIN -> R.string.conversations_lock_subtitle_verify_master
    LockPinCopy.ENTER_CODE -> R.string.conversations_lock_subtitle_enter_code
    LockPinCopy.CONFIRM_CODE -> R.string.conversations_lock_subtitle_confirm_code
    LockPinCopy.UNLOCK -> R.string.conversations_lock_subtitle_unlock
    LockPinCopy.OPEN -> R.string.conversations_lock_subtitle_open
}

@StringRes
private fun LockPinError.messageRes(): Int = when (this) {
    LockPinError.MASTER_PIN_INCORRECT -> R.string.conversations_lock_error_master_incorrect
    LockPinError.PIN_MISMATCH -> R.string.conversations_lock_error_pin_mismatch
    LockPinError.CODE_MISMATCH -> R.string.conversations_lock_error_code_mismatch
    LockPinError.CODE_INCORRECT -> R.string.conversations_lock_error_code_incorrect
}

/**
 * The conversation-lock PIN sheet — a dumb renderer of [prompt]. All decisions live in
 * [LockPinReducer]; this only draws the dots/keypad and forwards taps. The accent gradient
 * matches the app's indigo identity; the "unlocked" glyph on the unlock flow signals the
 * outcome without a second color.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun ConversationLockPinSheet(
    prompt: LockPinState,
    conversationName: String,
    onDigit: (Int) -> Unit,
    onDelete: () -> Unit,
    onDismiss: () -> Unit,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = MeeshyTheme.tokens.backgroundSecondary,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.md),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.lg),
        ) {
            Icon(
                imageVector = if (prompt.copy == LockPinCopy.UNLOCK) Icons.Filled.LockOpen else Icons.Filled.Lock,
                contentDescription = null,
                tint = MeeshyPalette.Indigo500,
                modifier = Modifier.size(44.dp),
            )
            Text(
                text = stringResource(prompt.copy.titleRes()),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                color = MeeshyTheme.tokens.textPrimary,
            )
            Text(
                text = if (prompt.copy.subtitleTakesName()) {
                    stringResource(prompt.copy.subtitleRes(), conversationName)
                } else {
                    stringResource(prompt.copy.subtitleRes())
                },
                style = MaterialTheme.typography.bodySmall,
                color = MeeshyTheme.tokens.textSecondary,
            )
            PinDotsRow(filled = prompt.filledCount, total = prompt.pinLength)
            prompt.error?.let { error ->
                Text(
                    text = stringResource(error.messageRes()),
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = MeeshyTheme.tokens.error,
                )
            }
            PinNumpad(
                deleteEnabled = prompt.filledCount > 0,
                onDigit = onDigit,
                onDelete = onDelete,
            )
        }
    }
}

@Composable
private fun PinDotsRow(filled: Int, total: Int) {
    val a11y = stringResource(R.string.conversations_lock_dots_a11y, filled, total)
    Row(
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
        modifier = Modifier.clearAndSetSemantics { contentDescription = a11y },
    ) {
        repeat(total) { index ->
            Box(
                modifier = Modifier
                    .size(16.dp)
                    .clip(CircleShape)
                    .background(
                        if (index < filled) MeeshyPalette.Indigo500
                        else MeeshyTheme.tokens.textSecondary.copy(alpha = 0.25f),
                    ),
            )
        }
    }
}

@Composable
private fun PinNumpad(
    deleteEnabled: Boolean,
    onDigit: (Int) -> Unit,
    onDelete: () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
        listOf(listOf(1, 2, 3), listOf(4, 5, 6), listOf(7, 8, 9)).forEach { rowDigits ->
            Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md)) {
                rowDigits.forEach { digit -> NumpadKey(label = digit.toString()) { onDigit(digit) } }
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md)) {
            Box(modifier = Modifier.size(64.dp))
            NumpadKey(label = "0") { onDigit(0) }
            NumpadDeleteKey(enabled = deleteEnabled, onDelete = onDelete)
        }
    }
}

@Composable
private fun NumpadKey(label: String, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .size(64.dp)
            .clip(CircleShape)
            .background(MeeshyTheme.tokens.backgroundTertiary)
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = label,
            fontSize = 24.sp,
            fontWeight = FontWeight.Medium,
            color = MeeshyTheme.tokens.textPrimary,
        )
    }
}

@Composable
private fun NumpadDeleteKey(enabled: Boolean, onDelete: () -> Unit) {
    val description = stringResource(R.string.conversations_lock_delete_digit)
    Box(
        modifier = Modifier
            .size(64.dp)
            .clip(CircleShape)
            .clickable(enabled = enabled, onClick = onDelete)
            .clearAndSetSemantics { contentDescription = description },
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = Icons.AutoMirrored.Filled.Backspace,
            contentDescription = null,
            tint = if (enabled) MeeshyTheme.tokens.textPrimary else MeeshyTheme.tokens.textSecondary.copy(alpha = 0.3f),
            modifier = Modifier.size(24.dp),
        )
    }
}
