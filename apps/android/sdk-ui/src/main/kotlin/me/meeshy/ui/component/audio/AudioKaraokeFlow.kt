package me.meeshy.ui.component.audio

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInParent
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import me.meeshy.sdk.model.MessageTranscriptionSegment
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.theme.MeeshyMotion
import me.meeshy.ui.theme.MeeshyRadius

/** Où en est un segment par rapport à celui qui est dit : allumé, déjà dit, ou à venir (tout est « à venir » à l'arrêt). */
internal enum class KaraokeSegmentPhase { Active, Past, Ahead }

internal fun karaokeSegmentPhase(index: Int, activeIndex: Int?): KaraokeSegmentPhase = when {
    index == activeIndex -> KaraokeSegmentPhase.Active
    activeIndex != null && index < activeIndex -> KaraokeSegmentPhase.Past
    else -> KaraokeSegmentPhase.Ahead
}

/** Les trois encres du karaoké (iOS `inlineSegmentColor`) : actif en accent, passé atténué, futur secondaire. */
@Immutable
internal data class KaraokeInk(val active: Color, val past: Color, val ahead: Color) {
    fun of(phase: KaraokeSegmentPhase): Color = when (phase) {
        KaraokeSegmentPhase.Active -> active
        KaraokeSegmentPhase.Past -> past
        KaraokeSegmentPhase.Ahead -> ahead
    }

    companion object {
        fun of(accent: Color, ink: Color): KaraokeInk = KaraokeInk(active = accent, past = ink.copy(alpha = 0.7f), ahead = ink.copy(alpha = 0.35f))
    }
}

/**
 * **Le flux karaoké** (iOS `inlineFlowTranscription` / `MediaTranscriptionView.flowTranscription`) : les segments de la
 * transcription coulent comme du texte, chacun tappable (haptique légère, [onSeek] vers son `startTime`). Le segment
 * [activeIndex] — résolu par `TranscriptionKaraokeResolver`, `null` à l'arrêt — passe en accent gras sur un fond léger et
 * grossit un peu ; Réduire les animations supprime l'échelle et l'élévation et garde couleur et graisse. [onActiveBounds]
 * rend le haut et la hauteur MESURÉE du segment allumé : le défilement des paroles place son milieu sur l'ancre.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
public fun AudioKaraokeFlow(
    segments: List<MessageTranscriptionSegment>,
    activeIndex: Int?,
    accent: Color,
    ink: Color,
    onSeek: (Double) -> Unit,
    modifier: Modifier = Modifier,
    fontSize: TextUnit = 14.sp,
    onActivePlaced: ((Float) -> Unit)? = null,
    onActiveBounds: ((top: Float, height: Float) -> Unit)? = null,
) {
    val colors = KaraokeInk.of(accent, ink)
    val haptics = rememberMeeshyHaptics()
    val seek by rememberUpdatedState(onSeek)
    FlowRow(modifier = modifier) {
        segments.forEachIndexed { index, segment ->
            val phase = karaokeSegmentPhase(index, activeIndex)
            KaraokeSegment(
                text = segment.text,
                phase = phase,
                colors = colors,
                accent = accent,
                fontSize = fontSize,
                onClick = {
                    haptics.light()
                    seek(segment.startTime ?: 0.0)
                },
                onPlaced = if (phase == KaraokeSegmentPhase.Active && (onActivePlaced != null || onActiveBounds != null)) {
                    { top, height ->
                        onActivePlaced?.invoke(top)
                        onActiveBounds?.invoke(top, height)
                    }
                } else {
                    null
                },
            )
        }
    }
}

@Composable
private fun KaraokeSegment(
    text: String,
    phase: KaraokeSegmentPhase,
    colors: KaraokeInk,
    accent: Color,
    fontSize: TextUnit,
    onClick: () -> Unit,
    onPlaced: ((top: Float, height: Float) -> Unit)?,
) {
    val active = phase == KaraokeSegmentPhase.Active
    val reduceMotion = LocalReduceMotion.current
    val wave = active && !reduceMotion
    val scale by animateFloatAsState(
        targetValue = if (wave) ACTIVE_SCALE else 1f,
        animationSpec = if (reduceMotion) tween<Float>(REDUCED_MILLIS) else MeeshyMotion.springFast<Float>(),
        label = "karaokeSegmentScale",
    )
    val background by animateFloatAsState(
        targetValue = if (active) ACTIVE_BACKGROUND_ALPHA else 0f,
        animationSpec = tween<Float>(REDUCED_MILLIS),
        label = "karaokeSegmentBackground",
    )
    Text(
        text = "$text ",
        color = colors.of(phase),
        fontSize = fontSize,
        fontWeight = if (active) FontWeight.Bold else FontWeight.Normal,
        modifier = Modifier
            .graphicsLayer {
                scaleX = scale
                scaleY = scale
                translationY = if (wave) -LIFT_PX * ((scale - 1f) / (ACTIVE_SCALE - 1f)).coerceIn(0f, 1f) else 0f
                transformOrigin = TransformOrigin(0.5f, 1f)
            }
            .clip(RoundedCornerShape(MeeshyRadius.xxs))
            .background(accent.copy(alpha = background))
            .clickable(role = Role.Button, onClick = onClick)
            .then(if (onPlaced != null) Modifier.onGloballyPositioned { onPlaced(it.positionInParent().y, it.size.height.toFloat()) } else Modifier)
            .padding(horizontal = if (active) 3.dp else 0.dp, vertical = if (active) 1.dp else 0.dp),
    )
}

private const val ACTIVE_SCALE = 1.08f
private const val ACTIVE_BACKGROUND_ALPHA = 0.16f
private const val LIFT_PX = 3f
private const val REDUCED_MILLIS = 150
