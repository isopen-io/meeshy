package me.meeshy.ui.component.audio

import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.background
import androidx.compose.runtime.Composable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.getValue
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import me.meeshy.sdk.model.MessageTranscriptionSegment
import me.meeshy.sdk.model.TranscriptionKaraokeResolver
import me.meeshy.sdk.model.fullscreen.AudioLyricsScroll
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing

/** La taille par défaut d'un segment (bulle, plein écran) ; le hero d'un réel audio en passe une plus grande. */
public val DefaultTranscriptionFontSize: TextUnit = 14.sp

/**
 * **La carte plein écran de la transcription** (iOS `MediaTranscriptionView`) : les segments coulent en texte, le segment
 * dit s'allume (résolu par `TranscriptionKaraokeResolver`, rien à l'arrêt) et la carte défile d'elle-même pour le garder
 * au centre ; un segment touché place la lecture à son début ([onSeek]). [activeIndex] peut être fourni par l'hôte qui l'a
 * déjà résolu ; sinon il l'est ici depuis [currentSeconds], [progress] et [isPlaying].
 *
 * Le segment dit se pose à la fraction [anchor] de la bande ([AudioLyricsScroll], iOS `scrollTo(anchor:)`) : 0,5 au centre
 * pour la carte, le premier tiers de la bande libre pour les paroles du plein écran. [contentPadding] réserve de la marge
 * AUTOUR du texte, dans le défilement (le texte commence sous l'en-tête, puis remonte derrière lui) ; [fillHeight] prend toute
 * la hauteur offerte au lieu de [maxHeight].
 */
@Composable
public fun MediaTranscriptionView(
    segments: List<MessageTranscriptionSegment>,
    currentSeconds: Double,
    isPlaying: Boolean,
    accent: Color,
    ink: Color,
    modifier: Modifier = Modifier,
    progress: Double = 0.0,
    fontSize: TextUnit = DefaultTranscriptionFontSize,
    maxHeight: Float = DEFAULT_MAX_HEIGHT_DP,
    showsBackground: Boolean = true,
    activeIndex: Int? = null,
    onSeek: ((Double) -> Unit)? = null,
    contentPadding: PaddingValues = PaddingValues(),
    anchor: Float = CENTER_ANCHOR,
    fillHeight: Boolean = false,
) {
    val lit = activeIndex ?: TranscriptionKaraokeResolver.activeSegmentIndex(segments, currentSeconds, progress, isPlaying)
    val scroll = rememberScrollState()
    var viewport by remember { mutableIntStateOf(0) }
    var activeTop by remember { mutableFloatStateOf(0f) }
    var activeHeight by remember { mutableFloatStateOf(0f) }
    val reduceMotion = LocalReduceMotion.current
    val density = LocalDensity.current
    val leadingEdge = with(density) { (contentPadding.calculateTopPadding() + MeeshySpacing.sm).toPx() }
    LaunchedEffect(lit, activeTop, activeHeight, viewport, anchor, leadingEdge) {
        if (lit == null) return@LaunchedEffect
        val target = AudioLyricsScroll.target(
            itemTop = leadingEdge + activeTop,
            itemHeight = activeHeight,
            viewport = viewport.toFloat(),
            anchor = anchor,
            maxScroll = scroll.maxValue,
        )
        if (reduceMotion) scroll.scrollTo(target) else scroll.animateScrollTo(target, tween(SCROLL_MILLIS))
    }
    Box(
        modifier = modifier
            .fillMaxWidth()
            .then(if (fillHeight) Modifier.fillMaxSize() else Modifier.heightIn(max = maxHeight.dp))
            .clip(RoundedCornerShape(MeeshyRadius.smPlus))
            .then(if (showsBackground) Modifier.background(ink.copy(alpha = BACKGROUND_ALPHA)) else Modifier)
            .onSizeChanged { viewport = it.height }
            .verticalScroll(scroll),
    ) {
        AudioKaraokeFlow(
            segments = segments,
            activeIndex = lit,
            accent = accent,
            ink = ink,
            fontSize = fontSize,
            onSeek = { seconds -> onSeek?.invoke(seconds) },
            onActiveBounds = { top, height ->
                activeTop = top
                activeHeight = height
            },
            modifier = Modifier
                .fillMaxWidth()
                .padding(contentPadding)
                .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.sm),
        )
    }
}

private const val DEFAULT_MAX_HEIGHT_DP = 200f
private const val CENTER_ANCHOR = 0.5f
private const val SCROLL_MILLIS = 300
private const val BACKGROUND_ALPHA = 0.04f
