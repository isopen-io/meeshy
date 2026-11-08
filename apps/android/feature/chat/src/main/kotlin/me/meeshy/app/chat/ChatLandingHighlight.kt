package me.meeshy.app.chat

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.graphics.Color
import kotlinx.coroutines.delay

/**
 * #14670 — the message a conversation was opened ON is lit for an instant behind its row, in the
 * conversation's accent: a tint that rises, holds, then fades (iOS and web flash the landed bubble).
 */
@Composable
internal fun LandingHighlight(accentColor: Color, content: @Composable () -> Unit) {
    val alpha = remember { Animatable(0f) }
    LaunchedEffect(Unit) {
        alpha.animateTo(PEAK_ALPHA, tween(RISE_MS))
        delay(HOLD_MS)
        alpha.animateTo(0f, tween(FADE_MS))
    }
    Box(Modifier.fillMaxWidth().drawBehind { drawRect(accentColor.copy(alpha = alpha.value)) }) {
        content()
    }
}

private const val PEAK_ALPHA = 0.22f
private const val RISE_MS = 200
private const val HOLD_MS = 800L
private const val FADE_MS = 700
