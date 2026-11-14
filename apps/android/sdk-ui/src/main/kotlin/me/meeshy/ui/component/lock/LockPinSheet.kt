package me.meeshy.ui.component.lock

import me.meeshy.ui.icons.MeeshyIcons
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/** Libelles deja resolus de la feuille de code : le module appelant porte ses chaines. */
public data class LockPinSheetTexts(
    val title: String,
    val subtitle: String,
    val errorText: String?,
    val dotsDescription: String,
    val deleteDescription: String,
)

/**
 * Feuille de saisie de code partagee (verrou de conversation, code maitre) : points, pave numerique,
 * secousse + haptique d'erreur et saisie remise a zero par l'appelant. Pur rendu : toute decision
 * vit dans le reducteur de [me.meeshy.sdk.model.lock.LockPinState].
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
public fun LockPinSheet(
    texts: LockPinSheetTexts,
    filledCount: Int,
    pinLength: Int,
    opensLock: Boolean,
    onDigit: (Int) -> Unit,
    onDelete: () -> Unit,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
    accent: Color = MeeshyPalette.Indigo500,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = MeeshyTheme.tokens.backgroundSecondary,
        modifier = modifier,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.md),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.lg),
        ) {
            Icon(
                imageVector = if (opensLock) MeeshyIcons.LockOpenFilled else MeeshyIcons.LockFilled,
                contentDescription = null,
                tint = accent,
                modifier = Modifier.size(44.dp),
            )
            Text(
                text = texts.title,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                color = MeeshyTheme.tokens.textPrimary,
            )
            if (texts.subtitle.isNotBlank()) {
                Text(
                    text = texts.subtitle,
                    style = MaterialTheme.typography.bodySmall,
                    color = MeeshyTheme.tokens.textSecondary,
                )
            }
            ShakingDots(filled = filledCount, total = pinLength, texts = texts, accent = accent)
            texts.errorText?.let { message ->
                Text(
                    text = message,
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = MeeshyTheme.tokens.error,
                )
            }
            PinNumpad(
                deleteEnabled = filledCount > 0,
                deleteDescription = texts.deleteDescription,
                onDigit = onDigit,
                onDelete = onDelete,
            )
        }
    }
}

/** Secousse horizontale + haptique d'erreur a chaque nouvelle erreur ; fondu discret si animations reduites. */
@Composable
private fun ShakingDots(filled: Int, total: Int, texts: LockPinSheetTexts, accent: Color) {
    val shake = remember { Animatable(0f) }
    val haptics = rememberMeeshyHaptics()
    val reduceMotion = LocalReduceMotion.current
    LaunchedEffect(texts.errorText) {
        if (texts.errorText == null) return@LaunchedEffect
        haptics.error()
        if (reduceMotion) return@LaunchedEffect
        SHAKE_KEYFRAMES.forEach { target -> shake.animateTo(target, tween(durationMillis = 45)) }
        shake.snapTo(0f)
    }
    Row(
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
        modifier = Modifier
            .offset { IntOffset(shake.value.dp.roundToPx(), 0) }
            .clearAndSetSemantics { contentDescription = texts.dotsDescription },
    ) {
        repeat(total) { index ->
            Box(
                modifier = Modifier
                    .size(16.dp)
                    .clip(CircleShape)
                    .background(
                        if (index < filled) accent
                        else MeeshyTheme.tokens.textSecondary.copy(alpha = 0.25f),
                    ),
            )
        }
    }
}

private val SHAKE_KEYFRAMES = listOf(-10f, 10f, -8f, 8f, -4f, 4f, 0f)

@Composable
private fun PinNumpad(
    deleteEnabled: Boolean,
    deleteDescription: String,
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
            NumpadDeleteKey(enabled = deleteEnabled, description = deleteDescription, onDelete = onDelete)
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
private fun NumpadDeleteKey(enabled: Boolean, description: String, onDelete: () -> Unit) {
    Box(
        modifier = Modifier
            .size(64.dp)
            .clip(CircleShape)
            .clickable(enabled = enabled, onClick = onDelete)
            .clearAndSetSemantics { contentDescription = description },
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = MeeshyIcons.Backspace,
            contentDescription = null,
            tint = if (enabled) MeeshyTheme.tokens.textPrimary else MeeshyTheme.tokens.textSecondary.copy(alpha = 0.3f),
            modifier = Modifier.size(24.dp),
        )
    }
}
